import { redirect } from "next/navigation";
import { can, getAccessContext } from "../access-control";
import styles from "./analytics.module.css";

export const dynamic="force-dynamic";

export default async function AnalyticsHubPage(){
 const user=await getAccessContext(); if(!user)redirect("/");
 const finance=can(user,"finance.read");
 const views=[
  {href:"/reports",title:"生产经营报表",tag:"综合",copy:"订单收入、生产任务、良率、耗材成本和设备利用率的期间汇总。",allowed:true},
  {href:"/profit",title:"订单利润分析",tag:"财务",copy:"比较预计与实际成本，查看订单利润、利润率和材料偏差。",allowed:finance},
  {href:"/inventory-value",title:"库存价值与成本层",tag:"财务",copy:"按实体卷和采购批次查看未拆封、仓储及使用中耗材的真实库存价值与采购价差。",allowed:finance},
  {href:"/quality",title:"质量与良率",tag:"质量",copy:"定位失败原因、返工趋势和产品质量风险。",allowed:true},
  {href:"/maintenance",title:"设备效率与维保",tag:"设备",copy:"结合累计工时、维保到期和最近生产记录评估设备状态。",allowed:true},
 ];
 return <main className={styles.page}><header><div><a href="/">← LayerTrace</a><small>BUSINESS INTELLIGENCE</small><h1>经营分析</h1><p>只读汇总生产经营事实，帮助管理者判断利润、质量、设备与库存风险。</p></div><span>数据来自订单、打印监控、库存流水与质检记录</span></header>
 <section className={styles.principles}><div><b>事实优先</b><p>无法识别的任务与耗材保持待确认，不猜测利润。</p></div><div><b>预计 / 实际分离</b><p>标准成本、任务核算和称重校准分别留痕。</p></div><div><b>可追溯</b><p>指标能够回到订单、打印任务和耗材流水。</p></div></section>
 <section className={styles.grid}>{views.filter(x=>x.allowed).map(view=><a href={view.href} key={view.href}><span>{view.tag}</span><h2>{view.title}</h2><p>{view.copy}</p><b>打开分析 →</b></a>)}</section>
 {!finance&&<p className={styles.restricted}>当前岗位不显示订单利润数据；如需查看，请联系管理员分配财务权限。</p>}
 </main>
}
