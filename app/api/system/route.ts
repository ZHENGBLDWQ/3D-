import { getD1 } from "../../../db";
import { requireApiAccess } from "../../api-auth";

const tables=["print_items","material_batches","material_inventory_meta","orders","order_items","item_materials","print_jobs","print_job_events","inventory_transactions","inventory_transaction_meta","inventory_stocktakes","inventory_printer_allocations","inventory_in_transit","print_files","printers","printer_commands","spoolman_spools"] as const;

export async function GET(request:Request){
  const url=new URL(request.url);const backup=url.searchParams.get("format")==="backup";
  const denied=await requireApiAccess(backup);if(denied)return denied;
  try{
    const d1=getD1();
    if(backup){const data:Record<string,unknown[]|string>={exportedAt:new Date().toISOString()};for(const table of tables){const result=table==="printers"?await d1.prepare("SELECT id,name,model,technology,location,nozzle_diameter,build_volume,status,total_hours,hourly_rate,maintenance_due_at,notes,connector_type,connection_state,last_seen_at,nozzle_temp,bed_temp,current_file,remote_progress,active_spool_external_id,created_at FROM printers").all():await d1.prepare(`SELECT * FROM ${table}`).all();data[table]=result.results;}return new Response(JSON.stringify(data,null,2),{headers:{"Content-Type":"application/json; charset=utf-8","Content-Disposition":`attachment; filename="layertrace-backup-${new Date().toISOString().slice(0,10)}.json"`,"Cache-Control":"no-store"}});}
    const [offline,pending,failed,lowStock,audit]=await Promise.all([
      d1.prepare("SELECT id,name,last_seen_at lastSeenAt,connection_state connectionState FROM printers WHERE connector_type!='manual' AND (last_seen_at IS NULL OR datetime(last_seen_at)<datetime('now','-2 minutes')) ORDER BY name").all(),
      d1.prepare("SELECT COUNT(*) count FROM printer_commands WHERE status='待执行' AND datetime(created_at)<datetime('now','-5 minutes')").first<{count:number}>(),
      d1.prepare("SELECT COUNT(*) count FROM printer_commands WHERE status='失败'").first<{count:number}>(),
      d1.prepare("SELECT id,material,color,remaining_grams remainingGrams,low_stock_grams lowStockGrams FROM material_batches WHERE remaining_grams<=low_stock_grams ORDER BY remaining_grams").all(),
      d1.prepare(`SELECT created_at createdAt,'打印任务' source,action,('任务 #'||job_id||'：'||from_status||' → '||to_status||CASE WHEN note!='' THEN '（'||note||'）' ELSE '' END) detail FROM print_job_events UNION ALL SELECT created_at,'设备命令',command,('打印机 #'||printer_id||'：'||status||CASE WHEN result!='' THEN '（'||result||'）' ELSE '' END) FROM printer_commands UNION ALL SELECT t.created_at,'库存流水',t.type,(b.material||' '||b.color||' '||t.grams||'g：'||t.note) FROM inventory_transactions t JOIN material_batches b ON b.id=t.batch_id ORDER BY createdAt DESC LIMIT 100`).all()
    ]);
    const alerts=[...offline.results.map((p)=>({level:"danger",title:`${p.name} 代理离线`,detail:p.lastSeenAt?`最后上报 ${p.lastSeenAt}`:"从未连接"})),...lowStock.results.map((m)=>({level:"warning",title:`${m.material} ${m.color} 库存不足`,detail:`剩余 ${m.remainingGrams}g，预警线 ${m.lowStockGrams}g`}))];if(Number(pending?.count))alerts.push({level:"warning",title:"设备命令执行超时",detail:`${pending?.count} 条命令等待超过 5 分钟`});if(Number(failed?.count))alerts.push({level:"danger",title:"设备命令执行失败",detail:`累计 ${failed?.count} 条失败命令`});
    return Response.json({health:{status:alerts.some(a=>a.level==="danger")?"异常":alerts.length?"需关注":"正常",offlinePrinters:offline.results.length,pendingCommands:Number(pending?.count||0),failedCommands:Number(failed?.count||0),lowStock:lowStock.results.length,checkedAt:new Date().toISOString()},alerts,audit:audit.results});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"系统状态读取失败"},{status:500});}
}
