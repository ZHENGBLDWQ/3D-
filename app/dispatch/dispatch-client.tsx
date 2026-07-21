"use client";
import {useCallback,useEffect,useState} from "react";
import styles from "./dispatch.module.css";

type Run={id:number;run_id:string;printer_id:number;level:string;evaluated_at:string};
type Job={id:number;job_no:string;printer_id:number;status:string};
type Workflow={id:number;workflow_key:string;job_id:number;printer_id:number;status:string;preflight_level:string;created_at:string};
type Data={runs:Run[];jobs:Job[];workflows:Workflow[]};
const empty:Data={runs:[],jobs:[],workflows:[]};

export default function DispatchClient(){
  const [data,setData]=useState<Data>(empty),[runId,setRunId]=useState(""),[jobId,setJobId]=useState(""),[reason,setReason]=useState(""),[notice,setNotice]=useState(""),[loading,setLoading]=useState(true);
  const load=useCallback(async()=>{const response=await fetch("/api/dispatch",{cache:"no-store"});const result=await response.json() as Data&{error?:string};if(!response.ok)throw new Error(result.error||"无法读取下发工作流");setData(result);},[]);
  useEffect(()=>{let active=true;load().catch(error=>active&&setNotice(error instanceof Error?error.message:"加载失败")).finally(()=>active&&setLoading(false));return()=>{active=false};},[load]);
  const selectedRun=data.runs.find(item=>String(item.id)===runId),compatibleJobs=selectedRun?data.jobs.filter(item=>item.printer_id===selectedRun.printer_id):data.jobs;
  async function dispatch(){if(!runId||!jobId)return;setLoading(true);setNotice("");try{const response=await fetch("/api/dispatch",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({preflightRunId:Number(runId),jobId:Number(jobId),overrideReason:reason})});const result=await response.json() as {error?:string;idempotent?:boolean};if(!response.ok)throw new Error(result.error||"安全下发失败");setNotice(result.idempotent?"该任务已存在下发工作流，没有重复预留。":"已预留耗材并进入打印机安全命令队列。");await load();}catch(error){setNotice(error instanceof Error?error.message:"安全下发失败");}finally{setLoading(false)}}
  return <main className={styles.page}><header><a href="/">← 返回工作台</a><small>SAFE DISPATCH</small><h1>下发工作流</h1><p>只有最新预检通过的任务才能预留耗材并进入打印机命令队列，重复提交不会重复占用库存。</p></header>
    <section className={styles.panel}><label>最新预检记录<select value={runId} onChange={event=>{setRunId(event.target.value);setJobId("")}}><option value="">请选择</option>{data.runs.map(run=><option key={run.id} value={run.id}>{run.run_id} · {run.level.toUpperCase()}</option>)}</select></label><label>同设备打印任务<select value={jobId} onChange={event=>setJobId(event.target.value)}><option value="">请选择</option>{compatibleJobs.map(job=><option key={job.id} value={job.id}>{job.job_no} · {job.status}</option>)}</select></label><label>风险授权原因<input value={reason} onChange={event=>setReason(event.target.value)} placeholder="仅WARNING时由管理员填写"/></label><button disabled={loading||!runId||!jobId} onClick={dispatch}>{loading?"处理中…":"预留耗材并安全下发"}</button></section>
    {notice?<p className={styles.notice} role="status">{notice}</p>:null}<section className={styles.list}><h2>最近工作流</h2>{data.workflows.map(item=><article key={item.id}><div><strong>{item.workflow_key}</strong><small>任务 #{item.job_id} · 打印机 #{item.printer_id}</small></div><span>{item.preflight_level}</span><b>{item.status}</b></article>)}{!loading&&!data.workflows.length?<p>暂无下发记录。</p>:null}</section>
  </main>;
}
