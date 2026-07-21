import {can,getAccessContext,recordAudit} from "../../access-control";
import {requireApiAccess} from "../../api-auth";
import {getD1} from "../../../db";

const fail=(error:string,status=400)=>Response.json({error},{status});
const id=(value:unknown)=>{const n=Number(value);return Number.isInteger(n)&&n>0?n:0};
const grams=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)&&n>=0?Math.round(n*1000)/1000:-1};
const text=(value:unknown,max=180)=>String(value??"").trim().slice(0,max);

export async function GET(){
  const denied=await requireApiAccess();if(denied)return denied;
  const context=await getAccessContext();if(!context)return fail("请先登录",401);
  const db=getD1(),org=context.organizationId;
  const [summary,catalog,spools,locations,printers,positions,bindings,movements,usage,unboundSlots,transit]=await Promise.all([
    db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN state='sealed' THEN 1 ELSE 0 END),0) sealedSpools,
      COALESCE(SUM(CASE WHEN state='sealed' THEN remaining_net_grams ELSE 0 END),0) sealedGrams,
      COALESCE(SUM(CASE WHEN state='in_use' THEN 1 ELSE 0 END),0) inUseSpools,
      COALESCE(SUM(CASE WHEN state='open_storage' THEN 1 ELSE 0 END),0) openSpools,
      COALESCE(SUM(remaining_net_grams),0) assetGrams,
      COALESCE(SUM(CASE WHEN state='needs_count' THEN 1 ELSE 0 END),0) needsCount
      FROM material_spools WHERE organization_id=? AND state NOT IN ('empty','scrapped')`).bind(org).first(),
    db.prepare(`SELECT c.id,c.catalog_code catalogCode,c.brand,c.series,c.material,c.color_name colorName,c.color_code colorCode,c.color_hex colorHex,c.default_net_grams defaultNetGrams,c.default_tare_grams defaultTareGrams,c.ams_compatibility amsCompatibility,c.tags,
      COALESCE(SUM(CASE WHEN s.state='sealed' THEN 1 ELSE 0 END),0) sealedCount,
      COALESCE(SUM(CASE WHEN s.state='sealed' THEN s.remaining_net_grams ELSE 0 END),0) sealedGrams,
      COALESCE(SUM(CASE WHEN s.state IN ('open_storage','in_use') THEN s.remaining_net_grams ELSE 0 END),0) openedGrams,
      COALESCE(b.low_stock_grams,0) lowStockGrams
      FROM material_catalog_items c LEFT JOIN material_spools s ON s.catalog_item_id=c.id AND s.organization_id=c.organization_id
      LEFT JOIN material_batches b ON b.id=c.legacy_batch_id WHERE c.organization_id=? GROUP BY c.id ORDER BY c.material,c.color_name`).bind(org).all(),
    db.prepare(`SELECT s.id,s.spool_code spoolCode,s.state,s.initial_net_grams initialNetGrams,s.remaining_net_grams remainingNetGrams,s.tare_grams tareGrams,s.last_gross_grams lastGrossGrams,s.rfid_uid rfidUid,s.last_weighed_at lastWeighedAt,s.updated_at updatedAt,
      c.catalog_code catalogCode,c.material,c.brand,c.color_name colorName,c.color_code colorCode,c.color_hex colorHex,l.id locationId,l.code locationCode,l.name locationName,l.kind locationKind
      FROM material_spools s JOIN material_catalog_items c ON c.id=s.catalog_item_id AND c.organization_id=s.organization_id JOIN inventory_locations_v2 l ON l.id=s.current_location_id AND l.organization_id=s.organization_id
      WHERE s.organization_id=? ORDER BY CASE s.state WHEN 'in_use' THEN 0 WHEN 'open_storage' THEN 1 WHEN 'sealed' THEN 2 ELSE 3 END,s.updated_at DESC`).bind(org).all(),
    db.prepare("SELECT id,code,name,kind,printer_id printerId FROM inventory_locations_v2 WHERE organization_id=? AND active=1 ORDER BY kind,name").bind(org).all(),
    db.prepare("SELECT DISTINCT p.id,p.name,p.model FROM printers p JOIN printer_bindings pb ON pb.printer_id=p.id WHERE pb.organization_id=? ORDER BY p.name").bind(org).all(),
    db.prepare(`SELECT f.id,f.printer_id printerId,p.name printerName,p.model,f.feed_kind feedKind,f.ams_unit amsUnit,f.slot_index slotIndex,f.toolhead,f.label
      FROM printer_feed_positions f JOIN printers p ON p.id=f.printer_id WHERE f.organization_id=? AND f.active=1 ORDER BY p.name,f.feed_kind,f.ams_unit,f.slot_index,f.toolhead`).bind(org).all(),
    db.prepare(`SELECT b.id,b.spool_id spoolId,b.feed_position_id feedPositionId,b.binding_source bindingSource,b.status,b.bound_at boundAt,s.spool_code spoolCode,s.remaining_net_grams remainingNetGrams,c.material,c.color_name colorName,c.color_hex colorHex,
      f.printer_id printerId,p.name printerName,p.model,f.feed_kind feedKind,f.ams_unit amsUnit,f.slot_index slotIndex,f.toolhead
      FROM spool_bindings b JOIN material_spools s ON s.id=b.spool_id AND s.organization_id=b.organization_id JOIN material_catalog_items c ON c.id=s.catalog_item_id
      JOIN printer_feed_positions f ON f.id=b.feed_position_id AND f.organization_id=b.organization_id JOIN printers p ON p.id=f.printer_id
      WHERE b.organization_id=? AND b.status='active' ORDER BY p.name,f.toolhead,f.ams_unit,f.slot_index`).bind(org).all(),
    db.prepare(`SELECT m.id,m.movement_type movementType,m.net_grams_delta netGramsDelta,m.note,m.operator_email operatorEmail,m.occurred_at occurredAt,s.spool_code spoolCode,c.material,c.color_name colorName,fl.name fromLocation,tl.name toLocation
      FROM material_spool_movements m JOIN material_spools s ON s.id=m.spool_id AND s.organization_id=m.organization_id JOIN material_catalog_items c ON c.id=s.catalog_item_id
      LEFT JOIN inventory_locations_v2 fl ON fl.id=m.from_location_id LEFT JOIN inventory_locations_v2 tl ON tl.id=m.to_location_id
      WHERE m.organization_id=? ORDER BY m.occurred_at DESC,m.id DESC LIMIT 120`).bind(org).all(),
    db.prepare(`SELECT u.id,u.print_session_id printSessionId,u.spool_id spoolId,u.toolhead,u.purpose,u.estimated_grams estimatedGrams,u.settled_grams settledGrams,u.measured_grams measuredGrams,u.estimate_source estimateSource,u.settled_at settledAt,
      ps.filename,ps.status sessionStatus,p.name printerName,s.spool_code spoolCode
      FROM print_material_usage_lines u JOIN print_sessions ps ON ps.id=u.print_session_id AND ps.organization_id=u.organization_id JOIN printers p ON p.id=ps.printer_id
      LEFT JOIN material_spools s ON s.id=u.spool_id AND s.organization_id=u.organization_id WHERE u.organization_id=? ORDER BY ps.last_observed_at DESC,u.id DESC LIMIT 100`).bind(org).all(),
    db.prepare(`SELECT f.id,f.printer_id printerId,p.name printerName,f.ams_unit amsUnit,f.slot_index slotIndex,f.feed_kind feedKind,f.toolhead,'' material,'' colorHex,NULL remainingPercent,0 active,f.updated_at lastSeenAt
      FROM printer_feed_positions f JOIN printers p ON p.id=f.printer_id
      WHERE f.organization_id=? AND f.active=1 AND NOT EXISTS(SELECT 1 FROM spool_bindings b WHERE b.organization_id=f.organization_id AND b.feed_position_id=f.id AND b.status='active')
      ORDER BY p.name,f.toolhead,f.ams_unit,f.slot_index`).bind(org).all(),
    db.prepare(`SELECT po.id,po.purchase_no purchaseNo,po.status,s.name supplierName,COALESCE(SUM(i.ordered_grams-i.received_grams),0) incomingGrams
      FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id AND s.organization_id=po.organization_id JOIN purchase_order_items i ON i.purchase_order_id=po.id AND i.organization_id=po.organization_id
      WHERE po.organization_id=? AND po.status IN ('ordered','partially_received') GROUP BY po.id ORDER BY po.created_at DESC`).bind(org).all(),
  ]);
  return Response.json({canWrite:can(context,"inventory.write"),summary:summary??{},catalog:catalog.results,spools:spools.results,locations:locations.results,printers:printers.results,positions:positions.results,bindings:bindings.results,movements:movements.results,usage:usage.results,unboundSlots:unboundSlots.results,transit:transit.results});
}

export async function POST(request:Request){
  const denied=await requireApiAccess(true,"inventory.write");if(denied)return denied;
  const context=await getAccessContext();if(!context)return fail("请先登录",401);
  const body=await request.json() as Record<string,unknown>,action=text(body.action,40),db=getD1(),org=context.organizationId,now=new Date().toISOString();
  try{
    if(action==="receiveSpool"){
      const catalogItemId=id(body.catalogItemId),net=grams(body.netGrams),tare=grams(body.tareGrams),spoolCode=text(body.spoolCode,80).toUpperCase();if(!catalogItemId||net<=0||tare<0||!spoolCode)return fail("请填写耗材、卷码、净重和空盘重量");
      const owned=await db.prepare("SELECT id FROM material_catalog_items WHERE id=? AND organization_id=?").bind(catalogItemId,org).first();if(!owned)return fail("耗材目录不存在",404);
      const location=await db.prepare("SELECT id FROM inventory_locations_v2 WHERE organization_id=? AND kind='warehouse' AND active=1 ORDER BY id LIMIT 1").bind(org).first<{id:number}>();if(!location)return fail("请先配置仓库位置",409);
      const token=crypto.randomUUID(),key=`receipt:${token}`,lotNo=text(body.lotNo,80)||`MANUAL-${Date.now().toString(36).toUpperCase()}`,cost=Math.max(0,Math.round(Number(body.costPerKg||0)*100));
      const lot=await db.prepare("INSERT INTO material_purchase_lots(organization_id,catalog_item_id,lot_no,unit_cost_cents_per_kg,received_at) VALUES(?,?,?,?,?) ON CONFLICT(organization_id,lot_no) DO UPDATE SET catalog_item_id=excluded.catalog_item_id RETURNING id").bind(org,catalogItemId,lotNo,cost,now).first<{id:number}>();
      const spool=await db.prepare(`INSERT INTO material_spools(organization_id,spool_code,catalog_item_id,purchase_lot_id,current_location_id,state,initial_net_grams,remaining_net_grams,tare_grams,qr_token) VALUES(?,?,?,?,?,'sealed',?,?,?,?) RETURNING id`).bind(org,spoolCode,catalogItemId,lot!.id,location.id,net,net,tare,token).first<{id:number}>();
      await db.prepare("INSERT INTO material_spool_movements(organization_id,spool_id,movement_type,to_location_id,net_grams_delta,idempotency_key,operator_email,note) VALUES(?,?,'receipt',?,?,?,?,?)").bind(org,spool!.id,location.id,net,key,context.email,text(body.note,300)).run();
      await recordAudit(context,"inventory_v2.spool.received","material_spool",String(spool!.id),{spoolCode,net,lotNo});return Response.json({id:spool!.id},{status:201});
    }
    if(action==="confirmLegacySpool"){
      const spoolId=id(body.spoolId),spoolCode=text(body.spoolCode,80).toUpperCase(),physicalState=text(body.physicalState,30),net=grams(body.netGrams),tare=grams(body.tareGrams);
      if(!spoolId||!spoolCode||!["sealed","open_storage"].includes(physicalState)||net<=0||tare<0)return fail("请填写实体卷码、盘点状态、实际净重和空盘重量");
      const spool=await db.prepare("SELECT state,remaining_net_grams remaining,current_location_id locationId FROM material_spools WHERE id=? AND organization_id=?").bind(spoolId,org).first<{state:string;remaining:number;locationId:number}>();
      if(!spool)return fail("历史库存不存在",404);if(spool.state!=="needs_count")return fail("该记录已经完成迁移，不能重复确认",409);
      const variance=Math.round((net-spool.remaining)*1000)/1000,gross=Math.round((net+tare)*1000)/1000,key=`legacy-count:${crypto.randomUUID()}`;
      await db.batch([
        db.prepare("UPDATE material_spools SET spool_code=?,state=?,initial_net_grams=?,remaining_net_grams=?,tare_grams=?,last_gross_grams=?,last_weighed_at=?,opened_at=CASE WHEN ?='open_storage' THEN COALESCE(opened_at,?) ELSE opened_at END,updated_at=? WHERE id=? AND organization_id=? AND state='needs_count'").bind(spoolCode,physicalState,net,net,tare,gross,now,physicalState,now,now,spoolId,org),
        db.prepare("INSERT INTO material_spool_movements(organization_id,spool_id,movement_type,from_location_id,to_location_id,net_grams_delta,idempotency_key,operator_email,note) VALUES(?,?,'adjust',?,?,?,?,?,?)").bind(org,spoolId,spool.locationId,spool.locationId,variance,key,context.email,"历史聚合库存实物盘点并转为实体卷"),
        db.prepare("INSERT INTO spool_weight_checks(organization_id,spool_id,gross_grams,tare_grams,measured_net_grams,book_net_grams,variance_grams,measured_by,measured_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(org,spoolId,gross,tare,net,spool.remaining,variance,context.email,now),
      ]);
      await recordAudit(context,"inventory_v2.legacy.confirmed","material_spool",String(spoolId),{spoolCode,physicalState,net,tare,variance});return Response.json({spoolId,spoolCode,physicalState,net,variance});
    }
    if(action==="createFeed"){
      const printerId=id(body.printerId),feedKind=text(body.feedKind,20),toolhead=text(body.toolhead,20)||"main";if(!printerId||!["ams","ams_lite","ams_ht","external"].includes(feedKind)||!["main","auxiliary","left","right","unknown"].includes(toolhead))return fail("供料位置参数无效");
      const owned=await db.prepare("SELECT 1 FROM printer_bindings WHERE printer_id=? AND organization_id=? LIMIT 1").bind(printerId,org).first();if(!owned)return fail("打印机不属于当前组织",404);
      const amsUnit=body.amsUnit==null?null:Number(body.amsUnit),slotIndex=body.slotIndex==null?null:Number(body.slotIndex);
      const row=await db.prepare("INSERT INTO printer_feed_positions(organization_id,printer_id,feed_kind,ams_unit,slot_index,toolhead,label) VALUES(?,?,?,?,?,?,?) RETURNING id").bind(org,printerId,feedKind,amsUnit,slotIndex,toolhead,text(body.label,80)).first<{id:number}>();
      await recordAudit(context,"inventory_v2.feed.created","printer_feed_position",String(row!.id),{printerId,feedKind,toolhead});return Response.json({id:row!.id},{status:201});
    }
    if(action==="issue"){
      const spoolId=id(body.spoolId),positionId=id(body.feedPositionId);if(!spoolId||!positionId)return fail("请选择未拆封/开封卷和供料位置");
      const row=await db.prepare(`SELECT s.id,s.state,s.current_location_id locationId,f.id positionId,f.printer_id printerId FROM material_spools s JOIN printer_feed_positions f ON f.id=? AND f.organization_id=s.organization_id WHERE s.id=? AND s.organization_id=?`).bind(positionId,spoolId,org).first<{id:number;state:string;locationId:number;printerId:number}>();if(!row)return fail("耗材卷或供料位置不属于当前组织",404);if(!["sealed","open_storage"].includes(row.state))return fail(row.state==="needs_count"?"该历史库存尚未完成实物盘点，不能领用":"该耗材卷当前不能领用",409);
      const occupied=await db.prepare("SELECT id FROM spool_bindings WHERE (spool_id=? OR feed_position_id=?) AND status='active' LIMIT 1").bind(spoolId,positionId).first();if(occupied)return fail("耗材卷或供料位置已被占用",409);
      const code=`FEED-${positionId}`,feedLocation=await db.prepare("INSERT INTO inventory_locations_v2(organization_id,code,name,kind,printer_id) VALUES(?,?,?,'printer_feed',?) ON CONFLICT(organization_id,code) DO UPDATE SET active=1 RETURNING id").bind(org,code,`打印机供料位 ${positionId}`,row.printerId).first<{id:number}>(),key=`issue:${crypto.randomUUID()}`;
      await db.batch([
        db.prepare("INSERT INTO spool_bindings(organization_id,spool_id,feed_position_id,binding_source,status,bound_by,bound_at) VALUES(?,?,?,'scan','active',?,?)").bind(org,spoolId,positionId,context.email,now),
        db.prepare("UPDATE material_spools SET state='in_use',current_location_id=?,opened_at=COALESCE(opened_at,?),updated_at=? WHERE id=? AND organization_id=?").bind(feedLocation!.id,now,now,spoolId,org),
        db.prepare("INSERT INTO material_spool_movements(organization_id,spool_id,movement_type,from_location_id,to_location_id,net_grams_delta,idempotency_key,operator_email,note) VALUES(?,?,'issue',?,?,0,?,?,?)").bind(org,spoolId,row.locationId,feedLocation!.id,key,context.email,"领用到打印机；组织资产不减少"),
      ]);
      await recordAudit(context,"inventory_v2.spool.issued","material_spool",String(spoolId),{positionId});return Response.json({spoolId});
    }
    if(action==="return"){
      const bindingId=id(body.bindingId),row=await db.prepare(`SELECT b.id,b.spool_id spoolId,s.current_location_id locationId FROM spool_bindings b JOIN material_spools s ON s.id=b.spool_id AND s.organization_id=b.organization_id WHERE b.id=? AND b.organization_id=? AND b.status='active'`).bind(bindingId,org).first<{id:number;spoolId:number;locationId:number}>();if(!row)return fail("有效绑定不存在",404);
      const location=await db.prepare("SELECT id FROM inventory_locations_v2 WHERE organization_id=? AND kind='open_storage' AND active=1 ORDER BY id LIMIT 1").bind(org).first<{id:number}>();if(!location)return fail("缺少已开封周转位置",409);const key=`return:${crypto.randomUUID()}`;
      await db.batch([
        db.prepare("UPDATE spool_bindings SET status='released',unbound_at=? WHERE id=? AND organization_id=? AND status='active'").bind(now,bindingId,org),
        db.prepare("UPDATE material_spools SET state=CASE WHEN remaining_net_grams<=0 THEN 'empty' ELSE 'open_storage' END,current_location_id=?,updated_at=? WHERE id=? AND organization_id=?").bind(location.id,now,row.spoolId,org),
        db.prepare("INSERT INTO material_spool_movements(organization_id,spool_id,movement_type,from_location_id,to_location_id,net_grams_delta,idempotency_key,operator_email,note) VALUES(?,?,'return',?,?,0,?,?,?)").bind(org,row.spoolId,row.locationId,location.id,key,context.email,"在机耗材退回已开封周转"),
      ]);
      await recordAudit(context,"inventory_v2.spool.returned","material_spool",String(row.spoolId),{bindingId});return Response.json({spoolId:row.spoolId});
    }
    if(["loss","scrap"].includes(action)){
      const spoolId=id(body.spoolId),amount=grams(body.grams);if(!spoolId||amount<=0)return fail("请选择耗材卷并填写克重");
      const spool=await db.prepare("SELECT remaining_net_grams remaining,current_location_id locationId FROM material_spools WHERE id=? AND organization_id=?").bind(spoolId,org).first<{remaining:number;locationId:number}>();if(!spool)return fail("耗材卷不存在",404);if(amount>spool.remaining)return fail("扣减克重超过卷内余量",409);const next=spool.remaining-amount,key=`${action}:${crypto.randomUUID()}`;
      await db.batch([db.prepare("UPDATE material_spools SET remaining_net_grams=?,state=CASE WHEN ?<=0 THEN 'empty' ELSE state END,updated_at=? WHERE id=? AND organization_id=?").bind(next,next,now,spoolId,org),db.prepare("INSERT INTO material_spool_movements(organization_id,spool_id,movement_type,from_location_id,net_grams_delta,idempotency_key,operator_email,note) VALUES(?,?,?,?,?,?,?,?)").bind(org,spoolId,action,spool.locationId,-amount,key,context.email,text(body.note,300))]);
      await recordAudit(context,`inventory_v2.spool.${action}`,"material_spool",String(spoolId),{grams:amount});return Response.json({spoolId,remaining:next});
    }
    if(action==="weigh"){
      const spoolId=id(body.spoolId),gross=grams(body.grossGrams),tare=grams(body.tareGrams);if(!spoolId||gross<=0||tare<0||gross<tare)return fail("称重数据无效");
      const spool=await db.prepare("SELECT remaining_net_grams remaining,current_location_id locationId FROM material_spools WHERE id=? AND organization_id=?").bind(spoolId,org).first<{remaining:number;locationId:number}>();if(!spool)return fail("耗材卷不存在",404);const measured=Math.round((gross-tare)*1000)/1000,variance=Math.round((measured-spool.remaining)*1000)/1000,key=`weigh:${crypto.randomUUID()}`;
      const movement=await db.prepare("INSERT INTO material_spool_movements(organization_id,spool_id,movement_type,from_location_id,to_location_id,net_grams_delta,idempotency_key,operator_email,note) VALUES(?,?,'adjust',?,?,?,?,?,?) RETURNING id").bind(org,spoolId,spool.locationId,spool.locationId,variance,key,context.email,"称重校准").first<{id:number}>();
      await db.batch([db.prepare("UPDATE material_spools SET remaining_net_grams=?,tare_grams=?,last_gross_grams=?,last_weighed_at=?,state=CASE WHEN ?<=0 THEN 'empty' ELSE state END,updated_at=? WHERE id=? AND organization_id=?").bind(measured,tare,gross,now,measured,now,spoolId,org),db.prepare("INSERT INTO spool_weight_checks(organization_id,spool_id,gross_grams,tare_grams,measured_net_grams,book_net_grams,variance_grams,adjustment_movement_id,measured_by,measured_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(org,spoolId,gross,tare,measured,spool.remaining,variance,movement!.id,context.email,now)]);
      await recordAudit(context,"inventory_v2.spool.weighed","material_spool",String(spoolId),{gross,tare,measured,variance});return Response.json({spoolId,measured,variance});
    }
    return fail("不支持的库存操作");
  }catch(error){const message=error instanceof Error?error.message:"库存操作失败";if(message.includes("UNIQUE"))return fail("卷码、供料位置或幂等记录已经存在",409);return fail(message,400)}
}
