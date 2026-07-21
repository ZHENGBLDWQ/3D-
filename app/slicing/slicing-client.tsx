"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./slicing.module.css";

type FileAsset = { id: number; filename: string; format: string; sha256: string; size_bytes: number };
type Gateway = { id: number; name: string; status: string; last_seen_at: string | null };
type SliceJob = { id: number; job_key: string; status: string; input_file_id: number; gateway_id: number; request_json: string; error_message: string | null; created_at: string; started_at: string | null; completed_at: string | null };
type Preset = { id: string; name: string; version: string };
type Payload = { files: FileAsset[]; gateways: Gateway[]; jobs: SliceJob[]; presets: { printers: Record<string, Preset>; processes: Record<string, Preset>; filaments: Record<string, Preset> } };
const empty: Payload = { files: [], gateways: [], jobs: [], presets: { printers: {}, processes: {}, filaments: {} } };
const statusName: Record<string, string> = { queued: "等待网关", claimed: "已领取", running: "切片中", succeeded: "已完成", failed: "失败", cancel_requested: "正在取消", cancelled: "已取消", timed_out: "已超时" };

export default function SlicingClient({ canWrite }: { canWrite: boolean }) {
  const [data, setData] = useState<Payload>(empty), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [message, setMessage] = useState("");
  const load = useCallback(async () => { try { const response = await fetch("/api/slicing", { cache: "no-store" }); const body = await response.json() as Payload & { error?: string }; if (!response.ok) throw new Error(body.error || "读取切片任务失败"); setData(body); } catch (error) { setMessage(error instanceof Error ? error.message : "读取切片任务失败"); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 10_000); return () => clearInterval(timer); }, [load]);
  const fileNames = useMemo(() => new Map(data.files.map(file => [file.id, file.filename])), [data.files]);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setMessage(""); const values = Object.fromEntries(new FormData(event.currentTarget)); try { const response = await fetch("/api/slicing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) }); const body = await response.json() as { error?: string; jobKey?: string }; if (!response.ok) throw new Error(body.error || "创建切片任务失败"); setMessage(`任务 ${body.jobKey} 已进入本地网关队列`); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "创建切片任务失败"); } finally { setSaving(false); } }
  async function cancel(jobKey: string) { const response = await fetch(`/api/slicing?jobKey=${encodeURIComponent(jobKey)}`, { method: "DELETE" }); const body = await response.json() as { error?: string }; setMessage(response.ok ? "取消请求已发送" : body.error || "取消失败"); await load(); }
  return <main className={styles.shell}>
    <header className={styles.header}><a href="/">← 返回工作台</a><div><span>BAMBU PRODUCTION</span><h1>自动切片中心</h1><p>云端编排任务，本地网关安全调用 Bambu Studio CLI。</p></div><button onClick={() => void load()}>刷新状态</button></header>
    {message ? <div className={styles.notice} role="status">{message}<button onClick={() => setMessage("")}>×</button></div> : null}
    <div className={styles.grid}>
      <section className={styles.panel}><div className={styles.panelTitle}><span>NEW SLICE</span><h2>创建切片任务</h2></div>{canWrite ? <form onSubmit={submit} className={styles.form}>
        <label><span>模型资产</span><select name="fileId" required defaultValue=""><option value="" disabled>选择 STL / 3MF</option>{data.files.map(file => <option key={file.id} value={file.id}>{file.filename}</option>)}</select></label>
        <label><span>执行网关</span><select name="gatewayId" required defaultValue=""><option value="" disabled>选择本地网关</option>{data.gateways.map(gateway => <option key={gateway.id} value={gateway.id}>{gateway.name} · {gateway.status}</option>)}</select></label>
        <div className={styles.two}><label><span>打印机模板</span><select name="printerProfile">{Object.entries(data.presets.printers).map(([key, profile]) => <option key={key} value={key}>{profile.name}</option>)}</select></label><label><span>工艺模板</span><select name="processProfile">{Object.entries(data.presets.processes).map(([key, profile]) => <option key={key} value={key}>{profile.name}</option>)}</select></label></div>
        <div className={styles.two}><label><span>耗材模板</span><select name="filamentProfile">{Object.entries(data.presets.filaments).map(([key, profile]) => <option key={key} value={key}>{profile.name}</option>)}</select></label><label><span>指定盘面（可选）</span><input name="plateIndex" type="number" min="1" max="256" placeholder="自动" /></label></div>
        <label><span>超时限制</span><select name="timeoutSeconds" defaultValue="1800"><option value="900">15 分钟</option><option value="1800">30 分钟</option><option value="3600">60 分钟</option><option value="7200">120 分钟</option></select></label>
        <aside><strong>安全执行边界</strong><p>模型由网关下载到独立临时目录；模板以版本快照执行；Cloudflare 不会启动桌面进程。</p></aside><button className={styles.primary} disabled={saving || !data.files.length || !data.gateways.length}>{saving ? "正在入队…" : "提交到本地网关"}</button>
      </form> : <div className={styles.empty}>当前岗位只有查看权限。</div>}</section>
      <section className={`${styles.panel} ${styles.queue}`}><div className={styles.panelTitle}><span>LOCAL RUNNER QUEUE</span><h2>切片任务</h2><p>{data.jobs.length} 个最近任务</p></div>{loading ? <div className={styles.empty}>正在读取任务…</div> : !data.jobs.length ? <div className={styles.empty}>还没有切片任务。选择模型与模板后提交第一项任务。</div> : <div className={styles.jobs}>{data.jobs.map(job => <article key={job.id}><div className={`${styles.status} ${styles[job.status] ?? ""}`}><i /><span>{statusName[job.status] || job.status}</span></div><div><h3>{fileNames.get(job.input_file_id) || `模型 #${job.input_file_id}`}</h3><p>{job.job_key}</p><small>{new Date(job.created_at).toLocaleString("zh-CN")}</small>{job.error_message ? <em>{job.error_message}</em> : null}</div>{["queued", "claimed", "running"].includes(job.status) && canWrite ? <button onClick={() => void cancel(job.job_key)}>取消</button> : null}</article>)}</div>}</section>
    </div>
  </main>;
}
