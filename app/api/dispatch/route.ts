import { can, getAccessContext, recordAudit } from "../../access-control";
import { requireApiAccess } from "../../api-auth";
import { getD1 } from "../../../db";
import { evaluatePreflight } from "../../../preflight/evaluate";
import type { PreflightInput } from "../../../shared/contracts/preflight";
import { buildReservationRequests, decideDispatch, dispatchIdempotencyKey, nextReservationStatus } from "../../../dispatch/orchestration";

type RunRow = {id:number;organization_id:number;run_id:string;printer_id:number;input:string;evaluated_at:string};
type WorkflowRow = {id:number;workflow_key:string;preflight_run_id:number;job_id:number;printer_id:number;command_id:number|null;status:string;preflight_level:string;created_at:string};
type AllocationRow = {id:number;batch_id:number;ams_unit:number|null;tray_index:number|null;remaining_grams:number;material:string};

const jsonError=(error:string,status:number)=>Response.json({error},{status});
const slotKeys=(row:AllocationRow)=>new Set([
  `${row.ams_unit??0}:${row.tray_index??0}`,
  `A${(row.tray_index??0)+1}`,
  `AMS ${row.ams_unit??0}-${row.tray_index??0}`,
].map(value=>value.toLowerCase().replaceAll(" ","")));
const normalizeSlot=(value:string)=>value.toLowerCase().replaceAll(" ","");

async function workflowResponse(workflowKey:string){
  const db=getD1();
  const workflow=await db.prepare("SELECT id,workflow_key,preflight_run_id,job_id,printer_id,command_id,status,preflight_level,created_at FROM dispatch_workflows WHERE workflow_key=?").bind(workflowKey).first<WorkflowRow>();
  if(!workflow)return null;
  const reservations=await db.prepare("SELECT id,batch_id AS batchId,slot,material,grams,status,released_reason AS releasedReason FROM material_reservations WHERE workflow_id=? ORDER BY id").bind(workflow.id).all();
  return {workflow,reservations:reservations.results??[]};
}

export async function GET(){
  const denied=await requireApiAccess();if(denied)return denied;
  const context=await getAccessContext();if(!context)return jsonError("请先登录",401);
  const db=getD1();
  const [workflows,runs,jobs]=await Promise.all([
    db.prepare("SELECT id,workflow_key,preflight_run_id,job_id,printer_id,command_id,status,preflight_level,created_at FROM dispatch_workflows WHERE organization_id=? ORDER BY id DESC LIMIT 50").bind(context.organizationId).all(),
    db.prepare("SELECT id,run_id,printer_id,level,dispatch_allowed,override_allowed,evaluated_at FROM preflight_runs WHERE organization_id=? ORDER BY id DESC LIMIT 50").bind(context.organizationId).all(),
    db.prepare("SELECT id,job_no,printer_id,status FROM print_jobs WHERE organization_id=? AND status IN ('排队','待下发') ORDER BY id DESC LIMIT 100").bind(context.organizationId).all(),
  ]);
  return Response.json({workflows:workflows.results??[],runs:runs.results??[],jobs:jobs.results??[]});
}

export async function POST(request:Request){
  const denied=await requireApiAccess(true);if(denied)return denied;
  const context=await getAccessContext();if(!context)return jsonError("请先登录",401);
  if(!can(context,"printers.control"))return jsonError("没有打印机下发权限",403);
  try{
    const body=await request.json() as {preflightRunId?:number|string;jobId?:number;overrideReason?:string};
    const jobId=Number(body.jobId),runLookup=String(body.preflightRunId??"").trim();
    if(!jobId||!runLookup)return jsonError("缺少预检记录或打印任务",400);
    const db=getD1();
    const run=await db.prepare("SELECT id,organization_id,run_id,printer_id,input,evaluated_at FROM preflight_runs WHERE organization_id=? AND (run_id=? OR id=?) ORDER BY id DESC LIMIT 1").bind(context.organizationId,runLookup,Number(runLookup)||-1).first<RunRow>();
    if(!run)return jsonError("预检记录不存在或不属于当前组织",404);
    const latest=await db.prepare("SELECT id FROM preflight_runs WHERE organization_id=? AND printer_id=? ORDER BY id DESC LIMIT 1").bind(context.organizationId,run.printer_id).first<{id:number}>();
    if(latest?.id!==run.id)return jsonError("该设备已有更新的预检结果，请使用最新记录",409);
    const job=await db.prepare("SELECT j.id,j.file_id,pb.id AS binding_id FROM print_jobs j JOIN printer_bindings pb ON pb.printer_id=j.printer_id AND pb.organization_id=? WHERE j.id=? AND j.printer_id=?").bind(context.organizationId,jobId,run.printer_id).first<{id:number;file_id:number|null;binding_id:number}>();
    if(!job)return jsonError("打印任务不存在、设备不一致或跨组织访问被拒绝",404);
    if(context.printerScope.length&&!context.printerScope.includes(run.printer_id))return jsonError("该设备不在当前账号的授权范围内",403);
    const stored=JSON.parse(run.input) as PreflightInput;
    stored.permission={canDispatch:true,canOverride:context.role==="owner"||context.role==="manager"};
    stored.now=new Date().toISOString();
    const result=evaluatePreflight(stored);
    const decision=decideDispatch({level:result.level,overrideAllowed:result.overrideAllowed,role:context.role,overrideReason:body.overrideReason});
    if(!decision.allowed)return jsonError(decision.reason==="administrator_override_required"?"存在风险，需要所有者或管理员填写不少于6个字符的授权原因":"最新预检未通过，已阻止下发",409);
    const workflowKey=dispatchIdempotencyKey(context.organizationId,run.id,jobId),existing=await workflowResponse(workflowKey);
    if(existing)return Response.json({...existing,idempotent:true});
    const allocations=(await db.prepare("SELECT ipa.id,ipa.batch_id,ipa.ams_unit,ipa.tray_index,ipa.remaining_grams,mb.material FROM inventory_printer_allocations ipa JOIN material_batches mb ON mb.id=ipa.batch_id WHERE ipa.printer_id=? AND ipa.status NOT IN ('released','empty')").bind(run.printer_id).all<AllocationRow>()).results??[];
    const plans=buildReservationRequests(stored).map(requirement=>{
      const allocation=allocations.find((row:AllocationRow)=>slotKeys(row).has(normalizeSlot(requirement.slot))&&row.material.trim().toLowerCase()===requirement.material.trim().toLowerCase());
      if(!allocation)throw new Error(`AMS ${requirement.slot} 未绑定可预留的耗材批次`);
      return {...requirement,batchId:allocation.batch_id};
    });
    const commandKey=`${workflowKey}:start`,overrideReason=body.overrideReason?.trim()??"";
    const statements=[];
    if(decision.overridden)statements.push(db.prepare("INSERT INTO preflight_overrides(run_id,actor_email,reason) VALUES(?,?,?)").bind(run.id,context.email,overrideReason));
    statements.push(db.prepare("INSERT OR IGNORE INTO dispatch_workflows(organization_id,workflow_key,preflight_run_id,job_id,printer_id,status,preflight_level,override_id,actor_email) VALUES(?,?,?,?,?,'reserved',?,(SELECT id FROM preflight_overrides WHERE run_id=? ORDER BY id DESC LIMIT 1),?)").bind(context.organizationId,workflowKey,run.id,jobId,run.printer_id,result.level,run.id,context.email));
    for(const plan of plans)statements.push(db.prepare("INSERT OR IGNORE INTO material_reservations(organization_id,workflow_id,job_id,printer_id,batch_id,slot,material,grams,status) VALUES(?,(SELECT id FROM dispatch_workflows WHERE workflow_key=?),?,?,?,?,?,?,'reserved')").bind(context.organizationId,workflowKey,jobId,run.printer_id,plan.batchId,plan.slot,plan.material,plan.grams));
    statements.push(db.prepare("INSERT OR IGNORE INTO printer_commands(printer_id,binding_id,idempotency_key,command,payload,status) VALUES(?,?,?,?,?,'pending')").bind(run.printer_id,job.binding_id,commandKey,"start",JSON.stringify({jobId,fileId:job.file_id,workflowKey})));
    statements.push(db.prepare("UPDATE dispatch_workflows SET command_id=(SELECT id FROM printer_commands WHERE idempotency_key=?),status='queued',updated_at=CURRENT_TIMESTAMP WHERE workflow_key=?").bind(commandKey,workflowKey));
    statements.push(db.prepare("INSERT INTO dispatch_attempts(run_id,printer_id,allowed,reason,actor_email,workflow_id) VALUES(?,?,1,?,?,(SELECT id FROM dispatch_workflows WHERE workflow_key=?))").bind(run.id,run.printer_id,decision.reason,context.email,workflowKey));
    await db.batch(statements);
    const created=await workflowResponse(workflowKey);if(!created)throw new Error("下发工作流创建失败");
    await recordAudit(context,"dispatch.created","dispatch_workflow",String(created.workflow.id),{jobId,printerId:run.printer_id,preflightRunId:run.id,overridden:decision.overridden});
    return Response.json({...created,idempotent:false},{status:201});
  }catch(error){
    const message=error instanceof Error?error.message:"下发创建失败";
    return jsonError(message.includes("MATERIAL_RESERVATION_INSUFFICIENT")?"耗材可用余量已变化，预留失败，请重新预检":message,message.includes("MATERIAL_RESERVATION_INSUFFICIENT")?409:400);
  }
}

export async function PATCH(request:Request){
  const denied=await requireApiAccess(true);if(denied)return denied;
  const context=await getAccessContext();if(!context)return jsonError("请先登录",401);
  if(!can(context,"printers.control"))return jsonError("没有打印机控制权限",403);
  const body=await request.json() as {workflowId?:number;action?:"start"|"issue"|"cancel"|"fail";reason?:string};
  if(!body.workflowId||!body.action||!["start","issue","cancel","fail"].includes(body.action))return jsonError("不支持的状态操作",400);
  const db=getD1(),workflow=await db.prepare("SELECT id,status,command_id FROM dispatch_workflows WHERE id=? AND organization_id=?").bind(body.workflowId,context.organizationId).first<{id:number;status:string;command_id:number|null}>();
  if(!workflow)return jsonError("下发工作流不存在",404);
  if(["cancelled","failed","completed"].includes(workflow.status))return jsonError("工作流已结束，不能重复变更",409);
  const reservationStatus=nextReservationStatus(body.action),reason=(body.reason||body.action).trim().slice(0,500),now=new Date().toISOString();
  const workflowStatus=body.action==="start"?"printing":body.action==="issue"?"issued":body.action==="cancel"?"cancelled":"failed";
  const timestampColumn=body.action==="start"?"started_at":body.action==="cancel"?"cancelled_at":"completed_at";
  const eligibleReservationStates=reservationStatus==="released"?"('reserved','allocated','issued')":"('reserved','allocated')";
  const statements=[
    db.prepare(`UPDATE dispatch_workflows SET status=?,${timestampColumn}=?,error_message=CASE WHEN ? IN ('failed','cancelled') THEN ? ELSE error_message END,updated_at=? WHERE id=? AND organization_id=?`).bind(workflowStatus,now,workflowStatus,reason,now,workflow.id,context.organizationId),
    db.prepare(`UPDATE material_reservations SET status=?,released_reason=CASE WHEN ?='released' THEN ? ELSE released_reason END,allocated_at=CASE WHEN ?='allocated' THEN ? ELSE allocated_at END,issued_at=CASE WHEN ?='issued' THEN ? ELSE issued_at END,released_at=CASE WHEN ?='released' THEN ? ELSE released_at END,updated_at=? WHERE workflow_id=? AND status IN ${eligibleReservationStates}`).bind(reservationStatus,reservationStatus,reason,reservationStatus,now,reservationStatus,now,reservationStatus,now,now,workflow.id),
  ];
  if((body.action==="cancel"||body.action==="fail")&&workflow.command_id)statements.push(db.prepare("UPDATE printer_commands SET status=?,result=?,completed_at=? WHERE id=? AND status IN ('pending','dispatched')").bind(body.action==="cancel"?"cancelled":"failed",reason,now,workflow.command_id));
  await db.batch(statements);
  await recordAudit(context,`dispatch.${body.action}`,"dispatch_workflow",String(workflow.id),{reason});
  return Response.json(await workflowResponse((await db.prepare("SELECT workflow_key FROM dispatch_workflows WHERE id=?").bind(workflow.id).first<{workflow_key:string}>())!.workflow_key));
}
