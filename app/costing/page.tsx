import { redirect } from "next/navigation";
import { getAccessContext } from "../access-control";
import styles from "./costing.module.css";

export const dynamic = "force-dynamic";

export default async function CostingHubPage(){
  const user=await getAccessContext();
  if(!user)redirect("/");
  const cards=[
    {href:"/",code:"01",title:"产品标准成本",copy:"维护产品标准用量、打印时间和建议售价；实际打印结果由监控链路回写。"},
    {href:"/quotes",code:"02",title:"客户定价与报价",copy:"以单位成本、目标毛利和数量形成报价，接受后转为正式订单。"},
    {href:"/settlements",code:"03",title:"打印会话归集",copy:"确认 Bambu 打印会话、切片指纹、AMS 实体卷、产品订单和分类耗材成本。"},
    {href:"/profit",code:"04",title:"实际成本与利润",copy:"按订单对比预计成本、实际成本、耗材偏差、报废与利润率。"},
    {href:"/reports",code:"05",title:"成本结果报表",copy:"查看期间材料、设备、人工、质量损失及订单经营结果。"},
  ];
  return <main className={styles.page}><header><a href="/">← 工作台</a><small>COST CONTROL · MYR</small><h1>成本与定价</h1><p>统一管理标准成本、实际成本和对客定价；不在这里切片、下发或操作打印机。</p></header>
    <section className={styles.formula}><span>主体耗材</span><b>＋</b><span>支撑与辅助材料</span><b>＋</b><span>冲刷与报废</span><b>＋</b><span>设备、电费与人工</span><b>＝</b><strong>真实生产成本</strong></section>
    <section className={styles.notice}><b>当前口径</b><p>现有页面继续使用当前 API；后续分类切片数据接入后，再细分主体、支撑、支撑界面、冲刷、擦拭塔和校准成本。</p></section>
    <section className={styles.grid}>{cards.map(card=><a href={card.href} key={card.code}><i>{card.code}</i><h2>{card.title}</h2><p>{card.copy}</p><span>查看现有数据 →</span></a>)}</section>
  </main>;
}
