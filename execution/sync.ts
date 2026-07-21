import { getD1 } from "../db";
import { classifyExecutionEvent, type ExecutionDeviceStatus } from "./state";

type Workflow = { id:number; organization_id:number; job_id:number; command_id:number|null; status:string; last_event_at:string|null };
type Input = { organizationId:number; bindingId:number; printerId:number; printerEventId:number; eventId:string; status:ExecutionDeviceStatus; occurredAt:string; details?:Record<string,unknown> };

const transitions: Record<ExecutionDeviceStatus,{workflow:string;job:string;reservation?:string}> = {
  printing:{workflow:"printing",job:"打印中",reservation:"allocated"},
  paused:{workflow:"paused",job:"已暂停"},
  completed:{workflow:"completed",job:"已完成",reservation:"issued"},
  error:{workflow:"failed",job:"失败",reservation:"released"},
  offline:{workflow:"paused",job:"已暂停"},
};

/** Consumes only an event already persisted by the authenticated gateway endpoint. */
export async function synchronizeExecutionEvent(input:Input){
  const db=getD1();
  const workflow=await db.prepare("SELECT id,organization_id,job_id,command_id,status,last_event_at FROM dispatch_workflows WHERE organization_id=? AND printer_id=? ORDER BY id DESC LIMIT 1")
    .bind(input.organizationId,input.printerId).first<Workflow>();
  let outcome=classifyExecutionEvent(workflow?{status:workflow.status,lastEventAt:workflow.last_event_at}:null,input.status,input.occurredAt);
  if(workflow){
    if(outcome.startsWith("apply:")){
      const next=transitions[input.status],now=new Date().toISOString(),statements=[];
      const isComplete=input.status==="completed",isFailure=input.status==="error",isStart=input.status==="printing";
      statements.push(db.prepare("UPDATE dispatch_workflows SET status=?,last_event_at=?,started_at=CASE WHEN ? THEN COALESCE(started_at,?) ELSE started_at END,completed_at=CASE WHEN ? THEN ? ELSE completed_at END,settled_at=CASE WHEN ? THEN ? ELSE settled_at END,settlement_event_id=CASE WHEN ? THEN ? ELSE settlement_event_id END,error_code=CASE WHEN ? THEN 'PRINTER_ERROR' ELSE error_code END,error_message=CASE WHEN ? THEN ? ELSE error_message END,updated_at=? WHERE id=? AND organization_id=? AND status NOT IN ('completed','failed','cancelled') AND (last_event_at IS NULL OR last_event_at<?)")
        .bind(next.workflow,input.occurredAt,isStart,now,isComplete||isFailure,now,isComplete||isFailure,now,isComplete||isFailure,input.eventId,isFailure,isFailure,String(input.details?.message||"Printer reported an error").slice(0,500),now,workflow.id,input.organizationId,input.occurredAt));
      const accepted="EXISTS (SELECT 1 FROM dispatch_workflows WHERE id=? AND organization_id=? AND last_event_at=?)";
      if(next.reservation==="allocated")statements.push(db.prepare(`UPDATE material_reservations SET status='allocated',allocated_at=COALESCE(allocated_at,?),updated_at=? WHERE workflow_id=? AND organization_id=? AND status='reserved' AND ${accepted}`).bind(now,now,workflow.id,input.organizationId,workflow.id,input.organizationId,input.occurredAt));
      if(next.reservation==="issued")statements.push(db.prepare(`UPDATE material_reservations SET status='issued',allocated_at=COALESCE(allocated_at,?),issued_at=COALESCE(issued_at,?),updated_at=? WHERE workflow_id=? AND organization_id=? AND status IN ('reserved','allocated') AND ${accepted}`).bind(now,now,now,workflow.id,input.organizationId,workflow.id,input.organizationId,input.occurredAt));
      if(next.reservation==="released")statements.push(db.prepare(`UPDATE material_reservations SET status='released',released_reason='printer_error',released_at=COALESCE(released_at,?),updated_at=? WHERE workflow_id=? AND organization_id=? AND status IN ('reserved','allocated') AND ${accepted}`).bind(now,now,workflow.id,input.organizationId,workflow.id,input.organizationId,input.occurredAt));
      statements.push(db.prepare(`UPDATE print_jobs SET status=?,progress=CASE WHEN ? THEN 100 ELSE progress END,started_at=CASE WHEN ? THEN COALESCE(started_at,?) ELSE started_at END,completed_at=CASE WHEN ? THEN ? ELSE completed_at END WHERE id=? AND organization_id=? AND ${accepted}`).bind(next.job,isComplete,isStart,now,isComplete||isFailure,now,workflow.job_id,input.organizationId,workflow.id,input.organizationId,input.occurredAt));
      if(workflow.command_id)statements.push(db.prepare(`UPDATE printer_commands SET status=?,result=?,acknowledged_at=COALESCE(acknowledged_at,?),completed_at=CASE WHEN ? THEN COALESCE(completed_at,?) ELSE completed_at END WHERE id=? AND ${accepted}`).bind(isFailure?"failed":"succeeded",`device:${input.status}`,now,isStart||isComplete||isFailure,now,workflow.command_id,workflow.id,input.organizationId,input.occurredAt));
      await db.batch(statements);outcome=`applied:${next.workflow}`;
    }
  }
  await db.prepare("INSERT OR IGNORE INTO execution_events(organization_id,workflow_id,printer_event_id,event_id,printer_id,binding_id,device_status,occurred_at,outcome,details) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .bind(input.organizationId,workflow?.id??null,input.printerEventId,input.eventId,input.printerId,input.bindingId,input.status,input.occurredAt,outcome,JSON.stringify(input.details||{})).run();
  return {outcome,workflowId:workflow?.id??null};
}
