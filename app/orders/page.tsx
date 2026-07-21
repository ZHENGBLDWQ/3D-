import { redirect } from "next/navigation";
import { getAccessContext } from "../access-control";
import styles from "./orders.module.css";

export const dynamic = "force-dynamic";

const flows = [
  { href: "/quotes", eyebrow: "QUOTATION", title: "客户与报价", copy: "维护客户、成本报价与有效期；报价接受后自动转为订单。", action: "进入报价" },
  { href: "/", eyebrow: "ORDER REGISTER", title: "订单与生产进度", copy: "查看订单、交期、关联产品，以及打印监控数据回写的完成进度。", action: "返回工作台查看订单" },
  { href: "/fulfillment", eyebrow: "FULFILLMENT", title: "质检与成品交付", copy: "按订单登记良品、包装与交付，避免把打印完成误认为成品完成。", action: "进入交付" },
  { href: "/receivables", eyebrow: "RECEIVABLES", title: "应收与回款", copy: "从订单生成发票，跟踪分次回款、逾期信号和账龄。", action: "进入应收" },
  { href: "/after-sales", eyebrow: "AFTER SALES", title: "售后与返工", copy: "把客户问题、返工任务和退款成本继续归集到原订单。", action: "进入售后" },
];

export default async function OrdersHubPage() {
  const user = await getAccessContext();
  if (!user) redirect("/");
  return <main className={styles.page}>
    <header className={styles.hero}>
      <a href="/" className={styles.back}>← LayerTrace 工作台</a>
      <div><small>ORDER LIFECYCLE</small><h1>订单中心</h1><p>把询价、订单、打印结果、质检、交付、回款和售后串成一条可追溯业务链。</p></div>
      <span className={styles.identity}>{user.displayName} · {user.role}</span>
    </header>
    <section className={styles.boundary}><b>职责边界</b><span>Bambu Studio 负责模型、切片与打印操作；本中心只管理订单及打印结果形成的业务进度。</span></section>
    <section className={styles.flow} aria-label="订单业务流程">
      {['报价','确认订单','打印监控回写','质检交付','回款售后'].map((item,index)=><div key={item}><i>{index+1}</i><span>{item}</span></div>)}
    </section>
    <section className={styles.grid}>{flows.map(card=><a href={card.href} className={styles.card} key={card.href}><small>{card.eyebrow}</small><h2>{card.title}</h2><p>{card.copy}</p><strong>{card.action} →</strong></a>)}</section>
  </main>;
}
