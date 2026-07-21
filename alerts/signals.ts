export type AlertSignal={fingerprint:string;type:"printer_offline"|"command_timeout"|"command_failed"|"low_stock"|"maintenance_due";severity:"info"|"warning"|"critical";title:string;detail:string;resourceType:string;resourceId:string};
type Query={bind:(...values:unknown[])=>Query;all:<T>()=>Promise<{results?:T[]}>;first:<T>()=>Promise<T|null>;run:()=>Promise<unknown>};
export type AlertDb={prepare:(sql:string)=>Query;batch:(statements:Query[])=>Promise<unknown>};
const results=<T>(value:{results?:T[]})=>value.results??[];

export async function collectAlertSignals(db:AlertDb,organizationId:number):Promise<AlertSignal[]>{
  const [offline,commands,stock,maintenance]=await Promise.all([
    db.prepare(`SELECT p.id,p.name,p.last_seen_at FROM printers p JOIN printer_bindings pb ON pb.printer_id=p.id WHERE pb.organization_id=? AND pb.status IN ('bound','online','active') AND p.connector_type<>'manual' AND (p.last_seen_at IS NULL OR datetime(p.last_seen_at)<datetime('now','-2 minutes'))`).bind(organizationId).all<{id:number;name:string;last_seen_at:string|null}>(),
    db.prepare(`SELECT c.id,c.status,c.created_at,p.name FROM printer_commands c JOIN printer_bindings pb ON pb.id=c.binding_id JOIN printers p ON p.id=c.printer_id WHERE pb.organization_id=? AND ((c.status IN ('待执行','pending','queued') AND datetime(c.created_at)<datetime('now','-5 minutes')) OR c.status IN ('失败','failed','error'))`).bind(organizationId).all<{id:number;status:string;created_at:string;name:string}>(),
    db.prepare(`SELECT b.id,b.material,b.color,b.remaining_grams,b.low_stock_grams FROM material_batches b WHERE b.remaining_grams<=b.low_stock_grams AND EXISTS (SELECT 1 FROM inventory_printer_allocations a JOIN printer_bindings pb ON pb.printer_id=a.printer_id WHERE a.batch_id=b.id AND pb.organization_id=?)`).bind(organizationId).all<{id:number;material:string;color:string;remaining_grams:number;low_stock_grams:number}>(),
    db.prepare(`SELECT p.id,p.name,p.maintenance_due_at FROM printers p JOIN printer_bindings pb ON pb.printer_id=p.id WHERE pb.organization_id=? AND p.maintenance_due_at IS NOT NULL AND datetime(p.maintenance_due_at)<=datetime('now')`).bind(organizationId).all<{id:number;name:string;maintenance_due_at:string}>(),
  ]);
  return [
    ...results(offline).map(row=>({fingerprint:`printer_offline:${row.id}`,type:"printer_offline" as const,severity:"critical" as const,title:`${row.name} 已离线`,detail:row.last_seen_at?`最后上报：${row.last_seen_at}`:"设备从未上报在线状态",resourceType:"printer",resourceId:String(row.id)})),
    ...results(commands).map(row=>{const failed=["失败","failed","error"].includes(row.status);return {fingerprint:`${failed?"command_failed":"command_timeout"}:${row.id}`,type:failed?"command_failed" as const:"command_timeout" as const,severity:failed?"critical" as const:"warning" as const,title:`${row.name} 命令${failed?"执行失败":"等待超时"}`,detail:`命令 #${row.id}，状态：${row.status}，创建于 ${row.created_at}`,resourceType:"printer_command",resourceId:String(row.id)}}),
    ...results(stock).map(row=>({fingerprint:`low_stock:${row.id}`,type:"low_stock" as const,severity:"warning" as const,title:`${row.material} ${row.color} 库存不足`,detail:`剩余 ${row.remaining_grams}g，预警线 ${row.low_stock_grams}g`,resourceType:"material_batch",resourceId:String(row.id)})),
    ...results(maintenance).map(row=>({fingerprint:`maintenance_due:${row.id}:${row.maintenance_due_at}`,type:"maintenance_due" as const,severity:"warning" as const,title:`${row.name} 维护已到期`,detail:`计划维护时间：${row.maintenance_due_at}`,resourceType:"printer",resourceId:String(row.id)})),
  ];
}

export async function synchronizeAlerts(db:AlertDb,organizationId:number,signals:AlertSignal[],now=new Date().toISOString()){
  const fingerprints=signals.map(signal=>signal.fingerprint);
  for(const signal of signals){
    const existing=await db.prepare("SELECT id,status,signal_active FROM alerts WHERE organization_id=? AND fingerprint=?").bind(organizationId,signal.fingerprint).first<{id:number;status:string;signal_active:number}>();
    if(!existing){
      await db.batch([db.prepare("INSERT INTO alerts(organization_id,fingerprint,type,severity,status,title,detail,resource_type,resource_id,signal_active,first_detected_at,last_detected_at) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)").bind(organizationId,signal.fingerprint,signal.type,signal.severity,"open",signal.title,signal.detail,signal.resourceType,signal.resourceId,now,now),db.prepare("INSERT INTO alert_actions(organization_id,alert_id,actor_email,action,to_status,note) SELECT ?,id,'system','detected','open','首次检测到信号' FROM alerts WHERE organization_id=? AND fingerprint=?").bind(organizationId,organizationId,signal.fingerprint)]);
    }else if(!existing.signal_active){
      await db.batch([db.prepare("UPDATE alerts SET severity=?,status='open',title=?,detail=?,signal_active=1,occurrence_count=occurrence_count+1,last_detected_at=?,cleared_at=NULL,acknowledged_at=NULL,acknowledged_by=NULL,resolved_at=NULL,resolved_by=NULL,updated_at=? WHERE id=? AND organization_id=?").bind(signal.severity,signal.title,signal.detail,now,now,existing.id,organizationId),db.prepare("INSERT INTO alert_actions(organization_id,alert_id,actor_email,action,from_status,to_status,note) VALUES(?,?, 'system','reopen',?,'open','信号消失后再次出现')").bind(organizationId,existing.id,existing.status)]);
    }else await db.prepare("UPDATE alerts SET severity=?,title=?,detail=?,last_detected_at=?,updated_at=? WHERE id=? AND organization_id=?").bind(signal.severity,signal.title,signal.detail,now,now,existing.id,organizationId).run();
  }
  const active=await db.prepare("SELECT id,fingerprint,status FROM alerts WHERE organization_id=? AND signal_active=1").bind(organizationId).all<{id:number;fingerprint:string;status:string}>();
  const current=new Set(fingerprints),cleared=results(active).filter(row=>!current.has(row.fingerprint));
  for(const row of cleared)await db.batch([db.prepare("UPDATE alerts SET signal_active=0,cleared_at=?,updated_at=? WHERE id=? AND organization_id=?").bind(now,now,row.id,organizationId),db.prepare("INSERT INTO alert_actions(organization_id,alert_id,actor_email,action,from_status,to_status,note) VALUES(?,?, 'system','cleared',?,?,'当前信号已消失')").bind(organizationId,row.id,row.status,row.status)]);
  return {active:signals.length,createdOrRefreshed:signals.length,cleared:cleared.length};
}
