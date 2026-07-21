import {can,getAccessContext,recordAudit} from "../../access-control";
import {requireApiAccess} from "../../api-auth";
import {getD1} from "../../../db";
import {canTransitionPurchase,canTransitionRequest,receiptStatus,suggestedReplenishment,type PurchaseStatus,type RequestStatus} from "../../../procurement/workflow";

const fail=(error:string,status=400)=>Response.json({error},{status});
const value=(input:unknown,max=200)=>String(input??"").trim().slice(0,max);
const integer=(input:unknown)=>{const n=Number(input);return Number.isInteger(n)&&n>0?n:0};
const amount=(input:unknown)=>{const n=Number(input);return Number.isFinite(n)&&n>0?Math.round(n*1000)/1000:0};
const managers=new Set(["owner","manager"]);

export async function GET(){
  const denied=await requireApiAccess();if(denied)return denied;
  const context=await getAccessContext();if(!context)return fail("请先登录",401);
  const db=getD1();
  const [suppliers,materials,requests,orders,orderItems,receipts]=await Promise.all([
    db.prepare("SELECT id,code,name,contact,phone,email,status FROM suppliers WHERE organization_id=? ORDER BY name").bind(context.organizationId).all(),
    db.prepare(`SELECT b.id,b.material,b.color,b.brand,b.remaining_grams remainingGrams,b.low_stock_grams lowStockGrams,b.cost_per_kg costPerKg,
      COALESCE(m.sku,'MAT-'||printf('%04d',b.id)) sku,
      COALESCE((SELECT SUM(poi.ordered_grams-poi.received_grams) FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.purchase_order_id WHERE poi.organization_id=? AND poi.batch_id=b.id AND po.status IN ('ordered','partially_received')),0) incomingGrams
      FROM material_batch_organizations mbo JOIN material_batches b ON b.id=mbo.batch_id LEFT JOIN material_inventory_meta m ON m.batch_id=b.id
      WHERE mbo.organization_id=? ORDER BY CASE WHEN b.remaining_grams<=b.low_stock_grams THEN 0 ELSE 1 END,b.material,b.color`).bind(context.organizationId,context.organizationId).all(),
    db.prepare(`SELECT r.*,COUNT(ri.id) itemCount,COALESCE(SUM(ri.requested_grams),0) requestedGrams FROM procurement_requests r
      LEFT JOIN procurement_request_items ri ON ri.request_id=r.id AND ri.organization_id=r.organization_id WHERE r.organization_id=? GROUP BY r.id ORDER BY r.id DESC LIMIT 100`).bind(context.organizationId).all(),
    db.prepare(`SELECT po.*,s.name supplierName,r.request_no requestNo,COUNT(poi.id) itemCount,COALESCE(SUM(poi.ordered_grams),0) orderedGrams,COALESCE(SUM(poi.received_grams),0) receivedGrams
      FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id AND s.organization_id=po.organization_id JOIN procurement_requests r ON r.id=po.request_id AND r.organization_id=po.organization_id
      LEFT JOIN purchase_order_items poi ON poi.purchase_order_id=po.id AND poi.organization_id=po.organization_id WHERE po.organization_id=? GROUP BY po.id ORDER BY po.id DESC LIMIT 100`).bind(context.organizationId).all(),
    db.prepare(`SELECT poi.id,poi.purchase_order_id orderId,poi.batch_id batchId,poi.ordered_grams orderedGrams,poi.received_grams receivedGrams,b.material,b.color,
      COALESCE(m.sku,'MAT-'||printf('%04d',b.id)) sku FROM purchase_order_items poi JOIN material_batches b ON b.id=poi.batch_id
      LEFT JOIN material_inventory_meta m ON m.batch_id=b.id WHERE poi.organization_id=? ORDER BY poi.id`).bind(context.organizationId).all(),
    db.prepare("SELECT gr.*,po.purchase_no purchaseNo FROM goods_receipts gr JOIN purchase_orders po ON po.id=gr.purchase_order_id AND po.organization_id=gr.organization_id WHERE gr.organization_id=? ORDER BY gr.id DESC LIMIT 100").bind(context.organizationId).all(),
  ]);
  const materialRows=(materials.results??[]).map(row=>({...row,suggestedGrams:suggestedReplenishment(Number(row.remainingGrams),Number(row.lowStockGrams),Number(row.incomingGrams))}));
  return Response.json({canManage:managers.has(context.role),canReceive:can(context,"inventory.write"),suppliers:suppliers.results??[],materials:materialRows,requests:requests.results??[],orders:orders.results??[],orderItems:orderItems.results??[],receipts:receipts.results??[]});
}

export async function POST(request:Request){
  const denied=await requireApiAccess(true,"inventory.write");if(denied)return denied;
  const context=await getAccessContext();if(!context)return fail("请先登录",401);
  const body=await request.json() as Record<string,unknown>,action=value(body.action,40),db=getD1(),org=context.organizationId;
  try{
    if(action==="supplier"){
      const code=value(body.code,40).toUpperCase(),name=value(body.name,120);if(!code||!name)return fail("请填写供应商编码和名称");
      const row=await db.prepare("INSERT INTO suppliers(organization_id,code,name,contact,phone,email,created_by) VALUES(?,?,?,?,?,?,?) RETURNING id").bind(org,code,name,value(body.contact,80),value(body.phone,40),value(body.email,160),context.email).first<{id:number}>();
      await recordAudit(context,"procurement.supplier.created","supplier",String(row?.id??""),{code});return Response.json({id:row?.id},{status:201});
    }
    if(action==="request"){
      const batchId=integer(body.batchId),grams=amount(body.grams);if(!batchId||!grams)return fail("请选择耗材并填写补货克重");
      const owned=await db.prepare("SELECT b.id,b.remaining_grams remainingGrams,b.low_stock_grams lowStockGrams FROM material_batch_organizations mbo JOIN material_batches b ON b.id=mbo.batch_id WHERE mbo.organization_id=? AND b.id=?").bind(org,batchId).first<{id:number;remainingGrams:number;lowStockGrams:number}>();
      if(!owned)return fail("耗材不存在或不属于当前组织",404);
      const requestNo=`PR-${Date.now().toString(36).toUpperCase()}`,suggested=suggestedReplenishment(owned.remainingGrams,owned.lowStockGrams);
      await db.batch([
        db.prepare("INSERT INTO procurement_requests(organization_id,request_no,status,reason,requested_by) VALUES(?,?,'pending',?,?)").bind(org,requestNo,value(body.reason,500),context.email),
        db.prepare("INSERT INTO procurement_request_items(organization_id,request_id,batch_id,requested_grams,suggested_grams,note) VALUES(?,(SELECT id FROM procurement_requests WHERE organization_id=? AND request_no=?),?,?,?,?)").bind(org,org,requestNo,batchId,grams,suggested,value(body.note,300)),
      ]);
      await recordAudit(context,"procurement.request.submitted","procurement_request",requestNo,{batchId,grams,suggested});return Response.json({requestNo},{status:201});
    }
    return fail("不支持的采购操作");
  }catch(error){const message=error instanceof Error?error.message:"创建失败";return fail(message.includes("UNIQUE")?"编码或单号已存在":message,message.includes("UNIQUE")?409:400)}
}

export async function PATCH(request:Request){
  const context=await getAccessContext();if(!context)return fail("请先登录",401);
  const body=await request.json() as Record<string,unknown>,action=value(body.action,40),db=getD1(),org=context.organizationId,now=new Date().toISOString();
  try{
    if(action==="approve"){
      const denied=await requireApiAccess(true,"write");if(denied)return denied;if(!managers.has(context.role))return fail("仅负责人或管理员可以审批采购申请",403);
      const id=integer(body.requestId),row=await db.prepare("SELECT status FROM procurement_requests WHERE id=? AND organization_id=?").bind(id,org).first<{status:RequestStatus}>();if(!row)return fail("采购申请不存在",404);
      if(!canTransitionRequest(row.status,"approved"))return fail("当前状态不能审批",409);
      await db.prepare("UPDATE procurement_requests SET status='approved',approved_by=?,approved_at=?,updated_at=? WHERE id=? AND organization_id=? AND status='pending'").bind(context.email,now,now,id,org).run();
      await recordAudit(context,"procurement.request.approved","procurement_request",String(id));return Response.json({id,status:"approved"});
    }
    if(action==="order"){
      const denied=await requireApiAccess(true,"write");if(denied)return denied;if(!managers.has(context.role))return fail("仅负责人或管理员可以建立采购订单",403);
      const requestId=integer(body.requestId),supplierId=integer(body.supplierId),requestRow=await db.prepare("SELECT status FROM procurement_requests WHERE id=? AND organization_id=?").bind(requestId,org).first<{status:RequestStatus}>();
      if(!requestRow||!canTransitionRequest(requestRow.status,"ordered"))return fail("申请不存在或尚未审批",409);
      const supplier=await db.prepare("SELECT id FROM suppliers WHERE id=? AND organization_id=? AND status='active'").bind(supplierId,org).first();if(!supplier)return fail("供应商不存在或已停用",404);
      const purchaseNo=`PO-${Date.now().toString(36).toUpperCase()}`;
      await db.batch([
        db.prepare("INSERT INTO purchase_orders(organization_id,request_id,supplier_id,purchase_no,status,ordered_at,created_by) VALUES(?,?,?,?, 'ordered',?,?)").bind(org,requestId,supplierId,purchaseNo,now,context.email),
        db.prepare(`INSERT INTO purchase_order_items(organization_id,purchase_order_id,request_item_id,batch_id,ordered_grams,unit_cost_per_kg)
          SELECT ?,po.id,ri.id,ri.batch_id,ri.requested_grams,b.cost_per_kg FROM procurement_request_items ri JOIN material_batches b ON b.id=ri.batch_id
          JOIN purchase_orders po ON po.request_id=ri.request_id AND po.organization_id=ri.organization_id WHERE ri.request_id=? AND ri.organization_id=?`).bind(org,requestId,org),
        db.prepare("UPDATE procurement_requests SET status='ordered',updated_at=? WHERE id=? AND organization_id=? AND status='approved'").bind(now,requestId,org),
      ]);
      await recordAudit(context,"procurement.order.placed","purchase_order",purchaseNo,{requestId,supplierId});return Response.json({purchaseNo},{status:201});
    }
    if(action==="cancel"){
      const denied=await requireApiAccess(true,"write");if(denied)return denied;if(!managers.has(context.role))return fail("仅负责人或管理员可以取消采购订单",403);
      const id=integer(body.orderId),row=await db.prepare("SELECT status FROM purchase_orders WHERE id=? AND organization_id=?").bind(id,org).first<{status:PurchaseStatus}>();if(!row)return fail("采购订单不存在",404);
      if(!canTransitionPurchase(row.status,"cancelled"))return fail("已完成或已取消的订单不能再次取消",409);
      await db.prepare("UPDATE purchase_orders SET status='cancelled',cancelled_at=?,updated_at=? WHERE id=? AND organization_id=? AND status IN ('approved','ordered','partially_received')").bind(now,now,id,org).run();
      await recordAudit(context,"procurement.order.cancelled","purchase_order",String(id));return Response.json({id,status:"cancelled"});
    }
    if(action==="receive"){
      const denied=await requireApiAccess(true,"inventory.write");if(denied)return denied;
      const orderId=integer(body.orderId),itemId=integer(body.itemId),grams=amount(body.grams),key=value(body.idempotencyKey,100);if(!orderId||!itemId||!grams||key.length<8)return fail("收货参数或幂等键无效");
      const duplicate=await db.prepare("SELECT id,receipt_no receiptNo FROM goods_receipts WHERE organization_id=? AND idempotency_key=?").bind(org,key).first();if(duplicate)return Response.json({...duplicate,idempotent:true});
      const row=await db.prepare(`SELECT po.status,poi.id itemId,poi.batch_id batchId,poi.ordered_grams orderedGrams,poi.received_grams receivedGrams
        FROM purchase_orders po JOIN purchase_order_items poi ON poi.purchase_order_id=po.id AND poi.organization_id=po.organization_id
        WHERE po.id=? AND poi.id=? AND po.organization_id=?`).bind(orderId,itemId,org).first<{status:PurchaseStatus;itemId:number;batchId:number;orderedGrams:number;receivedGrams:number}>();
      if(!row)return fail("采购订单明细不存在或不属于当前组织",404);if(!["ordered","partially_received"].includes(row.status))return fail("当前订单状态不能收货",409);if(row.receivedGrams+grams>row.orderedGrams+0.0001)return fail("收货数量超过未收数量",409);
      const all=(await db.prepare("SELECT ordered_grams orderedGrams,received_grams receivedGrams,id FROM purchase_order_items WHERE purchase_order_id=? AND organization_id=?").bind(orderId,org).all<{orderedGrams:number;receivedGrams:number;id:number}>()).results??[];
      const nextStatus=receiptStatus(all.map(item=>({orderedGrams:item.orderedGrams,receivedGrams:item.receivedGrams,incomingGrams:item.id===itemId?grams:0}))),receiptNo=`GR-${Date.now().toString(36).toUpperCase()}`,note=`采购收货:${key}:${itemId}`;
      await db.batch([
        db.prepare("INSERT INTO goods_receipts(organization_id,purchase_order_id,idempotency_key,receipt_no,received_by,received_at) VALUES(?,?,?,?,?,?)").bind(org,orderId,key,receiptNo,context.email,now),
        db.prepare("INSERT INTO inventory_transactions(batch_id,type,grams,note) VALUES(?,'采购入库',?,?)").bind(row.batchId,grams,note),
        db.prepare("UPDATE material_batches SET remaining_grams=remaining_grams+?,initial_grams=initial_grams+? WHERE id=? AND EXISTS(SELECT 1 FROM material_batch_organizations WHERE organization_id=? AND batch_id=?)").bind(grams,grams,row.batchId,org,row.batchId),
        db.prepare(`INSERT INTO goods_receipt_items(organization_id,receipt_id,purchase_order_item_id,batch_id,received_grams,inventory_transaction_id)
          VALUES(?,(SELECT id FROM goods_receipts WHERE organization_id=? AND idempotency_key=?),?,?,?,(SELECT id FROM inventory_transactions WHERE batch_id=? AND note=? ORDER BY id DESC LIMIT 1))`).bind(org,org,key,itemId,row.batchId,grams,row.batchId,note),
        db.prepare("UPDATE purchase_order_items SET received_grams=received_grams+? WHERE id=? AND organization_id=? AND received_grams+?<=ordered_grams").bind(grams,itemId,org,grams),
        db.prepare("UPDATE purchase_orders SET status=?,updated_at=? WHERE id=? AND organization_id=? AND status IN ('ordered','partially_received')").bind(nextStatus,now,orderId,org),
        db.prepare("INSERT INTO audit_logs(organization_id,actor_email,action,resource,resource_id,detail) VALUES(?,?,'procurement.receipt.posted','goods_receipt',?,?)").bind(org,context.email,receiptNo,JSON.stringify({orderId,itemId,batchId:row.batchId,grams,key,nextStatus})),
      ]);
      return Response.json({receiptNo,status:nextStatus},{status:201});
    }
    return fail("不支持的采购操作");
  }catch(error){const message=error instanceof Error?error.message:"采购操作失败";if(message.includes("UNIQUE")&&action==="receive"){const existing=await db.prepare("SELECT id,receipt_no receiptNo FROM goods_receipts WHERE organization_id=? AND idempotency_key=?").bind(org,value(body.idempotencyKey,100)).first();if(existing)return Response.json({...existing,idempotent:true})}return fail(message.includes("constraint")?"采购状态已变化，请刷新后重试":message,message.includes("constraint")?409:400)}
}
