import { redirect } from "next/navigation";
import { getAccessContext } from "../access-control";
import { getD1 } from "../../db";
import styles from "./execution.module.css";

export const dynamic="force-dynamic";
type Workflow={id:number;workflow_key:string;job_no:string;printer_name:string;status:string;started_at:string|null;completed_at:string|null;updated_at:string};
type Event={id:number;workflow_id:number|null;event_id:string;device_status:string;occurred_at:string;outcome:string};
const label:Record<string,string>={queued:"等待设备",printing:"打印中",paused:"已暂停",completed:"已完成",failed:"失败",cancelled:"已取消"};

export default async function ExecutionPage(){
  const user=await getAccessContext();if(!user)redirect("/");const db=getD1();
  const [workflowRows,eventRows]=await Promise.all([
    db.prepare("SELECT w.id,w.workflow_key,j.job_no,p.name AS printer_name,w.status,w.started_at,w.completed_at,w.updated_at FROM dispatch_workflows w JOIN print_jobs j ON j.id=w.job_id JOIN printers p ON p.id=w.printer_id WHERE w.organization_id=? ORDER BY w.updated_at DESC LIMIT 60").bind(user.organizationId).all<Workflow>(),
    db.prepare("SELECT id,workflow_id,event_id,device_status,occurred_at,outcome FROM execution_events WHERE organization_id=? ORDER BY occurred_at DESC,id DESC LIMIT 160").bind(user.organizationId).all<Event>(),
  ]);const workflows=workflowRows.results??[],events=eventRows.results??[];
  return <main className={styles.page}><header><a href="/">← 返回工作台</a><small>PRODUCTION EXECUTION</small><h1>生产执行中心</h1><p>状态仅由已认证的本地通信网关驱动；重复和乱序事件会保留追溯记录，但不会重复结算或让终态回退。</p></header>
    <section className={styles.grid}>{workflows.map(workflow=><article key={workflow.id}><div><strong>{workflow.job_no}</strong><span data-status={workflow.status}>{label[workflow.status]||workflow.status}</span></div><p>{workflow.printer_name} · {workflow.workflow_key}</p><dl><dt>开始</dt><dd>{workflow.started_at?new Date(workflow.started_at).toLocaleString("zh-CN"):"尚未开始"}</dd><dt>结束</dt><dd>{workflow.completed_at?new Date(workflow.completed_at).toLocaleString("zh-CN"):"—"}</dd></dl><ol>{events.filter(event=>event.workflow_id===workflow.id).slice(0,6).map(event=><li key={event.id}><b>{event.device_status}</b><time>{new Date(event.occurred_at).toLocaleString("zh-CN")}</time><small>{event.outcome}</small></li>)}</ol></article>)}</section>
    {!workflows.length?<section className={styles.empty}>暂无生产执行工作流。</section>:null}
  </main>;
}
