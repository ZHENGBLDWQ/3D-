export type ExecutionDeviceStatus = "printing" | "paused" | "completed" | "error" | "offline";
const terminal = new Set(["completed", "failed", "cancelled"]);
const targets:Record<ExecutionDeviceStatus,string>={printing:"printing",paused:"paused",completed:"completed",error:"failed",offline:"paused"};
export function classifyExecutionEvent(workflow:{status:string;lastEventAt:string|null}|null,status:ExecutionDeviceStatus,occurredAt:string){
  if(!workflow)return "no_active_workflow";
  if(terminal.has(workflow.status))return "terminal_ignored";
  if(workflow.lastEventAt&&occurredAt<=workflow.lastEventAt)return "out_of_order_ignored";
  if(status==="offline"&&!(["printing","paused"].includes(workflow.status)))return "offline_observed";
  return `apply:${targets[status]}`;
}
