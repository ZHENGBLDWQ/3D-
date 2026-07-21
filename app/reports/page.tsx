import {redirect} from "next/navigation";
import {can,getAccessContext} from "../access-control";
import {getOperationsReport} from "../../reporting/data";
import {normalizeRange} from "../../reporting/report";
import "./reports.css";

export const dynamic="force-dynamic";
const rm=(c:number)=>`RM ${(c/100).toFixed(2)}`,pct=(bp:number)=>`${(bp/100).toFixed(1)}%`;
export default async function ReportsPage({searchParams}:{searchParams:Promise<{from?:string;to?:string}>}){
  const context=await getAccessContext();if(!context)redirect("/");if(!can(context,"finance.read"))redirect("/");
  const query=await searchParams,range=normalizeRange(query.from??null,query.to??null),report=await getOperationsReport(context.organizationId,range);
  const exportUrl=`/api/reports?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}&format=csv`;
  return <main className="reports-page">
    <header><div><small>OPERATIONS REPORTING</small><h1>生产经营报表</h1><p>统一查看订单、执行、质量、耗材、成本利润与设备利用率。</p></div><a href="/">返回工作台</a></header>
    <form className="report-filter"><label>开始日期<input name="from" type="date" defaultValue={range.from}/></label><label>结束日期<input name="to" type="date" defaultValue={range.to}/></label><button type="submit">应用范围</button><a className="export" href={exportUrl}>导出安全 CSV</a></form>
    <section className="report-kpis"><article><small>订单收入</small><strong>{rm(report.summary.revenueCents)}</strong><span>{report.summary.orders} 个订单</span></article><article><small>实际总成本</small><strong>{rm(report.summary.totalCostCents)}</strong><span>耗材 {report.summary.actualGrams.toFixed(1)} g</span></article><article className={report.summary.profitCents<0?"bad":"good"}><small>期间利润</small><strong>{rm(report.summary.profitCents)}</strong><span>收入减实际成本</span></article><article><small>质量良率</small><strong>{pct(report.summary.yieldBasisPoints)}</strong><span>{report.summary.goodUnits} 良品 / {report.summary.failedUnits} 不良</span></article><article><small>设备利用率</small><strong>{pct(report.summary.utilizationBasisPoints)}</strong><span>{report.activePrinters} 台已绑定设备</span></article><article><small>生产任务</small><strong>{report.summary.completed}</strong><span>{report.summary.failed} 个失败</span></article></section>
    <section className="report-table"><div><h2>每日经营明细</h2><span>{range.from} 至 {range.to}</span></div><table><thead><tr><th>日期</th><th>订单</th><th>收入</th><th>完成 / 失败</th><th>良品 / 不良</th><th>耗材</th><th>成本</th><th>生产时长</th></tr></thead><tbody>{report.rows.map(row=><tr key={row.date}><td>{row.date}</td><td>{row.orders}</td><td>{rm(row.revenueCents)}</td><td>{row.completed} / {row.failed}</td><td>{row.goodUnits} / {row.failedUnits}</td><td>{row.actualGrams.toFixed(1)} g</td><td>{rm(row.materialCostCents+row.otherCostCents)}</td><td>{row.productiveMinutes} 分钟</td></tr>)}</tbody></table></section>
  </main>
}
