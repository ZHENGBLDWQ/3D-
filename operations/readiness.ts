import {env} from "cloudflare:workers";
import {getD1} from "../db";

export type ReadinessCheck={key:string;label:string;status:"pass"|"warning"|"fail";detail:string;actionHref?:string};
export type ReadinessReport={status:"ready"|"attention"|"blocked";score:number;generatedAt:string;checks:ReadinessCheck[]};

async function safeCheck(key:string,label:string,run:()=>Promise<Omit<ReadinessCheck,"key"|"label">>):Promise<ReadinessCheck>{
  try{return{key,label,...await run()}}catch(error){return{key,label,status:"fail",detail:error instanceof Error?error.message:"检查失败"}}
}

export async function getProductionReadiness(organizationId:number):Promise<ReadinessReport>{
  const bindings=env as unknown as {DB?:unknown;FILES?:unknown;SESSION_SECRET?:string;ADMIN_EMAILS?:string;ADMIN_PASSWORD?:string};
  const db=getD1();
  const checks=await Promise.all([
    safeCheck("database","数据库连接",async()=>{await db.prepare("SELECT 1 AS ok").first();return{status:"pass",detail:"D1 数据库连接正常"} as const}),
    safeCheck("migrations","数据库迁移",async()=>{const row=await db.prepare("SELECT MAX(id) AS latest,COUNT(*) AS count FROM layertrace_migrations").first<{latest:number;count:number}>();const latest=Number(row?.latest??-1);return latest>=54?{status:"pass",detail:`迁移已应用至 0054，共 ${Number(row?.count||0)} 条`}:{status:"fail",detail:`迁移仅应用至 ${String(latest).padStart(4,"0")}，需要执行最新迁移`,actionHref:"/settings"} as const}),
    safeCheck("files","文件存储",async()=>bindings.FILES?{status:"pass",detail:"R2 文件存储绑定可用"}:{status:"fail",detail:"缺少 FILES 对象存储绑定，模型与附件无法可靠保存",actionHref:"/settings"} as const),
    safeCheck("auth","管理员认证",async()=>{const row=await db.prepare("SELECT COUNT(*) AS count FROM organization_members WHERE organization_id=? AND role='owner' AND status='active' AND password_hash IS NOT NULL").bind(organizationId).first<{count:number}>();const configured=Number(row?.count||0)>0||Boolean(bindings.ADMIN_EMAILS&&bindings.ADMIN_PASSWORD);return configured?{status:"pass",detail:"至少有一个可登录的系统所有者"}:{status:"fail",detail:"尚未创建可登录的系统所有者",actionHref:"/setup"} as const}),
    safeCheck("session","会话密钥",async()=>{const row=await db.prepare("SELECT value FROM app_secrets WHERE name='session_secret'").first<{value:string}>();return bindings.SESSION_SECRET||row?.value?{status:"pass",detail:bindings.SESSION_SECRET?"使用部署环境会话密钥":"使用数据库持久化会话密钥"}:{status:"fail",detail:"会话密钥尚未初始化，请先完成管理员设置",actionHref:"/setup"} as const}),
    safeCheck("backup","备份新鲜度",async()=>{const row=await db.prepare("SELECT created_at FROM recovery_backups WHERE organization_id=? AND status='ready' ORDER BY id DESC LIMIT 1").bind(organizationId).first<{created_at:string}>();if(!row)return{status:"fail",detail:"尚无可用组织备份",actionHref:"/recovery"} as const;const ageDays=(Date.now()-new Date(row.created_at).getTime())/86400000;return ageDays<=7?{status:"pass",detail:`最近备份：${new Date(row.created_at).toLocaleString("zh-CN")}`,actionHref:"/recovery"}:{status:"warning",detail:`最近备份已超过 ${Math.floor(ageDays)} 天`,actionHref:"/recovery"} as const}),
    safeCheck("recovery","恢复演练",async()=>{const row=await db.prepare("SELECT created_at FROM recovery_drills WHERE organization_id=? AND status='passed' ORDER BY id DESC LIMIT 1").bind(organizationId).first<{created_at:string}>();if(!row)return{status:"warning",detail:"尚未完成通过的恢复演练",actionHref:"/recovery"} as const;const ageDays=(Date.now()-new Date(row.created_at).getTime())/86400000;return ageDays<=30?{status:"pass",detail:`最近通过演练：${new Date(row.created_at).toLocaleString("zh-CN")}`,actionHref:"/recovery"}:{status:"warning",detail:`恢复演练已超过 ${Math.floor(ageDays)} 天`,actionHref:"/recovery"} as const}),
    safeCheck("gateway","设备网关",async()=>{const row=await db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN last_seen_at>=datetime('now','-5 minutes') THEN 1 ELSE 0 END) AS online FROM local_gateways WHERE organization_id=?").bind(organizationId).first<{total:number;online:number}>();const total=Number(row?.total||0),online=Number(row?.online||0);return total===0?{status:"warning",detail:"尚未登记局域网设备网关",actionHref:"/gateways"}:online===total?{status:"pass",detail:`${online}/${total} 个网关在线`,actionHref:"/gateways"}:{status:"warning",detail:`仅 ${online}/${total} 个网关在 5 分钟内上报`,actionHref:"/gateways"} as const}),
  ]);
  const score=Math.max(0,100-checks.reduce((sum,item)=>sum+(item.status==="fail"?18:item.status==="warning"?7:0),0));
  const status=checks.some(item=>item.status==="fail")?"blocked":checks.some(item=>item.status==="warning")?"attention":"ready";
  return{status,score,generatedAt:new Date().toISOString(),checks};
}
