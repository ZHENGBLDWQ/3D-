export type BackupPayload={format:"layertrace-org-backup";schemaVersion:1;organizationId:number;createdAt:string;tables:Record<string,Record<string,unknown>[]>};

export const BACKUP_TABLES=["organizations","organization_members","orders","print_jobs","printers","material_batches","inventory_transactions","model_assets","slicing_profiles","slicing_jobs","preflight_runs","production_plans","printer_schedules","dispatch_workflows","execution_events","material_reservations","production_outcomes","quality_inspections","scrap_records","material_settlements","alerts","alert_actions","maintenance_plans","maintenance_records"] as const;
export const SENSITIVE_FIELD=/password|secret|token|credential|access[_-]?code|private[_-]?key|connector[_-]?hash|authorization/i;

export function sanitizeBackupValue(value:unknown):unknown{
  if(Array.isArray(value))return value.map(sanitizeBackupValue);
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([key])=>!SENSITIVE_FIELD.test(key)).map(([key,item])=>[key,sanitizeBackupValue(item)]));
  return value;
}
export function containsSensitiveKeys(value:unknown):boolean{
  if(Array.isArray(value))return value.some(containsSensitiveKeys);
  if(value&&typeof value==="object")return Object.entries(value as Record<string,unknown>).some(([key,item])=>SENSITIVE_FIELD.test(key)||containsSensitiveKeys(item));
  return false;
}
function canonical(value:unknown):string{
  if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
  if(value&&typeof value==="object")return `{${Object.keys(value as object).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function serializeBackup(payload:BackupPayload){return canonical(sanitizeBackupValue(payload))}
export async function checksumBackup(payload:BackupPayload|string){const bytes=new TextEncoder().encode(typeof payload==="string"?payload:serializeBackup(payload));const hash=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,"0")).join("")}
export async function validateBackup(input:unknown,expectedChecksum:string,organizationId:number){
  const payload=(typeof input==="string"?JSON.parse(input):input) as BackupPayload;
  if(!payload||payload.format!=="layertrace-org-backup"||payload.schemaVersion!==1||!payload.tables)throw new Error("备份格式或版本不受支持");
  if(payload.organizationId!==organizationId)throw new Error("备份不属于当前组织");
  const clean=sanitizeBackupValue(payload) as BackupPayload,actual=await checksumBackup(clean);
  if(!/^[a-f0-9]{64}$/.test(expectedChecksum)||actual!==expectedChecksum)throw new Error("备份校验和不匹配，文件可能已损坏");
  if(containsSensitiveKeys(clean))throw new Error("备份中包含禁止的敏感字段");
  return clean;
}
export function countRows(payload:BackupPayload){return Object.values(payload.tables).reduce((sum,rows)=>sum+rows.length,0)}
