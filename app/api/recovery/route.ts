import {getD1} from "../../../db";
import {BACKUP_TABLES,checksumBackup,countRows,sanitizeBackupValue,serializeBackup,validateBackup,type BackupPayload} from "../../../recovery/backup";
import {getAccessContext,recordAudit} from "../../access-control";
import {requireApiAccess} from "../../api-auth";

type BackupRow={id:number;organization_id:number;status:string;schema_version:number;checksum:string;payload_json:string;row_count:number;retention_days:number;expires_at:string;created_by:string;verified_at:string|null;created_at:string};
async function context(){const denied=await requireApiAccess(false,"system.manage");if(denied)return {denied};const user=await getAccessContext();return user?{user}:{denied:Response.json({error:"请先登录"},{status:401})}}
async function tableRows(table:string,organizationId:number){
  const condition=table==="organizations"?"id=?":"organization_id=?";
  const result=await getD1().prepare(`SELECT * FROM ${table} WHERE ${condition} ORDER BY id`).bind(organizationId).all<Record<string,unknown>>();
  return sanitizeBackupValue(result.results??[]) as Record<string,unknown>[];
}
async function currentCounts(organizationId:number){const counts:Record<string,number>={};for(const table of BACKUP_TABLES)counts[table]=(await tableRows(table,organizationId)).length;return counts}

export async function GET(request:Request){
  const access=await context();if(access.denied)return access.denied;const user=access.user!;
  const url=new URL(request.url),download=Number(url.searchParams.get("download")||0),db=getD1();
  if(download){const backup=await db.prepare("SELECT * FROM recovery_backups WHERE id=? AND organization_id=? AND status='ready'").bind(download,user.organizationId).first<BackupRow>();if(!backup)return Response.json({error:"备份不存在或尚未就绪"},{status:404});await recordAudit(user,"recovery.backup.download","recovery_backup",String(download),{checksum:backup.checksum});return new Response(backup.payload_json,{headers:{"Content-Type":"application/json; charset=utf-8","Content-Disposition":`attachment; filename="layertrace-org-${user.organizationId}-backup-${backup.id}.json"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","X-Backup-Checksum":backup.checksum}})}
  const [backups,drills,approvals]=await Promise.all([
    db.prepare("SELECT id,status,schema_version,checksum,row_count,retention_days,expires_at,created_by,verified_at,created_at FROM recovery_backups WHERE organization_id=? ORDER BY id DESC LIMIT 50").bind(user.organizationId).all(),
    db.prepare("SELECT id,backup_id,source_checksum,status,difference_report,requested_by,created_at FROM recovery_drills WHERE organization_id=? ORDER BY id DESC LIMIT 50").bind(user.organizationId).all(),
    db.prepare("SELECT id,drill_id,decision,note,decided_by,created_at FROM recovery_approvals WHERE organization_id=? ORDER BY id DESC LIMIT 50").bind(user.organizationId).all(),
  ]);return Response.json({backups:backups.results,drills:drills.results,approvals:approvals.results},{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:Request){
  const access=await context();if(access.denied)return access.denied;const user=access.user!,db=getD1();
  try{
    const body=await request.json() as {action?:string;retentionDays?:number;backupId?:number;payload?:unknown;checksum?:string;drillId?:number;decision?:string;note?:string};
    if(body.action==="generate"){
      const retentionDays=Math.min(365,Math.max(1,Math.trunc(Number(body.retentionDays)||30))),expiresAt=new Date(Date.now()+retentionDays*86400000).toISOString();
      const created=await db.prepare("INSERT INTO recovery_backups(organization_id,status,retention_days,expires_at,created_by) VALUES(?,'generating',?,?,?) RETURNING id").bind(user.organizationId,retentionDays,expiresAt,user.email).first<{id:number}>();
      try{const tables:BackupPayload["tables"]={};for(const table of BACKUP_TABLES)tables[table]=await tableRows(table,user.organizationId);const payload:BackupPayload={format:"layertrace-org-backup",schemaVersion:1,organizationId:user.organizationId,createdAt:new Date().toISOString(),tables},serialized=serializeBackup(payload),checksum=await checksumBackup(serialized),rows=countRows(payload);await db.prepare("UPDATE recovery_backups SET status='ready',checksum=?,payload_json=?,row_count=?,verified_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?").bind(checksum,serialized,rows,created!.id,user.organizationId).run();await recordAudit(user,"recovery.backup.generate","recovery_backup",String(created!.id),{checksum,rowCount:rows,retentionDays});return Response.json({id:created!.id,checksum,rowCount:rows},{status:201})}catch(error){await db.prepare("UPDATE recovery_backups SET status='failed' WHERE id=? AND organization_id=?").bind(created!.id,user.organizationId).run();throw error}
    }
    if(body.action==="dry-run"){
      let raw:unknown,checksum=String(body.checksum||""),backupId:number|null=null;
      if(body.backupId){const backup=await db.prepare("SELECT * FROM recovery_backups WHERE id=? AND organization_id=?").bind(body.backupId,user.organizationId).first<BackupRow>();if(!backup)throw new Error("找不到当前组织的备份");raw=backup.payload_json;checksum=backup.checksum;backupId=backup.id}else{const text=typeof body.payload==="string"?body.payload:JSON.stringify(body.payload);if(new TextEncoder().encode(text).length>5_000_000)throw new Error("导入备份不能超过 5MB");raw=body.payload}
      try{const payload=await validateBackup(raw,checksum,user.organizationId),counts=await currentCounts(user.organizationId),tables=Object.fromEntries(Object.entries(payload.tables).map(([table,rows])=>[table,{backupRows:rows.length,currentRows:counts[table]??0,difference:rows.length-(counts[table]??0)}])),report={mode:"dry-run",productionWrites:0,valid:true,tables};const drill=await db.prepare("INSERT INTO recovery_drills(organization_id,backup_id,source_checksum,status,difference_report,requested_by) VALUES(?,?,?,'passed',?,?) RETURNING id").bind(user.organizationId,backupId,checksum,JSON.stringify(report),user.email).first<{id:number}>();await recordAudit(user,"recovery.drill.pass","recovery_drill",String(drill!.id),{backupId,checksum});return Response.json({drillId:drill!.id,report})}catch(error){if(backupId)await db.prepare("UPDATE recovery_backups SET status='corrupt' WHERE id=? AND organization_id=?").bind(backupId,user.organizationId).run();const report={mode:"dry-run",productionWrites:0,valid:false,error:error instanceof Error?error.message:"验证失败"};const drill=await db.prepare("INSERT INTO recovery_drills(organization_id,backup_id,source_checksum,status,difference_report,requested_by) VALUES(?,?,?,'rejected',?,?) RETURNING id").bind(user.organizationId,backupId,checksum,JSON.stringify(report),user.email).first<{id:number}>();await recordAudit(user,"recovery.drill.reject","recovery_drill",String(drill!.id),{backupId,checksum,error:report.error});return Response.json({error:report.error,drillId:drill!.id,report},{status:422})}
    }
    if(body.action==="approve"){
      const decision=body.decision==="rejected"?"rejected":"approved",drill=await db.prepare("SELECT id,status FROM recovery_drills WHERE id=? AND organization_id=?").bind(Number(body.drillId),user.organizationId).first<{id:number;status:string}>();if(!drill)throw new Error("找不到当前组织的恢复演练");if(decision==="approved"&&drill.status!=="passed")throw new Error("未通过的演练不能批准");const approval=await db.prepare("INSERT INTO recovery_approvals(organization_id,drill_id,decision,note,decided_by) VALUES(?,?,?,?,?) RETURNING id").bind(user.organizationId,drill.id,decision,String(body.note||"").slice(0,500),user.email).first<{id:number}>();await recordAudit(user,"recovery.approval.record","recovery_drill",String(drill.id),{decision,approvalId:approval!.id});return Response.json({id:approval!.id,decision},{status:201});
    }
    return Response.json({error:"不支持的操作"},{status:400});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"恢复中心操作失败"},{status:400})}
}
