import {can,getAccessContext,recordAudit} from "../../access-control";
import {requireApiAccess} from "../../api-auth";
import {getD1} from "../../../db";
import {evaluatePreflight} from "../../../preflight/evaluate";
import type {PreflightInput} from "../../../shared/contracts/preflight";

async function persist(input:PreflightInput,context:NonNullable<Awaited<ReturnType<typeof getAccessContext>>>){
  const result=evaluatePreflight({...input,permission:{canDispatch:can(context,"printers.control"),canOverride:context.role==="owner"||context.role==="manager"}}),d1=getD1();
  const run=await d1.prepare("INSERT INTO preflight_runs(organization_id,run_id,printer_id,level,dispatch_allowed,override_allowed,input,evaluated_at,created_by) VALUES(?,?,?,?,?,?,?,?,?) RETURNING id").bind(context.organizationId,result.runId,input.printer.id,result.level,result.dispatchAllowed?1:0,result.overrideAllowed?1:0,JSON.stringify(input),result.evaluatedAt,context.email).first<{id:number}>();
  if(!run)throw new Error("无法保存预检结果");
  for(const item of result.checks)await d1.prepare("INSERT INTO preflight_checks(run_id,code,category,level,message,details,resolution_actions) VALUES(?,?,?,?,?,?,?)").bind(run.id,item.code,item.category,item.level,item.message,JSON.stringify(item.details??{}),JSON.stringify(item.resolutionActions??[])).run();
  return {result,databaseId:run.id};
}

export async function GET(){const denied=await requireApiAccess();if(denied)return denied;const context=await getAccessContext();if(!context)return Response.json({error:"请先登录"},{status:401});const rows=await getD1().prepare("SELECT run_id,printer_id,level,dispatch_allowed,override_allowed,evaluated_at,created_by FROM preflight_runs WHERE organization_id=? ORDER BY id DESC LIMIT 30").bind(context.organizationId).all();return Response.json({runs:rows.results??[]});}
export async function POST(request:Request){const denied=await requireApiAccess(true);if(denied)return denied;const context=await getAccessContext();if(!context)return Response.json({error:"请先登录"},{status:401});try{const body=await request.json() as {input:PreflightInput;dispatch?:boolean;overrideReason?:string};if(!body.input?.printer?.id)return Response.json({error:"缺少打印机预检数据"},{status:400});const {result,databaseId}=await persist(body.input,context),reason=body.overrideReason?.trim().slice(0,500)??"",overridden=Boolean(body.dispatch&&result.level==="warning"&&result.overrideAllowed&&reason.length>=6),allowed=result.dispatchAllowed||overridden,d1=getD1();
  if(overridden)await d1.prepare("INSERT INTO preflight_overrides(run_id,actor_email,reason) VALUES(?,?,?)").bind(databaseId,context.email,reason).run();
  if(body.dispatch)await d1.prepare("INSERT INTO dispatch_attempts(run_id,printer_id,allowed,reason,actor_email) VALUES(?,?,?,?,?)").bind(databaseId,body.input.printer.id,allowed?1:0,overridden?reason:allowed?"preflight_passed":"preflight_rejected",context.email).run();
  await recordAudit(context,body.dispatch?"dispatch.preflight":"preflight.run","printer",String(body.input.printer.id),{runId:result.runId,level:result.level,allowed,overridden});if(body.dispatch&&!allowed)return Response.json({error:result.level==="warning"&&result.overrideAllowed?"存在风险，需要填写不少于6个字符的授权原因":"后端预检未通过，已阻止下发",result},{status:409});return Response.json({result:{...result,dispatchAllowed:allowed},overridden});}catch(error){return Response.json({error:error instanceof Error?error.message:"预检失败"},{status:500});}}
