import {redirect} from "next/navigation";
import {can,getAccessContext} from "../access-control";
import {getProfitReport} from "../../profit/data";
import {formatRm} from "../../profit/report";
import "./profit.css";

export const dynamic="force-dynamic";
const percent=(basisPoints:number)=>`${(basisPoints/100).toFixed(1)}%`;
export default async function ProfitPage(){
  const user=await getAccessContext();if(!user)redirect("/");if(!can(user,"finance.read"))redirect("/");
  const report=await getProfitReport(user.organizationId);
  const maximum=Math.max(1,...report.trend.map(row=>Math.max(row.revenue.cents,Math.abs(row.profit.cents))));
  return <main className="profit-page">
    <header><div><small>FINANCE · ACTUAL COST</small><h1>成本与利润分析</h1><p>订单收入、真实消耗、设备、电费、人工及报废成本统一以马来西亚令吉核算。</p></div><a href="/">返回工作台</a></header>
    {report.empty?<section className="profit-empty"><span>RM</span><h2>还没有可核算的订单</h2><p>订单产生明细和打印任务后，这里会自动形成预计与实际成本、利润和设备利用率。</p></section>:<>
      <section className="profit-kpis">
        <article><small>订单收入</small><strong>{formatRm(report.summary.revenue)}</strong><span>当前组织订单明细</span></article>
        <article><small>实际总成本</small><strong>{formatRm(report.summary.actualCost)}</strong><span>预计 {formatRm(report.summary.estimatedCost)}</span></article>
        <article className={report.summary.actualProfit.cents<0?"loss":"gain"}><small>实际利润</small><strong>{formatRm(report.summary.actualProfit)}</strong><span>利润率 {percent(report.summary.marginBasisPoints)}</span></article>
        <article><small>设备利用率 · 30天</small><strong>{percent(report.summary.utilizationBasisPoints)}</strong><span>按真实打印时长</span></article>
        <article><small>材料用量偏差</small><strong>{report.summary.materialVarianceGrams>0?"+":""}{report.summary.materialVarianceGrams.toFixed(1)} g</strong><span>实际减预计</span></article>
        <article className={report.summary.scrapCost.cents>0?"loss":""}><small>报废成本</small><strong>{formatRm(report.summary.scrapCost)}</strong><span>耗材报废与补录</span></article>
      </section>
      <section className="profit-grid">
        <article className="profit-panel profit-trend"><div className="panel-title"><div><small>ORDER TREND</small><h2>订单收入与利润趋势</h2></div><span>最近 12 笔</span></div><div className="trend-chart">{report.trend.map(row=><div className="trend-column" key={row.label}><div className="trend-bars"><i style={{height:`${Math.max(3,row.revenue.cents/maximum*100)}%`}}/><b className={row.profit.cents<0?"negative":""} style={{height:`${Math.max(3,Math.abs(row.profit.cents)/maximum*100)}%`}}/></div><small>{row.label}</small></div>)}</div><div className="legend"><span><i/>收入</span><span><b/>利润／亏损</span></div></article>
        <article className="profit-panel"><div className="panel-title"><div><small>FLEET</small><h2>设备利用率</h2></div></div>{report.printers.length?<div className="device-list">{report.printers.map(printer=><div key={printer.name}><span><b>{printer.name}</b><small>{printer.hours.toFixed(1)} 小时 · {printer.jobs} 任务 · {printer.failed} 失败</small></span><strong>{percent(printer.utilizationBasisPoints)}</strong></div>)}</div>:<p className="minor-empty">暂无已执行的设备任务</p>}</article>
      </section>
      <section className="profit-panel order-profit"><div className="panel-title"><div><small>ORDER P&L</small><h2>订单利润明细</h2></div><span>预计与实际分开核算</span></div><div className="profit-table"><table><thead><tr><th>订单</th><th>收入</th><th>预计成本</th><th>实际成本</th><th>材料偏差</th><th>报废</th><th>利润</th><th>利润率</th></tr></thead><tbody>{report.orders.map(order=><tr key={order.orderId}><td><b>{order.orderNo}</b><small>{order.customer} · {order.completedJobs}/{order.jobs} 已完成</small></td><td>{formatRm(order.revenue)}</td><td>{formatRm(order.estimatedCost)}</td><td>{formatRm(order.actualCost)}</td><td className={order.material.varianceGrams>0?"bad":""}>{order.material.varianceGrams>0?"+":""}{order.material.varianceGrams.toFixed(1)} g</td><td>{formatRm(order.scrap)}</td><td className={order.actualProfit.cents<0?"bad":"good"}>{formatRm(order.actualProfit)}</td><td>{percent(order.marginBasisPoints)}</td></tr>)}</tbody></table></div></section>
    </>}
  </main>;
}
