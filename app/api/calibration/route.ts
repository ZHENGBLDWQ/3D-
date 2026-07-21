import {getAccessContext,recordAudit} from "../../access-control";
import {requireApiAccess} from "../../api-auth";
import {getD1} from "../../../db";

const fail=(error:string,status:number)=>Response.json({error},{status});
const allowedPrinter=(scope:number[],printerId:number)=>scope.length===0||scope.includes(printerId);

export async function GET(){
 const denied=await requireApiAccess();if(denied)return denied;
 const context=await getAccessContext();if(!context)return fail("请先登录",401);
 const db=getD1(),org=context.organizationId,scope=context.printerScope,scopeSql=scope.length?` AND ps.printer_id IN (${scope.map(()=>"?").join(",")})`:"",bindings=[org,...scope];
 const [eligible,tasks]=await Promise.all([
  db.prepare(`SELECT ps.id sessionId,ps.filename,ps.status sessionStatus,p.id printerId,p.name printerName,SUM(u.estimated_grams) estimatedGrams,GROUP_CONCAT(DISTINCT u.purpose) purposes,s.id spoolId,s.spool_code spoolCode,c.material,c.color_name colorName FROM print_material_usage_lines u JOIN print_sessions ps ON ps.id=u.print_session_id AND ps.organization_id=u.organization_id JOIN printers p ON p.id=ps.printer_id JOIN material_spools s ON s.id=u.spool_id AND s.organization_id=u.organization_id JOIN material_catalog_items c ON c.id=s.catalog_item_id AND c.organization_id=s.organization_id LEFT JOIN material_calibration_tasks t ON t.print_session_id=ps.id AND t.spool_id=s.id AND t.organization_id=u.organization_id WHERE u.organization_id=? AND u.settled_at IS NULL AND u.measured_grams IS NULL AND ps.status IN ('completed','failed','cancelled') AND t.id IS NULL${scopeSql} GROUP BY ps.id,p.id,s.id,c.id ORDER BY ps.last_observed_at DESC`).bind(...bindings).all(),
  db.prepare(`SELECT t.id,t.print_session_id sessionId,t.spool_id spoolId,t.status,t.before_gross_grams beforeGrossGrams,t.after_gross_grams afterGrossGrams,t.actual_consumed_grams actualConsumedGrams,t.notes,t.created_by createdBy,t.started_at startedAt,t.completed_at completedAt,t.created_at createdAt,p.name printerName,ps.filename,SUM(u.estimated_grams) estimatedGrams,GROUP_CONCAT(DISTINCT u.purpose) purposes,s.spool_code spoolCode,c.material,c.color_name colorName FROM material_calibration_tasks t JOIN print_sessions ps ON ps.id=t.print_session_id AND ps.organization_id=t.organization_id JOIN print_material_usage_lines u ON u.print_session_id=ps.id AND u.spool_id=t.spool_id AND u.organization_id=t.organization_id JOIN printers p ON p.id=t.printer_id JOIN material_spools s ON s.id=t.spool_id AND s.organization_id=t.organization_id JOIN material_catalog_items c ON c.id=s.catalog_item_id AND c.organization_id=t.organization_id WHERE t.organization_id=?${scope.length?` AND t.printer_id IN (${scope.map(()=>"?").join(",")})`:""} GROUP BY t.id ORDER BY CASE t.status WHEN 'in_progress' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END,t.id DESC LIMIT 100`).bind(...bindings).all(),
 ]);
 return Response.json({eligible:eligible.results,tasks:tasks.results});
}

export async function POST(request:Request){
 const denied=await requireApiAccess(true,"inventory.write");if(denied)return denied;
 const context=await getAccessContext();if(!context)return fail("请先登录",401);
 try{
  const body=await request.json() as{action?:"create"|"start"|"complete"|"cancel";sessionId?:number;spoolId?:number;taskId?:number;beforeGrossGrams?:number;afterGrossGrams?:number;notes?:string},db=getD1(),org=context.organizationId,now=new Date().toISOString();
  if(body.action==="create"){
   const sessionId=Number(body.sessionId),spoolId=Number(body.spoolId),target=await db.prepare(`SELECT ps.id,ps.printer_id printerId FROM print_sessions ps WHERE ps.id=? AND ps.organization_id=? AND ps.status IN ('completed','failed','cancelled') AND EXISTS(SELECT 1 FROM print_material_usage_lines u WHERE u.print_session_id=ps.id AND u.organization_id=ps.organization_id AND u.spool_id=? AND u.settled_at IS NULL AND u.measured_grams IS NULL)`).bind(sessionId,org,spoolId).first<{id:number;printerId:number}>();
   if(!target)return fail("该打印会话和实体卷不满足校准条件",409);if(!allowedPrinter(context.printerScope,target.printerId))return fail("无权操作该打印机",403);
   const row=await db.prepare("INSERT INTO material_calibration_tasks(organization_id,print_session_id,printer_id,spool_id,notes,created_by) VALUES(?,?,?,?,?,?) RETURNING id").bind(org,target.id,target.printerId,spoolId,String(body.notes||"").trim().slice(0,500),context.email).first<{id:number}>();
   await recordAudit(context,"calibration.task.created","material_calibration_task",String(row?.id||""),{sessionId:target.id,spoolId,printerId:target.printerId});return Response.json({id:row?.id},{status:201});
  }
  const taskId=Number(body.taskId),task=await db.prepare("SELECT id,status,print_session_id sessionId,spool_id spoolId,printer_id printerId FROM material_calibration_tasks WHERE id=? AND organization_id=?").bind(taskId,org).first<{id:number;status:string;sessionId:number;spoolId:number;printerId:number}>();
  if(!task)return fail("校准任务不存在",404);if(!allowedPrinter(context.printerScope,task.printerId))return fail("无权操作该打印机",403);
  if(body.action==="start"){
   if(task.status!=="planned")return fail("只有待执行任务可以开始",409);await db.prepare("UPDATE material_calibration_tasks SET status='in_progress',started_at=?,updated_at=? WHERE id=? AND organization_id=?").bind(now,now,task.id,org).run();
  }else if(body.action==="cancel"){
   if(!["planned","in_progress"].includes(task.status))return fail("当前任务不能取消",409);await db.prepare("UPDATE material_calibration_tasks SET status='cancelled',cancelled_at=?,updated_at=? WHERE id=? AND organization_id=?").bind(now,now,task.id,org).run();
  }else if(body.action==="complete"){
   if(task.status!=="in_progress")return fail("请先开始校准任务",409);const before=Number(body.beforeGrossGrams),after=Number(body.afterGrossGrams),actual=before-after;if(!Number.isFinite(before)||!Number.isFinite(after)||before<=0||after<0||actual<=0)return fail("打印前卷重必须大于打印后卷重",400);
   const usage=(await db.prepare("SELECT id,estimated_grams estimatedGrams FROM print_material_usage_lines WHERE print_session_id=? AND spool_id=? AND organization_id=? AND settled_at IS NULL ORDER BY id").bind(task.sessionId,task.spoolId,org).all()).results as {id:number;estimatedGrams:number}[],total=usage.reduce((sum,row)=>sum+Number(row.estimatedGrams),0);if(!usage.length||total<=0)return fail("用量项已经结算或缺少切片估算，不能分配称重证据",409);
   let allocated=0;const evidence=usage.map((row,index)=>{const measured=index===usage.length-1?actual-allocated:Number((actual*Number(row.estimatedGrams)/total).toFixed(4));allocated+=measured;return db.prepare("UPDATE print_material_usage_lines SET measured_grams=?,estimate_source='scale',updated_at=? WHERE id=? AND organization_id=? AND settled_at IS NULL").bind(measured,now,row.id,org)});await db.batch([...evidence,db.prepare("UPDATE material_calibration_tasks SET status='completed',before_gross_grams=?,after_gross_grams=?,actual_consumed_grams=?,notes=?,completed_at=?,updated_at=? WHERE id=? AND organization_id=?").bind(before,after,actual,String(body.notes||"").trim().slice(0,500),now,now,task.id,org)]);
  }else return fail("不支持的校准操作",400);
  await recordAudit(context,`calibration.task.${body.action}`,"material_calibration_task",String(task.id),{sessionId:task.sessionId,spoolId:task.spoolId});return Response.json({id:task.id,status:body.action});
 }catch(error){const message=error instanceof Error?error.message:"校准任务操作失败";return fail(message.includes("UNIQUE constraint")?"该打印会话与实体卷已经建立校准任务":message,message.includes("UNIQUE constraint")?409:400)}
}
