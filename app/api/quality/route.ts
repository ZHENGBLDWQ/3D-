import {can,getAccessContext,recordAudit} from "../../access-control";
import {requireApiAccess} from "../../api-auth";
import {getD1} from "../../../db";
import {validateOutcome} from "../../../quality/settlement";

type Reservation={id:number;batchId:number;reservedGrams:number};
type SettlementBody={reservationId:number;actualGrams:number};
type ScrapBody={batchId?:number;quantity?:number;grams?:number;reason?:string;photos?:unknown[]};
const error=(message:string,status:number)=>Response.json({error:message},{status});
const metadata=(value:unknown)=>JSON.stringify(Array.isArray(value)?value.slice(0,12):[]);

export async function GET(){
  const denied=await requireApiAccess();if(denied)return denied;
  const context=await getAccessContext();if(!context)return error("请先登录",401);
  const db=getD1();
  const [workflows,outcomes]=await Promise.all([
    db.prepare(`SELECT w.id,w.workflow_key workflowKey,w.status,w.job_id jobId,j.job_no jobNo,j.quantity,p.name printerName,
      (SELECT COUNT(*) FROM production_outcomes o WHERE o.workflow_id=w.id) settled,
      (SELECT json_group_array(json_object('id',r.id,'batchId',r.batch_id,'material',r.material,'slot',r.slot,'reservedGrams',r.grams)) FROM material_reservations r WHERE r.workflow_id=w.id) reservations
      FROM dispatch_workflows w JOIN print_jobs j ON j.id=w.job_id LEFT JOIN printers p ON p.id=w.printer_id
      WHERE w.organization_id=? AND w.status IN ('printing','issued','completed') ORDER BY w.id DESC LIMIT 100`).bind(context.organizationId).all(),
    db.prepare(`SELECT o.id,o.workflow_id workflowId,o.job_id jobId,j.job_no jobNo,o.successful_quantity successfulQuantity,o.failed_quantity failedQuantity,o.failure_reason failureReason,o.notes,o.photo_metadata photoMetadata,o.reported_by reportedBy,o.reported_at reportedAt,
      q.result inspectionResult,q.notes inspectionNotes,
      COALESCE((SELECT SUM(actual_grams) FROM material_settlements s WHERE s.outcome_id=o.id),0) actualGrams,
      COALESCE((SELECT SUM(grams) FROM scrap_records s WHERE s.outcome_id=o.id),0) scrapGrams
      FROM production_outcomes o JOIN print_jobs j ON j.id=o.job_id LEFT JOIN quality_inspections q ON q.id=(SELECT id FROM quality_inspections WHERE outcome_id=o.id ORDER BY id DESC LIMIT 1)
      WHERE o.organization_id=? ORDER BY o.id DESC LIMIT 100`).bind(context.organizationId).all(),
  ]);
  return Response.json({canSettle:can(context,"printers.control"),workflows:workflows.results??[],outcomes:outcomes.results??[]});
}

export async function POST(request:Request){
  const denied=await requireApiAccess(true);if(denied)return denied;
  const context=await getAccessContext();if(!context)return error("请先登录",401);
  if(!can(context,"printers.control"))return error("没有质量结算权限",403);
  try{
    const body=await request.json() as {workflowId?:number;successfulQuantity?:number;failedQuantity?:number;failureReason?:string;notes?:string;photos?:unknown[];checklist?:unknown[];settlements?:SettlementBody[];scraps?:ScrapBody[]};
    const workflowId=Number(body.workflowId),db=getD1();
    if(!Number.isInteger(workflowId)||workflowId<1)return error("请选择生产工作流",400);
    const workflow=await db.prepare(`SELECT w.id,w.job_id jobId,w.status,j.quantity FROM dispatch_workflows w JOIN print_jobs j ON j.id=w.job_id AND j.organization_id=w.organization_id WHERE w.id=? AND w.organization_id=?`).bind(workflowId,context.organizationId).first<{id:number;jobId:number;status:string;quantity:number}>();
    if(!workflow)return error("工作流不存在或不属于当前组织",404);
    if(!["printing","issued","completed"].includes(workflow.status))return error("只有已开始的生产工作流可以结算",409);
    const reservations=(await db.prepare("SELECT id,batch_id batchId,grams reservedGrams FROM material_reservations WHERE workflow_id=? AND organization_id=? ORDER BY id").bind(workflow.id,context.organizationId).all<Reservation>()).results??[];
    const requested=Array.isArray(body.settlements)?body.settlements:[];
    if(requested.length!==reservations.length)return error("必须填写工作流的全部耗材预留实际用量",400);
    const joined=requested.map(row=>{const reservation=reservations.find(item=>item.id===Number(row.reservationId));if(!reservation)throw new Error("QUALITY_RESERVATION_SCOPE_MISMATCH");return {...reservation,actualGrams:Number(row.actualGrams)}});
    const summary=validateOutcome({plannedQuantity:workflow.quantity,successfulQuantity:Number(body.successfulQuantity),failedQuantity:Number(body.failedQuantity),failureReason:body.failureReason,settlements:joined});
    const scraps=(Array.isArray(body.scraps)?body.scraps:[]).map(row=>({batchId:row.batchId?Number(row.batchId):null,quantity:Math.max(0,Math.trunc(Number(row.quantity)||0)),grams:Math.max(0,Number(row.grams)||0),reason:String(row.reason||"").trim().slice(0,500),photos:metadata(row.photos)}));
    if(summary.failed>0&&!scraps.length)throw new Error("QUALITY_SCRAP_REQUIRED");
    if(scraps.some(row=>!row.reason))throw new Error("QUALITY_SCRAP_REASON_REQUIRED");
    const failureReason=String(body.failureReason||"").trim().slice(0,500),notes=String(body.notes||"").trim().slice(0,2000),photos=metadata(body.photos),checklist=metadata(body.checklist),now=new Date().toISOString();
    const statements=[db.prepare("INSERT INTO production_outcomes(organization_id,workflow_id,job_id,successful_quantity,failed_quantity,failure_reason,notes,photo_metadata,reported_by,reported_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(context.organizationId,workflow.id,workflow.jobId,summary.successful,summary.failed,failureReason,notes,photos,context.email,now)];
    for(const row of joined)statements.push(db.prepare("INSERT INTO material_settlements(organization_id,outcome_id,workflow_id,job_id,reservation_id,batch_id,reserved_grams,actual_grams,variance_grams,settled_by,settled_at) VALUES(?,(SELECT id FROM production_outcomes WHERE workflow_id=?),?,?,?,?,?,?,?,?,?)").bind(context.organizationId,workflow.id,workflow.id,workflow.jobId,row.id,row.batchId,row.reservedGrams,row.actualGrams,row.actualGrams-row.reservedGrams,context.email,now));
    statements.push(db.prepare("INSERT INTO quality_inspections(organization_id,outcome_id,result,checklist,notes,photo_metadata,inspected_by,inspected_at) VALUES(?,(SELECT id FROM production_outcomes WHERE workflow_id=?),?,?,?,?,?,?)").bind(context.organizationId,workflow.id,summary.result,checklist,notes,photos,context.email,now));
    for(const row of scraps)statements.push(db.prepare("INSERT INTO scrap_records(organization_id,outcome_id,batch_id,quantity,grams,reason,photo_metadata,recorded_by) VALUES(?,(SELECT id FROM production_outcomes WHERE workflow_id=?),?,?,?,?,?,?)").bind(context.organizationId,workflow.id,row.batchId,row.quantity,row.grams,row.reason,row.photos,context.email));
    statements.push(db.prepare("UPDATE material_reservations SET status='released',released_reason='actual usage settled',released_at=?,updated_at=? WHERE workflow_id=? AND status IN ('reserved','allocated','issued')").bind(now,now,workflow.id));
    statements.push(db.prepare("UPDATE dispatch_workflows SET status='completed',completed_at=COALESCE(completed_at,?),updated_at=? WHERE id=? AND organization_id=?").bind(now,now,workflow.id,context.organizationId));
    statements.push(db.prepare("UPDATE print_jobs SET status=?,completed_at=COALESCE(completed_at,?) WHERE id=? AND organization_id=?").bind(summary.successful>0?"已完成":"失败",now,workflow.jobId,context.organizationId));
    await db.batch(statements);
    const outcome=await db.prepare("SELECT id FROM production_outcomes WHERE workflow_id=? AND organization_id=?").bind(workflow.id,context.organizationId).first<{id:number}>();
    await recordAudit(context,"quality.settled","production_outcome",String(outcome?.id??""),{workflowId,successfulQuantity:summary.successful,failedQuantity:summary.failed,actualGrams:joined.reduce((sum,row)=>sum+row.actualGrams,0),scrapGrams:scraps.reduce((sum,row)=>sum+row.grams,0)});
    return Response.json({id:outcome?.id,workflowId,result:summary.result},{status:201});
  }catch(cause){
    const message=cause instanceof Error?cause.message:"质量结算失败";
    if(message.includes("UNIQUE constraint failed")||message.includes("QUALITY_ALREADY_SETTLED"))return error("该工作流已经结算，不能重复扣料",409);
    if(message.includes("MATERIAL_SETTLEMENT_INSUFFICIENT_STOCK"))return error("实际用量超过可用库存，已拒绝超扣",409);
    const known:Record<string,string>={QUALITY_QUANTITY_MISMATCH:"成功与失败数量之和必须等于任务数量",QUALITY_FAILURE_REASON_REQUIRED:"存在失败件时必须填写失败原因",QUALITY_SETTLEMENT_REQUIRED:"必须填写实际耗材用量",QUALITY_SETTLEMENT_INVALID:"实际耗材数据不正确",QUALITY_SETTLEMENT_DUPLICATE_RESERVATION:"同一耗材预留不能重复结算",QUALITY_RESERVATION_SCOPE_MISMATCH:"耗材预留不属于当前工作流",QUALITY_SCRAP_REQUIRED:"存在失败件时必须登记报废",QUALITY_SCRAP_REASON_REQUIRED:"报废记录必须填写原因"};
    return error(known[message]||message,400);
  }
}
