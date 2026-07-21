import {can,getAccessContext,recordAudit} from "../../access-control";
import {requireApiAccess} from "../../api-auth";
import {getD1} from "../../../db";

const error=(message:string,status:number)=>Response.json({error:message},{status});
const key=(value:unknown)=>{const result=String(value||"").trim();if(result.length<8||result.length>100)throw new Error("IDEMPOTENCY_KEY_REQUIRED");return result};
const quantity=(value:unknown)=>{const result=Number(value);if(!Number.isInteger(result)||result<1)throw new Error("INVALID_QUANTITY");return result};
type ShipmentItemInput={lotId?:number;quantity?:number};

export async function GET(){
  const denied=await requireApiAccess();if(denied)return denied;
  const context=await getAccessContext();if(!context)return error("请先登录",401);const db=getD1();
  const [outcomes,lots,shipments,items,movements]=await Promise.all([
    db.prepare(`SELECT o.id,o.job_id jobId,j.job_no jobNo,o.successful_quantity successfulQuantity,o.reported_at reportedAt
      FROM production_outcomes o JOIN print_jobs j ON j.id=o.job_id AND j.organization_id=o.organization_id
      WHERE o.organization_id=? AND o.successful_quantity>0 AND EXISTS(SELECT 1 FROM quality_inspections q WHERE q.outcome_id=o.id AND q.organization_id=o.organization_id AND q.result IN ('passed','partial'))
      AND NOT EXISTS(SELECT 1 FROM finished_goods_lots l WHERE l.outcome_id=o.id AND l.organization_id=o.organization_id) ORDER BY o.id DESC`).bind(context.organizationId).all(),
    db.prepare("SELECT id,outcome_id outcomeId,job_id jobId,lot_no lotNo,total_quantity totalQuantity,available_quantity availableQuantity,received_at receivedAt FROM finished_goods_lots WHERE organization_id=? ORDER BY id DESC").bind(context.organizationId).all(),
    db.prepare(`SELECT s.id,s.shipment_no shipmentNo,s.status,s.order_id orderId,o.order_no orderNo,s.recipient_name recipientName,s.address,s.shipped_at shippedAt,s.delivered_at deliveredAt,s.created_at createdAt FROM shipments s LEFT JOIN orders o ON o.id=s.order_id AND o.organization_id=s.organization_id WHERE s.organization_id=? ORDER BY s.id DESC LIMIT 100`).bind(context.organizationId).all(),
    db.prepare(`SELECT i.id,i.shipment_id shipmentId,i.lot_id lotId,l.lot_no lotNo,i.requested_quantity requestedQuantity,i.picked_quantity pickedQuantity,i.shipped_quantity shippedQuantity FROM shipment_items i JOIN finished_goods_lots l ON l.id=i.lot_id AND l.organization_id=i.organization_id WHERE i.organization_id=? ORDER BY i.id`).bind(context.organizationId).all(),
    db.prepare("SELECT id,lot_id lotId,shipment_item_id shipmentItemId,type,quantity,idempotency_key idempotencyKey,actor_email actorEmail,created_at createdAt FROM finished_goods_movements WHERE organization_id=? ORDER BY id DESC LIMIT 100").bind(context.organizationId).all(),
  ]);
  return Response.json({canOperate:can(context,"inventory.write"),outcomes:outcomes.results??[],lots:lots.results??[],shipments:shipments.results??[],items:items.results??[],movements:movements.results??[]});
}

export async function POST(request:Request){
  const denied=await requireApiAccess(true);if(denied)return denied;const context=await getAccessContext();if(!context)return error("请先登录",401);
  if(!can(context,"inventory.write"))return error("没有成品库存操作权限",403);
  try{
    const body=await request.json() as {action?:string;outcomeId?:number;lotNo?:string;shipmentNo?:string;idempotencyKey?:string;orderId?:number;recipientName?:string;address?:string;items?:ShipmentItemInput[]};const db=getD1(),idempotencyKey=key(body.idempotencyKey);
    if(body.action==="receive"){
      const outcomeId=Number(body.outcomeId),existing=await db.prepare("SELECT l.id,l.lot_no lotNo FROM finished_goods_lots l WHERE l.organization_id=? AND l.outcome_id=?").bind(context.organizationId,outcomeId).first();if(existing)return Response.json({...existing,idempotent:true});
      const lotNo=String(body.lotNo||`FG-${outcomeId}`).trim().slice(0,80);if(!Number.isInteger(outcomeId)||outcomeId<1||!lotNo)throw new Error("INVALID_OUTCOME");
      const qualified=await db.prepare("SELECT o.id FROM production_outcomes o WHERE o.id=? AND o.organization_id=? AND o.successful_quantity>0 AND EXISTS(SELECT 1 FROM quality_inspections q WHERE q.outcome_id=o.id AND q.organization_id=o.organization_id AND q.result IN ('passed','partial'))").bind(outcomeId,context.organizationId).first();if(!qualified)return error("质量结算不存在、没有良品或不属于当前组织",404);
      await db.batch([
        db.prepare(`INSERT INTO finished_goods_lots(organization_id,outcome_id,job_id,lot_no,total_quantity,available_quantity,received_by)
          SELECT organization_id,id,job_id,?,successful_quantity,successful_quantity,? FROM production_outcomes WHERE id=? AND organization_id=?`).bind(lotNo,context.email,outcomeId,context.organizationId),
        db.prepare(`INSERT INTO finished_goods_movements(organization_id,lot_id,type,quantity,idempotency_key,actor_email)
          SELECT organization_id,id,'receipt',total_quantity,?,? FROM finished_goods_lots WHERE outcome_id=? AND organization_id=?`).bind(idempotencyKey,context.email,outcomeId,context.organizationId),
      ]);
      const lot=await db.prepare("SELECT id,lot_no lotNo,total_quantity totalQuantity FROM finished_goods_lots WHERE outcome_id=? AND organization_id=?").bind(outcomeId,context.organizationId).first<{id:number}>();await recordAudit(context,"fulfillment.goods.received","finished_goods_lot",String(lot?.id??""),{outcomeId,idempotencyKey});return Response.json(lot,{status:201});
    }
    if(body.action==="create_shipment"){
      const shipmentNo=String(body.shipmentNo||"").trim().slice(0,80),recipient=String(body.recipientName||"").trim().slice(0,150),items=Array.isArray(body.items)?body.items:[];if(!shipmentNo||!recipient||!items.length)throw new Error("INVALID_SHIPMENT");
      const existing=await db.prepare("SELECT id,shipment_no shipmentNo FROM shipments WHERE organization_id=? AND idempotency_key=?").bind(context.organizationId,idempotencyKey).first();if(existing)return Response.json({...existing,idempotent:true});
      const normalized=items.map(item=>({lotId:Number(item.lotId),quantity:quantity(item.quantity)}));if(new Set(normalized.map(x=>x.lotId)).size!==normalized.length)throw new Error("DUPLICATE_LOT");
      const valid=(await db.prepare(`SELECT id FROM finished_goods_lots WHERE organization_id=? AND id IN (${normalized.map(()=>"?").join(",")})`).bind(context.organizationId,...normalized.map(x=>x.lotId)).all()).results??[];if(valid.length!==normalized.length)throw new Error("LOT_SCOPE_MISMATCH");
      const orderId=body.orderId?Number(body.orderId):null;await db.batch([
        db.prepare("INSERT INTO shipments(organization_id,order_id,shipment_no,idempotency_key,recipient_name,address,created_by) VALUES(?,?,?,?,?,?,?)").bind(context.organizationId,orderId,shipmentNo,idempotencyKey,recipient,String(body.address||"").slice(0,1000),context.email),
        ...normalized.map(item=>db.prepare("INSERT INTO shipment_items(organization_id,shipment_id,lot_id,requested_quantity) VALUES(?,(SELECT id FROM shipments WHERE organization_id=? AND idempotency_key=?),?,?)").bind(context.organizationId,context.organizationId,idempotencyKey,item.lotId,item.quantity)),
      ]);const shipment=await db.prepare("SELECT id,shipment_no shipmentNo FROM shipments WHERE organization_id=? AND idempotency_key=?").bind(context.organizationId,idempotencyKey).first<{id:number}>();await recordAudit(context,"fulfillment.shipment.created","shipment",String(shipment?.id??""),{idempotencyKey,itemCount:normalized.length});return Response.json(shipment,{status:201});
    }
    return error("未知操作",400);
  }catch(cause){return fulfillmentError(cause);}
}

export async function PATCH(request:Request){
  const denied=await requireApiAccess(true);if(denied)return denied;const context=await getAccessContext();if(!context)return error("请先登录",401);if(!can(context,"inventory.write"))return error("没有成品库存操作权限",403);
  try{
    const body=await request.json() as {action?:string;shipmentId?:number;itemId?:number;quantity?:number;idempotencyKey?:string;carrier?:string;trackingNo?:string};const db=getD1(),shipmentId=Number(body.shipmentId),idempotencyKey=key(body.idempotencyKey);
    const shipment=await db.prepare("SELECT id,status FROM shipments WHERE id=? AND organization_id=?").bind(shipmentId,context.organizationId).first<{id:number;status:string}>();if(!shipment)return error("发货单不存在或不属于当前组织",404);
    const duplicate=await db.prepare("SELECT id,type action FROM finished_goods_movements WHERE organization_id=? AND idempotency_key=? UNION ALL SELECT id,action FROM shipment_events WHERE organization_id=? AND idempotency_key=? LIMIT 1").bind(context.organizationId,idempotencyKey,context.organizationId,idempotencyKey).first();if(duplicate)return Response.json({...duplicate,idempotent:true});
    if(["pick","ship"].includes(String(body.action))){
      if(["delivered","cancelled"].includes(shipment.status))return error("已签收或取消的发货单不能继续操作",409);const itemId=Number(body.itemId),amount=quantity(body.quantity);
      const item=await db.prepare("SELECT id,lot_id lotId FROM shipment_items WHERE id=? AND shipment_id=? AND organization_id=?").bind(itemId,shipment.id,context.organizationId).first<{id:number;lotId:number}>();if(!item)return error("发货明细不存在或跨组织",404);
      await db.batch([
        db.prepare("INSERT INTO finished_goods_movements(organization_id,lot_id,shipment_item_id,type,quantity,idempotency_key,actor_email) VALUES(?,?,?,?,?,?,?)").bind(context.organizationId,item.lotId,item.id,body.action,amount,idempotencyKey,context.email),
        db.prepare(`UPDATE shipments SET status=CASE WHEN ?='pick' THEN 'picking' WHEN NOT EXISTS(SELECT 1 FROM shipment_items WHERE shipment_id=? AND shipped_quantity<requested_quantity) THEN 'shipped' ELSE 'partially_shipped' END,shipped_at=CASE WHEN ?='ship' THEN COALESCE(shipped_at,CURRENT_TIMESTAMP) ELSE shipped_at END WHERE id=? AND organization_id=?`).bind(body.action,shipment.id,body.action,shipment.id,context.organizationId),
      ]);await recordAudit(context,`fulfillment.${body.action}`,"shipment",String(shipment.id),{itemId,quantity:amount,idempotencyKey});return Response.json({shipmentId:shipment.id,action:body.action});
    }
    if(body.action==="deliver"){
      if(shipment.status!=="shipped")return error("只有全部发货后才能签收",409);await db.batch([db.prepare("INSERT INTO shipment_events(organization_id,shipment_id,action,idempotency_key,actor_email) VALUES(?,?,'deliver',?,?)").bind(context.organizationId,shipment.id,idempotencyKey,context.email),db.prepare("UPDATE shipments SET status='delivered',delivered_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND status='shipped'").bind(shipment.id,context.organizationId)]);await recordAudit(context,"fulfillment.delivered","shipment",String(shipment.id),{idempotencyKey});return Response.json({shipmentId,status:"delivered"});
    }
    if(body.action==="cancel"){
      if(["shipped","delivered","cancelled"].includes(shipment.status))return error("已发货、已签收或已取消的发货单不能取消",409);const releasable=(await db.prepare("SELECT id,lot_id lotId,picked_quantity-shipped_quantity quantity FROM shipment_items WHERE shipment_id=? AND organization_id=? AND picked_quantity>shipped_quantity").bind(shipment.id,context.organizationId).all<{id:number;lotId:number;quantity:number}>()).results??[];
      await db.batch([db.prepare("INSERT INTO shipment_events(organization_id,shipment_id,action,idempotency_key,actor_email) VALUES(?,?,'cancel',?,?)").bind(context.organizationId,shipment.id,idempotencyKey,context.email),...releasable.map(row=>db.prepare("INSERT INTO finished_goods_movements(organization_id,lot_id,shipment_item_id,type,quantity,idempotency_key,actor_email) VALUES(?,?,?,'release',?,?,?)").bind(context.organizationId,row.lotId,row.id,row.quantity,`${idempotencyKey}:${row.id}`,context.email)),db.prepare("UPDATE shipments SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?").bind(shipment.id,context.organizationId)]);await recordAudit(context,"fulfillment.cancelled","shipment",String(shipment.id),{released:releasable.reduce((s,x)=>s+x.quantity,0),idempotencyKey});return Response.json({shipmentId,status:"cancelled"});
    }
    return error("未知操作",400);
  }catch(cause){return fulfillmentError(cause);}
}

function fulfillmentError(cause:unknown){const message=cause instanceof Error?cause.message:"交付操作失败";if(message.includes("UNIQUE constraint failed"))return error("该操作已处理，请勿重复提交",409);if(message.includes("FINISHED_GOODS_QUALITY_NOT_SETTLED"))return error("只有完成质量结算的良品才能入成品库",409);if(message.includes("FINISHED_GOODS_MOVEMENT_REJECTED"))return error("操作数量超过可用、已拣或待发数量，已拒绝超发",409);const known:Record<string,string>={IDEMPOTENCY_KEY_REQUIRED:"必须提供有效幂等键",INVALID_QUANTITY:"数量必须是正整数",INVALID_OUTCOME:"质量结算记录不正确",INVALID_SHIPMENT:"请填写发货单、收件人和明细",DUPLICATE_LOT:"同一发货单不能重复选择批次",LOT_SCOPE_MISMATCH:"成品批次不存在或不属于当前组织"};return error(known[message]||message,400)}
