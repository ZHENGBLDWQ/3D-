"use client";
import { useEffect, useState } from "react";
import type { PreflightResult } from "../../shared/contracts/preflight";
import styles from "./preflight.module.css";

type Catalog = { slicingJobs: Array<{ id: number; job_key: string }>; printers: Array<{ id: number; name: string; model: string }>; orders: Array<{ id: number; order_no: string; customer: string }> };
const emptyCatalog: Catalog = { slicingJobs: [], printers: [], orders: [] };

export default function PreflightClient() {
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog), [slicingJobId, setSlicingJobId] = useState(""), [printerId, setPrinterId] = useState(""), [orderId, setOrderId] = useState("");
  const [result, setResult] = useState<PreflightResult | null>(null), [error, setError] = useState(""), [overrideReason, setOverrideReason] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; fetch("/api/preflight").then(async response => { const data = await response.json() as Catalog & { error?: string }; if (!response.ok) throw new Error(data.error || "无法加载实时预检数据"); if (active) setCatalog(data); }).catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : "无法加载实时预检数据")).finally(() => active && setLoading(false)); return () => { active = false; }; }, []);
  const ready = Boolean(slicingJobId && printerId && orderId);
  async function run(dispatch = false) { if (!ready) return; setLoading(true); setError(""); try { const response = await fetch("/api/preflight", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slicingJobId: Number(slicingJobId), printerId: Number(printerId), orderId: Number(orderId), dispatch, overrideReason }) }); const data = await response.json() as { result?: PreflightResult; error?: string }; if (data.result) setResult(data.result); if (!response.ok) throw new Error(data.error || "预检失败"); } catch (cause) { setError(cause instanceof Error ? cause.message : "预检失败"); } finally { setLoading(false); } }
  return <main className={styles.page}><header><small>PRODUCTION SAFETY</small><h1>实时下发预检中心</h1><p>读取当前组织的真实切片结果、已绑定打印机、AMS 槽位和库存分配，在下发前完成服务端安全校验。</p></header>
    <section className={styles.controls}>
      <label>已完成切片任务<select value={slicingJobId} onChange={event => setSlicingJobId(event.target.value)} disabled={loading}><option value="">请选择切片任务</option>{catalog.slicingJobs.map(job => <option value={job.id} key={job.id}>{job.job_key}</option>)}</select></label>
      <label>目标打印机<select value={printerId} onChange={event => setPrinterId(event.target.value)} disabled={loading}><option value="">请选择已绑定设备</option>{catalog.printers.map(printer => <option value={printer.id} key={printer.id}>{printer.name} · {printer.model}</option>)}</select></label>
      <label>生产订单<select value={orderId} onChange={event => setOrderId(event.target.value)} disabled={loading}><option value="">请选择订单</option>{catalog.orders.map(order => <option value={order.id} key={order.id}>{order.order_no} · {order.customer}</option>)}</select></label>
      <button onClick={() => run(false)} disabled={loading || !ready}>{loading ? "读取中…" : "运行实时预检"}</button><button className={styles.dispatch} onClick={() => run(true)} disabled={loading || !ready}>验证并下发</button>
    </section>
    {!loading && (!catalog.slicingJobs.length || !catalog.printers.length || !catalog.orders.length) ? <p className={styles.empty}>请先准备成功的切片任务、已绑定打印机和本组织订单，三项齐全后才能执行实时预检。</p> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    {result ? <section className={styles.report}><div className={`${styles.summary} ${styles[result.level]}`}><strong>{result.level.toUpperCase()}</strong><span>{result.dispatchAllowed ? "允许下发" : "禁止下发"}</span></div>
      {result.level === "warning" && result.overrideAllowed ? <label className={styles.override}>授权覆盖原因（至少6个字符）<input value={overrideReason} onChange={event => setOverrideReason(event.target.value)} placeholder="说明接受风险的原因" /></label> : null}
      {result.checks.map(item => <article key={`${item.category}-${item.code}`}><b className={styles[item.level]}>{item.level.toUpperCase()}</b><div><strong>{item.message}</strong><small>{item.category} · {item.code}</small>{item.resolutionActions?.length ? <p>建议：{item.resolutionActions.join(" / ")}</p> : null}</div></article>)}</section> : null}
  </main>;
}
