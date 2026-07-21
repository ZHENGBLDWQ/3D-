import {getD1} from "../../../db";
import {can,getAccessContext,recordAudit} from "../../access-control";
import {collectAlertSignals,synchronizeAlerts} from "../../../alerts/signals";

export async function GET(){
  const context=await getAccessContext();if(!context)return Response.json({error:"请先登录"},{status:401});if(!can(context,"read"))return Response.json({error:"没有读取告警的权限"},{status:403});
  try{const db=getD1();const signals=await collectAlertSignals(db,context.organizationId);const sync=await synchronizeAlerts(db,context.organizationId,signals);const [alerts,actions,members]=await Promise.all([
    db.prepare("SELECT id,fingerprint,type,severity,status,title,detail,resource_type resourceType,resource_id resourceId,assigned_to assignedTo,signal_active signalActive,occurrence_count occurrenceCount,first_detected_at firstDetectedAt,last_detected_at lastDetectedAt,cleared_at clearedAt,acknowledged_at acknowledgedAt,resolved_at resolvedAt FROM alerts WHERE organization_id=? ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,last_detected_at DESC LIMIT 250").bind(context.organizationId).all(),
    db.prepare("SELECT id,alert_id alertId,actor_email actorEmail,action,from_status fromStatus,to_status toStatus,assigned_to assignedTo,note,created_at createdAt FROM alert_actions WHERE organization_id=? ORDER BY id DESC LIMIT 300").bind(context.organizationId).all(),
    db.prepare("SELECT email,display_name displayName,role FROM organization_members WHERE organization_id=? AND status='active' ORDER BY display_name,email").bind(context.organizationId).all(),
  ]);return Response.json({alerts:alerts.results,actions:actions.results,members:members.results,sync,checkedAt:new Date().toISOString()});}catch(error){return Response.json({error:error instanceof Error?error.message:"告警同步失败"},{status:500})}
}

export async function PATCH(request:Request){
  const context=await getAccessContext();if(!context)return Response.json({error:"请先登录"},{status:401});
  try{const body=await request.json() as {id?:number;action?:string;assignedTo?:string;note?:string};const id=Number(body.id),action=body.action??"";if(!id||!["acknowledge","assign","resolve","reopen"].includes(action))return Response.json({error:"无效的告警操作"},{status:400});
    const operational=action==="acknowledge"||action==="reopen";if(!can(context,operational?"printers.control":"write"))return Response.json({error:"当前岗位没有执行此告警操作的权限"},{status:403});
    const db=getD1(),alert=await db.prepare("SELECT id,status FROM alerts WHERE id=? AND organization_id=?").bind(id,context.organizationId).first<{id:number;status:string}>();if(!alert)return Response.json({error:"告警不存在"},{status:404});let next=alert.status;const assignedTo=(body.assignedTo??"").trim().toLowerCase()||null;
    if(action==="acknowledge"){if(alert.status!=="open")return Response.json({error:"只有待处理告警可以确认"},{status:409});next="acknowledged"}
    if(action==="resolve"){if(alert.status==="resolved")return Response.json({error:"告警已经解决"},{status:409});next="resolved"}
    if(action==="reopen"){if(alert.status!=="resolved")return Response.json({error:"只有已解决告警可以重开"},{status:409});next="open"}
    if(action==="assign"){if(!assignedTo)return Response.json({error:"请选择负责人"},{status:400});const member=await db.prepare("SELECT email FROM organization_members WHERE organization_id=? AND lower(email)=? AND status='active'").bind(context.organizationId,assignedTo).first();if(!member)return Response.json({error:"负责人不属于当前组织"},{status:400})}
    const now=new Date().toISOString(),statements=[];if(action==="assign")statements.push(db.prepare("UPDATE alerts SET assigned_to=?,updated_at=? WHERE id=? AND organization_id=?").bind(assignedTo,now,id,context.organizationId));else if(action==="acknowledge")statements.push(db.prepare("UPDATE alerts SET status='acknowledged',acknowledged_at=?,acknowledged_by=?,updated_at=? WHERE id=? AND organization_id=?").bind(now,context.email,now,id,context.organizationId));else if(action==="resolve")statements.push(db.prepare("UPDATE alerts SET status='resolved',resolved_at=?,resolved_by=?,updated_at=? WHERE id=? AND organization_id=?").bind(now,context.email,now,id,context.organizationId));else statements.push(db.prepare("UPDATE alerts SET status='open',acknowledged_at=NULL,acknowledged_by=NULL,resolved_at=NULL,resolved_by=NULL,updated_at=? WHERE id=? AND organization_id=?").bind(now,id,context.organizationId));
    statements.push(db.prepare("INSERT INTO alert_actions(organization_id,alert_id,actor_email,action,from_status,to_status,assigned_to,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(context.organizationId,id,context.email,action,alert.status,next,assignedTo,(body.note??"").trim().slice(0,500),now));await db.batch(statements);await recordAudit(context,`alert.${action}`,"alert",String(id),{fromStatus:alert.status,toStatus:next,assignedTo});return Response.json({ok:true,status:next});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"告警操作失败"},{status:500})}
}
