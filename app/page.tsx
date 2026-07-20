"use client";

import { useMemo, useState } from "react";

type Section = "概览" | "打印物品" | "耗材库存" | "订单" | "打印队列";

const nav: { label: Section; mark: string }[] = [
  { label: "概览", mark: "⌂" },
  { label: "打印物品", mark: "◇" },
  { label: "耗材库存", mark: "◉" },
  { label: "订单", mark: "▤" },
  { label: "打印队列", mark: "▷" },
];

const jobs = [
  { id: "JOB-042", item: "机械臂夹爪 v3", printer: "Voron 2.4", material: "PETG · 碳黑", progress: 68, eta: "1小时 24分", state: "打印中", color: "#ff6b35" },
  { id: "JOB-043", item: "无人机云台外壳", printer: "Bambu X1C", material: "PLA · 岩石灰", progress: 12, eta: "3小时 51分", state: "打印中", color: "#f0b429" },
  { id: "JOB-044", item: "齿轮箱端盖 × 4", printer: "Prusa MK4", material: "ABS · 深蓝", progress: 0, eta: "等待 JOB-041", state: "排队", color: "#58749b" },
];

const materials = [
  { name: "PLA 岩石灰", brand: "Bambu Lab", weight: 742, total: 1000, color: "#aeb4b8", status: "充足" },
  { name: "PETG 碳黑", brand: "eSUN", weight: 186, total: 1000, color: "#24292f", status: "偏低" },
  { name: "ABS 深蓝", brand: "Polymaker", weight: 524, total: 1000, color: "#244d7c", status: "充足" },
  { name: "TPU 橙色", brand: "Overture", weight: 94, total: 500, color: "#f26722", status: "告急" },
];

const orders = [
  { id: "ORD-0268", customer: "星河机器人", item: "机械臂夹爪 v3", qty: "12 件", due: "今天 18:00", status: "生产中", tone: "orange" },
  { id: "ORD-0269", customer: "林工实验室", item: "无人机云台外壳", qty: "4 件", due: "明天", status: "待打印", tone: "blue" },
  { id: "ORD-0270", customer: "创客空间", item: "齿轮箱端盖", qty: "20 件", due: "7月23日", status: "待确认", tone: "gray" },
  { id: "ORD-0271", customer: "启点设计", item: "桌面收纳模块", qty: "8 件", due: "7月25日", status: "已排期", tone: "green" },
];

export default function Home() {
  const [section, setSection] = useState<Section>("概览");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const visibleOrders = useMemo(() => orders.filter((order) => `${order.id}${order.customer}${order.item}`.toLowerCase().includes(query.toLowerCase())), [query]);

  function act(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-cube">3D</span><div><strong>层迹</strong><small>PRINT OPS</small></div></div>
        <nav>
          <p className="nav-title">工作空间</p>
          {nav.map((item) => <button key={item.label} className={section === item.label ? "nav-active" : ""} onClick={() => setSection(item.label)}><span>{item.mark}</span>{item.label}{item.label === "打印队列" && <b>3</b>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-state"><i /> 系统运行正常</div>
          <button onClick={() => act("设置功能将在下一阶段开放")}>⚙ 系统设置</button>
          <div className="profile"><span>郑</span><div><strong>管理员</strong><small>本地工作区</small></div><em>•••</em></div>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div><p>生产控制台</p><h1>{section}</h1></div>
          <div className="top-actions">
            <label className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索订单、物品或耗材" /></label>
            <button className="icon-btn" aria-label="通知">♢<i /></button>
            <button className="primary" onClick={() => act("已创建一条新的打印任务草稿")}>＋ 新建任务</button>
          </div>
        </header>

        <div className="workspace">
          <div className="date-row"><div><span className="live-dot" /> 实时生产数据</div><time>2026年7月20日 · 星期一</time></div>

          <section className="metrics">
            <Metric label="正在打印" value="2" unit="台设备" delta="运行正常" accent="orange" chart="up" />
            <Metric label="今日已完成" value="7" unit="个任务" delta="↑ 16.7%" accent="green" chart="high" />
            <Metric label="队列等待" value="3" unit="个任务" delta="预计 8.4 小时" accent="blue" chart="mid" />
            <Metric label="库存预警" value="2" unit="卷耗材" delta="需要补货" accent="red" chart="down" />
          </section>

          <section className="main-grid">
            <div className="panel queue-panel">
              <PanelHead eyebrow="LIVE QUEUE" title="打印队列" action="查看全部 →" onClick={() => setSection("打印队列")} />
              <div className="job-list">
                {jobs.map((job) => <article className="job" key={job.id}>
                  <div className="job-icon" style={{ "--job-color": job.color } as React.CSSProperties}><span>⬡</span></div>
                  <div className="job-main">
                    <div className="job-title"><strong>{job.item}</strong><span className={job.state === "排队" ? "badge waiting" : "badge printing"}>{job.state}</span></div>
                    <p>{job.id}　·　{job.printer}　·　{job.material}</p>
                    <div className="progress"><i style={{ width: `${job.progress}%`, background: job.color }} /></div>
                  </div>
                  <div className="job-eta"><strong>{job.progress}%</strong><small>{job.eta}</small></div>
                  <button onClick={() => act(`${job.id} 操作菜单`)}>•••</button>
                </article>)}
              </div>
            </div>

            <div className="panel inventory-panel">
              <PanelHead eyebrow="MATERIAL STOCK" title="耗材余量" action="管理库存 →" onClick={() => setSection("耗材库存")} />
              <div className="material-list">
                {materials.map((m) => <div className="material" key={m.name}>
                  <span className="spool" style={{ "--spool": m.color } as React.CSSProperties}><i /></span>
                  <div><div className="material-title"><strong>{m.name}</strong><em className={m.status === "充足" ? "ok" : "warn"}>{m.status}</em></div><p>{m.brand} · 1.75mm</p><div className="progress small"><i style={{ width: `${m.weight / m.total * 100}%`, background: m.color }} /></div></div>
                  <b>{m.weight}<small>g</small></b>
                </div>)}
              </div>
            </div>
          </section>

          <section className="panel orders-panel">
            <PanelHead eyebrow="RECENT ORDERS" title="近期订单" action="查看全部订单 →" onClick={() => setSection("订单")} />
            <div className="table-wrap"><table><thead><tr><th>订单编号</th><th>客户</th><th>打印物品</th><th>数量</th><th>交付日期</th><th>状态</th><th /></tr></thead><tbody>
              {visibleOrders.map((order) => <tr key={order.id}><td><b>{order.id}</b></td><td>{order.customer}</td><td>{order.item}</td><td>{order.qty}</td><td>{order.due}</td><td><span className={`order-state ${order.tone}`}>{order.status}</span></td><td><button onClick={() => act(`正在查看 ${order.id}`)}>→</button></td></tr>)}
            </tbody></table></div>
          </section>
        </div>
      </section>
      {notice && <div className="toast"><span>✓</span>{notice}</div>}
    </main>
  );
}

function Metric({ label, value, unit, delta, accent, chart }: { label: string; value: string; unit: string; delta: string; accent: string; chart: string }) {
  return <article className={`metric ${accent}`}><div><p>{label}</p><strong>{value}<small>{unit}</small></strong><span>{delta}</span></div><div className={`spark ${chart}`}><i /><i /><i /><i /><i /></div></article>;
}

function PanelHead({ eyebrow, title, action, onClick }: { eyebrow: string; title: string; action: string; onClick: () => void }) {
  return <div className="panel-head"><div><small>{eyebrow}</small><h2>{title}</h2></div><button onClick={onClick}>{action}</button></div>;
}
