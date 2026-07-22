import {can,getAccessContext,recordAudit} from "../../access-control";
import {requireApiAccess} from "../../api-auth";
import {getD1} from "../../../db";
import {canTransitionPurchase,canTransitionRequest,receiptStatus,suggestedSpoolReplenishment,type PurchaseStatus,type RequestStatus} from "../../../procurement/workflow";

const fail=(error:string,status=400)=>Response.json({error},{status});
const value=(input:unknown,max=200)=>String(input??"").trim().slice(0,max);
const integer=(input:unknown)=>{const n=Number(input);return Number.isInteger(n)&&n>0?n:0};
const amount=(input:unknown)=>{const n=Number(input);return Number.isFinite(n)&&n>0?Math.round(n*1000)/1000:0};
const managers=new Set(["owner","manager"]);
async function receiptSpools(org:number,receiptId:number){const rows=await getD1().prepare(`SELECT s.id,s.spool_code spoolCode,s.remaining_net_grams remainingNetGrams,s.state,c.material,c.brand,c.color_name colorName,c.color_code colorCode,c.color_hex colorHex FROM material_spools s JOIN material_purchase_lots l ON l.id=s.purchase_lot_id AND l.organization_id=s.organization_id JOIN material_catalog_items c ON c.id=s.catalog_item_id AND c.organization_id=s.organization_id WHERE s.organization_id=? AND l.goods_receipt_id=? ORDER BY s.id`).bind(org,receiptId).all();return rows.results??[]}
async function ensureCompatibilityBatch(org:number,catalog:{id:number;legacyBatchId:number|null;material:string;colorName:string;brand:string}){if(catalog.legacyBatchId)return catalog.legacyBatchId;const db=getD1(),created=await db.prepare("INSERT INTO material_batches(material,color,brand,initial_grams,remaining_grams,low_stock_grams,cost_per_kg) VALUES(?,?,?,0,0,0,0) RETURNING id").bind(catalog.material,catalog.colorName,catalog.brand).first<{id:number}>();await db.batch([db.prepare("INSERT OR IGNORE INTO material_batch_organizations(organization_id,batch_id) VALUES(?,?)").bind(org,created!.id),db.prepare("UPDATE material_catalog_items SET legacy_batch_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND legacy_batch_id IS NULL").bind(created!.id,catalog.id,org)]);return created!.id}

export async function GET(){
  const denied=await requireApiAccess();if(denied)return denied;
  const context=await getAccessContext();if(!context)return fail("请先登录",401);
  const db=getD1();
  const [suppliers,materials,requests,orders,orderItems,receipts]=await Promise.all([
    db.prepare("SELECT id,code,name,contact,phone,email,status FROM suppliers WHERE organization_id=? ORDER BY name").bind(context.organizationId).all(),
    db.prepare(`SELECT c.id,c.catalog_code catalogCode,c.material,c.color_name color,c.color_hex colorHex,c.brand,c.default_net_grams defaultNetGrams,c.default_tare_grams defaultTareGrams,c.reorder_point_spools reorderPointSpools,c.target_stock_spools targetStockSpools,
      COALESCE((SELECT COUNT(*) FROM material_spools ms WHERE ms.organization_id=c.organization_id AND ms.catalog_item_id=c.id AND ms.state IN ('sealed','open_storage')),0) onHandSpools,
      COALESCE((SELECT SUM(ms.remaining_net_grams) FROM material_spools ms WHERE ms.organization_id=c.organization_id AND ms.catalog_item_id=c.id AND ms.state IN ('sealed','open_storage')),0) remainingGrams,
      COALESCE((SELECT SUM(poi.ordered_spools-poi.received_spools) FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.purchase_order_id AND po.organization_id=poi.organization_id WHERE poi.organization_id=c.organization_id AND poi.catalog_item_id=c.id AND po.status IN ('ordered','partially_received')),0) incomingSpools
      FROM material_catalog_items c WHERE c.organization_id=? ORDER BY c.material,c.brand,c.color_name`).bind(context.organizationId).all(),
    db.prepare(`SELECT r.*,COUNT(ri.id) itemCount,COALESCE(SUM(ri.requested_grams),0) requestedGrams,COALESCE(SUM(ri.requested_spools),0) requestedSpools FROM procurement_requests r
      LEFT JOIN procurement_request_items ri ON ri.request_id=r.id AND ri.organization_id=r.organization_id WHERE r.organization_id=? GROUP BY r.id ORDER BY r.id DESC LIMIT 100`).bind(context.organizationId).all(),
    db.prepare(`SELECT po.*,s.name supplierName,r.request_no requestNo,COUNT(poi.id) itemCount,COALESCE(SUM(poi.ordered_grams),0) orderedGrams,COALESCE(SUM(poi.received_grams),0) receivedGrams,COALESCE(SUM(poi.ordered_spools),0) orderedSpools,COALESCE(SUM(poi.received_spools),0) receivedSpools
      FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id AND s.organization_id=po.organization_id JOIN procurement_requests r ON r.id=po.request_id AND r.organization_id=po.organization_id
      LEFT JOIN purchase_order_items poi ON poi.purchase_order_id=po.id AND poi.organization_id=po.organization_id WHERE po.organization_id=? GROUP BY po.id ORDER BY po.id DESC LIMIT 100`).bind(context.organizationId).all(),
    db.prepare(`SELECT poi.id,poi.purchase_order_id orderId,poi.batch_id batchId,poi.ordered_grams orderedGrams,poi.received_grams receivedGrams,poi.ordered_spools orderedSpools,poi.received_spools receivedSpools,poi.per_spool_net_grams perSpoolNetGrams,
      COALESCE(c.material,b.material) material,COALESCE(c.color_name,b.color) color,COALESCE(c.catalog_code,m.sku,'MAT-'||printf('%04d',b.id)) sku,c.id catalogItemId,c.catalog_code catalogCode,c.default_net_grams defaultNetGrams,c.default_tare_grams defaultTareGrams,c.color_hex colorHex
      FROM purchase_order_items poi JOIN material_batches b ON b.id=poi.batch_id LEFT JOIN material_inventory_meta m ON m.batch_id=b.id
      LEFT JOIN material_catalog_items c ON c.organization_id=poi.organization_id AND c.id=COALESCE(poi.catalog_item_id,(SELECT id FROM material_catalog_items lc WHERE lc.organization_id=poi.organization_id AND lc.legacy_batch_id=poi.batch_id)) WHERE poi.organization_id=? ORDER BY poi.id`).bind(context.organizationId).all(),
    db.prepare("SELECT gr.*,po.purchase_no purchaseNo,COALESCE((SELECT SUM(gri.spool_count) FROM goods_receipt_items gri WHERE gri.receipt_id=gr.id AND gri.organization_id=gr.organization_id),0) spoolCount FROM goods_receipts gr JOIN purchase_orders po ON po.id=gr.purchase_order_id AND po.organization_id=gr.organization_id WHERE gr.organization_id=? ORDER BY gr.id DESC LIMIT 100").bind(context.organizationId).all(),
  ]);
  const materialRows=(materials.results??[]).map(row=>({...row,suggestedSpools:suggestedSpoolReplenishment(Number(row.onHandSpools),Number(row.reorderPointSpools),Number(row.targetStockSpools),Number(row.incomingSpools))}));
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
      const catalogItemId=integer(body.catalogItemId),requestedSpools=integer(body.requestedSpools);if(!catalogItemId||!requestedSpools||requestedSpools>1000)return fail("请选择耗材并填写 1 至 1000 卷的采购数量");
      const catalog=await db.prepare(`SELECT c.id,c.legacy_batch_id legacyBatchId,c.material,c.color_name colorName,c.brand,c.default_net_grams defaultNetGrams,c.reorder_point_spools reorderPointSpools,c.target_stock_spools targetStockSpools,
        COALESCE((SELECT COUNT(*) FROM material_spools s WHERE s.organization_id=c.organization_id AND s.catalog_item_id=c.id AND s.state IN ('sealed','open_storage')),0) onHandSpools,
        COALESCE((SELECT SUM(poi.ordered_spools-poi.received_spools) FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.purchase_order_id AND po.organization_id=poi.organization_id WHERE poi.organization_id=c.organization_id AND poi.catalog_item_id=c.id AND po.status IN ('ordered','partially_received')),0) incomingSpools
        FROM material_catalog_items c WHERE c.id=? AND c.organization_id=?`).bind(catalogItemId,org).first<{id:number;legacyBatchId:number|null;material:string;colorName:string;brand:string;defaultNetGrams:number;reorderPointSpools:number;targetStockSpools:number;onHandSpools:number;incomingSpools:number}>();if(!catalog)return fail("耗材主数据不存在或不属于当前组织",404);
      const perSpoolNetGrams=amount(body.perSpoolNetGrams)||catalog.defaultNetGrams,grams=Math.round(requestedSpools*perSpoolNetGrams*1000)/1000,batchId=await ensureCompatibilityBatch(org,catalog),suggestedSpools=suggestedSpoolReplenishment(catalog.onHandSpools,catalog.reorderPointSpools,catalog.targetStockSpools,catalog.incomingSpools),requestNo=`PR-${Date.now().toString(36).toUpperCase()}`;
      await db.batch([
        db.prepare("INSERT INTO procurement_requests(organization_id,request_no,status,reason,requested_by) VALUES(?,?,'pending',?,?)").bind(org,requestNo,value(body.reason,500),context.email),
        db.prepare("INSERT INTO procurement_request_items(organization_id,request_id,batch_id,catalog_item_id,requested_grams,suggested_grams,requested_spools,per_spool_net_grams,note) VALUES(?,(SELECT id FROM procurement_requests WHERE organization_id=? AND request_no=?),?,?,?,?,?,?,?)").bind(org,org,requestNo,batchId,catalogItemId,grams,suggestedSpools*perSpoolNetGrams,requestedSpools,perSpoolNetGrams,value(body.note,300)),
      ]);
      await recordAudit(context,"procurement.request.submitted","procurement_request",requestNo,{catalogItemId,requestedSpools,perSpoolNetGrams,grams,suggestedSpools});return Response.json({requestNo},{status:201});
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
        db.prepare(`INSERT INTO purchase_order_items(organization_id,purchase_order_id,request_item_id,batch_id,catalog_item_id,ordered_grams,ordered_spools,per_spool_net_grams,unit_cost_per_kg)
          SELECT ?,po.id,ri.id,ri.batch_id,ri.catalog_item_id,ri.requested_grams,ri.requested_spools,ri.per_spool_net_grams,COALESCE((SELECT l.unit_cost_cents_per_kg/100.0 FROM material_purchase_lots l WHERE l.organization_id=ri.organization_id AND l.catalog_item_id=ri.catalog_item_id ORDER BY l.id DESC LIMIT 1),b.cost_per_kg,0) FROM procurement_request_items ri JOIN material_batches b ON b.id=ri.batch_id
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
      const orderId=integer(body.orderId),itemId=integer(body.itemId),spoolCount=integer(body.spoolCount),perSpoolNetGrams=amount(body.perSpoolNetGrams),tareGrams=Math.max(0,amount(body.tareGrams)),key=value(body.idempotencyKey,100),lotInput=value(body.lotNo,80).toUpperCase();const grams=Math.round(spoolCount*perSpoolNetGrams*1000)/1000;if(!orderId||!itemId||!spoolCount||spoolCount>100||!perSpoolNetGrams||key.length<8)return fail("请填写 1 至 100 卷的收货数量和单卷净重");
      const duplicate=await db.prepare("SELECT id,receipt_no receiptNo FROM goods_receipts WHERE organization_id=? AND idempotency_key=?").bind(org,key).first<{id:number;receiptNo:string}>();if(duplicate)return Response.json({...duplicate,spools:await receiptSpools(org,duplicate.id),idempotent:true});
      const row=await db.prepare(`SELECT po.status,po.supplier_id supplierId,poi.id itemId,poi.batch_id batchId,poi.ordered_grams orderedGrams,poi.received_grams receivedGrams,poi.ordered_spools orderedSpools,poi.received_spools receivedSpools,poi.unit_cost_per_kg unitCostPerKg,c.id catalogItemId,c.catalog_code catalogCode,c.material,c.brand,c.color_name colorName,c.color_code colorCode,c.color_hex colorHex
        FROM purchase_orders po JOIN purchase_order_items poi ON poi.purchase_order_id=po.id AND poi.organization_id=po.organization_id
        JOIN material_batch_organizations mbo ON mbo.batch_id=poi.batch_id AND mbo.organization_id=po.organization_id
        LEFT JOIN material_catalog_items c ON c.organization_id=po.organization_id AND c.id=COALESCE(poi.catalog_item_id,(SELECT id FROM material_catalog_items lc WHERE lc.organization_id=po.organization_id AND lc.legacy_batch_id=poi.batch_id))
        WHERE po.id=? AND poi.id=? AND po.organization_id=?`).bind(orderId,itemId,org).first<{status:PurchaseStatus;supplierId:number;itemId:number;batchId:number;orderedGrams:number;receivedGrams:number;orderedSpools:number;receivedSpools:number;unitCostPerKg:number;catalogItemId:number|null;catalogCode:string|null;material:string;brand:string;colorName:string;colorCode:string;colorHex:string}>();
      if(!row)return fail("采购订单明细不存在或不属于当前组织",404);if(!row.catalogItemId)return fail("该采购明细尚未关联耗材主数据，请先完成主数据映射",409);if(!["ordered","partially_received"].includes(row.status))return fail("当前订单状态不能收货",409);if(row.receivedGrams+grams>row.orderedGrams+0.0001)return fail("实体卷总净重超过采购未收数量",409);
      if(row.orderedSpools>0&&row.receivedSpools+spoolCount>row.orderedSpools)return fail("实体卷数量超过采购未收卷数",409);
      const location=await db.prepare("SELECT id FROM inventory_locations_v2 WHERE organization_id=? AND code='MAIN' AND active=1").bind(org).first<{id:number}>();if(!location)return fail("主仓库位不存在",409);
      const all=(await db.prepare("SELECT ordered_grams orderedGrams,received_grams receivedGrams,id FROM purchase_order_items WHERE purchase_order_id=? AND organization_id=?").bind(orderId,org).all<{orderedGrams:number;receivedGrams:number;id:number}>()).results??[];
      const nextStatus=receiptStatus(all.map(item=>({orderedGrams:item.orderedGrams,receivedGrams:item.receivedGrams,incomingGrams:item.id===itemId?grams:0}))),receiptNo=`GR-${Date.now().toString(36).toUpperCase()}`,lotNo=lotInput||`${receiptNo}-${row.catalogCode}`,note=`采购收货:${key}:${itemId}`,spools=Array.from({length:spoolCount},(_,index)=>({spoolCode:`${receiptNo}-${String(index+1).padStart(3,"0")}`,qrToken:`receipt:${key}:${index+1}`}));
      const statements=[
        db.prepare("INSERT INTO goods_receipts(organization_id,purchase_order_id,idempotency_key,receipt_no,received_by,received_at) VALUES(?,?,?,?,?,?)").bind(org,orderId,key,receiptNo,context.email,now),
        db.prepare("INSERT INTO inventory_transactions(batch_id,type,grams,note) VALUES(?,'采购入库',?,?)").bind(row.batchId,grams,note),
        db.prepare("UPDATE material_batches SET remaining_grams=remaining_grams+?,initial_grams=initial_grams+? WHERE id=? AND EXISTS(SELECT 1 FROM material_batch_organizations WHERE organization_id=? AND batch_id=?)").bind(grams,grams,row.batchId,org,row.batchId),
        db.prepare(`INSERT INTO goods_receipt_items(organization_id,receipt_id,purchase_order_item_id,batch_id,received_grams,inventory_transaction_id)
          VALUES(?,(SELECT id FROM goods_receipts WHERE organization_id=? AND idempotency_key=?),?,?,?,(SELECT id FROM inventory_transactions WHERE batch_id=? AND note=? ORDER BY id DESC LIMIT 1))`).bind(org,org,key,itemId,row.batchId,grams,row.batchId,note),
        db.prepare("INSERT INTO material_purchase_lots(organization_id,catalog_item_id,lot_no,supplier_id,purchase_order_item_id,goods_receipt_id,unit_cost_cents_per_kg,received_at,legacy_batch_id) VALUES(?,?,?,?,?,(SELECT id FROM goods_receipts WHERE organization_id=? AND idempotency_key=?),?,?,?)").bind(org,row.catalogItemId,lotNo,row.supplierId,itemId,org,key,Math.max(0,Math.round(row.unitCostPerKg*100)),now,row.batchId),
        db.prepare("UPDATE goods_receipt_items SET purchase_lot_id=(SELECT id FROM material_purchase_lots WHERE organization_id=? AND lot_no=?),spool_count=?,per_spool_net_grams=? WHERE organization_id=? AND receipt_id=(SELECT id FROM goods_receipts WHERE organization_id=? AND idempotency_key=?) AND purchase_order_item_id=?").bind(org,lotNo,spoolCount,perSpoolNetGrams,org,org,key,itemId),
        ...spools.flatMap(spool=>[
          db.prepare("INSERT INTO material_spools(organization_id,spool_code,catalog_item_id,purchase_lot_id,current_location_id,state,initial_net_grams,remaining_net_grams,tare_grams,qr_token) VALUES(?,?,?,(SELECT id FROM material_purchase_lots WHERE organization_id=? AND lot_no=?),?,'sealed',?,?,?,?)").bind(org,spool.spoolCode,row.catalogItemId,org,lotNo,location.id,perSpoolNetGrams,perSpoolNetGrams,tareGrams,spool.qrToken),
          db.prepare("INSERT INTO material_spool_movements(organization_id,spool_id,movement_type,to_location_id,net_grams_delta,idempotency_key,operator_email,note) VALUES(?,(SELECT id FROM material_spools WHERE organization_id=? AND spool_code=?),'receipt',?,?,?,?,?)").bind(org,org,spool.spoolCode,location.id,perSpoolNetGrams,`${key}:${spool.spoolCode}`,context.email,`采购入库 ${receiptNo}`),
        ]),
        db.prepare("UPDATE purchase_order_items SET received_grams=received_grams+? WHERE id=? AND organization_id=? AND received_grams+?<=ordered_grams").bind(grams,itemId,org,grams),
        db.prepare("UPDATE purchase_order_items SET received_spools=received_spools+? WHERE id=? AND organization_id=? AND (ordered_spools=0 OR received_spools+?<=ordered_spools)").bind(spoolCount,itemId,org,spoolCount),
        db.prepare("UPDATE purchase_orders SET status=?,updated_at=? WHERE id=? AND organization_id=? AND status IN ('ordered','partially_received')").bind(nextStatus,now,orderId,org),
        db.prepare("INSERT INTO audit_logs(organization_id,actor_email,action,resource,resource_id,detail) VALUES(?,?,'procurement.receipt.posted.serialized','goods_receipt',?,?)").bind(org,context.email,receiptNo,JSON.stringify({orderId,itemId,batchId:row.batchId,grams,spoolCount,perSpoolNetGrams,lotNo,key,nextStatus})),
      ];await db.batch(statements);
      const receipt=await db.prepare("SELECT id FROM goods_receipts WHERE organization_id=? AND idempotency_key=?").bind(org,key).first<{id:number}>();return Response.json({receiptNo,status:nextStatus,lotNo,spools:await receiptSpools(org,receipt!.id)},{status:201});
    }
    return fail("不支持的采购操作");
  }catch(error){const message=error instanceof Error?error.message:"采购操作失败";if(message.includes("UNIQUE")&&action==="receive"){const existing=await db.prepare("SELECT id,receipt_no receiptNo FROM goods_receipts WHERE organization_id=? AND idempotency_key=?").bind(org,value(body.idempotencyKey,100)).first<{id:number;receiptNo:string}>();if(existing)return Response.json({...existing,spools:await receiptSpools(org,existing.id),idempotent:true})}return fail(message.includes("constraint")?"采购状态已变化，请刷新后重试":message,message.includes("constraint")?409:400)}
}
