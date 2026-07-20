"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Section = "概览" | "打印物品" | "耗材库存" | "订单" | "打印队列";
type Entity = "item" | "material" | "order" | "job";
type Item = { id:number; sku:string; name:string; category:string; estimatedGrams:number; estimatedMinutes:number };
type Material = { id:number; material:string; color:string; brand:string; initialGrams:number; remainingGrams:number; lowStockGrams:number };
type Order = { id:number; orderNo:string; customer:string; status:string; dueAt:string|null };
type Job = { id:number; jobNo:string; itemId:number|null; itemName:string|null; orderId:number|null; printerName:string; status:string; progress:number };
type WorkspaceData = { items:Item[]; materials:Material[]; orders:Order[]; jobs:Job[] };

const nav: { label:Section; mark:string }[] = [
  { label:"概览", mark:"⌂" }, { label:"打印物品", mark:"◇" }, { label:"耗材库存", mark:"◉" }, { label:"订单", mark:"▤" }, { label:"打印队列", mark:"▷" },
];
const emptyData:WorkspaceData = { items:[], materials:[], orders:[], jobs:[] };
const entityBySection:Record<Exclude<Section,"概览">,Entity> = { "打印物品":"item", "耗材库存":"material", "订单":"order", "打印队列":"job" };

export default function Home() {
  const [section,setSection] = useState<Section>("概览");
  const [data,setData] = useState<WorkspaceData>(emptyData);
  const [query,setQuery] = useState("");
  const [loading,setLoading] = useState(true);
  const [notice,setNotice] = useState("");
  const [modal,setModal] = useState<Entity|null>(null);

  async function loadData() {
    try {
      const response = await fetch("/api/workspace", { cache:"no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
    } catch { setNotice("数据服务暂时不可用，请稍后刷新"); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    fetch("/api/workspace", { cache:"no-store" })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setData(result);
      })
      .catch(() => setNotice("数据服务暂时不可用，请稍后刷新"))
      .finally(() => setLoading(false));
  }, []);

  function toast(message:string) { setNotice(message); window.setTimeout(() => setNotice(""),2600); }
  function openCreate() { setModal(section === "概览" ? "job" : entityBySection[section]); }
  async function remove(entity:Entity,id:number) {
    if (!window.confirm("确定删除这条记录吗？此操作不可撤销。")) return;
    const response = await fetch(`/api/workspace?entity=${entity}&id=${id}`, { method:"DELETE" });
    if (response.ok) { toast("记录已删除"); await loadData(); } else toast("删除失败：记录可能正在被其他数据使用");
  }
  async function advanceJob(job:Job) {
    const next = job.status === "排队" ? { status:"打印中", progress:5 } : job.status === "打印中" ? { status:"已完成", progress:100 } : { status:"排队", progress:0 };
    const response = await fetch("/api/workspace", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ entity:"job", id:job.id, ...next }) });
    if (response.ok) { toast(`任务已更新为${next.status}`); await loadData(); }
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return {
      items:data.items.filter(x => `${x.sku}${x.name}${x.category}`.toLowerCase().includes(q)),
      materials:data.materials.filter(x => `${x.material}${x.color}${x.brand}`.toLowerCase().includes(q)),
      orders:data.orders.filter(x => `${x.orderNo}${x.customer}${x.status}`.toLowerCase().includes(q)),
      jobs:data.jobs.filter(x => `${x.jobNo}${x.itemName}${x.printerName}${x.status}`.toLowerCase().includes(q)),
    };
  },[data,query]);

  const printing = data.jobs.filter(x => x.status === "打印中").length;
  const waiting = data.jobs.filter(x => x.status === "排队").length;
  const completed = data.jobs.filter(x => x.status === "已完成").length;
  const alerts = data.materials.filter(x => x.remainingGrams <= x.lowStockGrams).length;

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-cube">3D</span><div><strong>层迹</strong><small>PRINT OPS</small></div></div>
      <nav><p className="nav-title">工作空间</p>{nav.map(item => <button key={item.label} className={section===item.label?"nav-active":""} onClick={() => setSection(item.label)}><span>{item.mark}</span>{item.label}{item.label==="打印队列"&&<b>{waiting}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="system-state"><i/> {loading?"正在同步数据":"数据已同步"}</div><button onClick={() => toast("设置中心将在设备接入阶段开放")}>⚙ 系统设置</button><div className="profile"><span>郑</span><div><strong>管理员</strong><small>私有工作区</small></div><em>•••</em></div></div>
    </aside>
    <section className="content">
      <header className="topbar"><div><p>生产控制台</p><h1>{section}</h1></div><div className="top-actions"><label className="search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索当前数据"/></label><button className="icon-btn" aria-label="通知">♢<i/></button><button className="primary" onClick={openCreate}>＋ 新建{section==="概览"?"任务":section}</button></div></header>
      <div className="workspace">
        <div className="date-row"><div><span className="live-dot"/> {loading?"正在读取生产数据":"实时生产数据"}</div><time>2026年7月20日 · 星期一</time></div>
        {section === "概览" ? <Dashboard data={data} metrics={{printing,waiting,completed,alerts}} onNavigate={setSection} onAdvance={advanceJob}/> : <Management section={section} filtered={filtered} onDelete={remove} onAdvance={advanceJob}/>} 
      </div>
    </section>
    {modal && <CreateModal entity={modal} data={data} onClose={() => setModal(null)} onSaved={async () => { setModal(null); toast("记录已保存"); await loadData(); }}/>} 
    {notice&&<div className="toast"><span>✓</span>{notice}</div>}
  </main>;
}

function Dashboard({data,metrics,onNavigate,onAdvance}:{data:WorkspaceData;metrics:{printing:number;waiting:number;completed:number;alerts:number};onNavigate:(s:Section)=>void;onAdvance:(j:Job)=>void}) {
  return <>
    <section className="metrics"><Metric label="正在打印" value={String(metrics.printing)} unit="台设备" delta="生产运行中" accent="orange"/><Metric label="累计完成" value={String(metrics.completed)} unit="个任务" delta="实时记录" accent="green"/><Metric label="队列等待" value={String(metrics.waiting)} unit="个任务" delta="等待分配" accent="blue"/><Metric label="库存预警" value={String(metrics.alerts)} unit="卷耗材" delta="需要补货" accent="red"/></section>
    <section className="main-grid">
      <div className="panel queue-panel"><PanelHead eyebrow="LIVE QUEUE" title="打印队列" action="查看全部 →" onClick={()=>onNavigate("打印队列")}/><div className="job-list">{data.jobs.slice(0,4).map((job,i)=><article className="job" key={job.id}><div className="job-icon" style={{"--job-color":["#ff6b35","#f0b429","#58749b"][i%3]} as React.CSSProperties}>⬡</div><div className="job-main"><div className="job-title"><strong>{job.itemName||"未关联物品"}</strong><span className={`badge ${job.status==="排队"?"waiting":"printing"}`}>{job.status}</span></div><p>{job.jobNo}　·　{job.printerName}</p><div className="progress"><i style={{width:`${job.progress}%`}}/></div></div><div className="job-eta"><strong>{job.progress}%</strong><small>{job.status}</small></div><button onClick={()=>onAdvance(job)}>→</button></article>)}</div></div>
      <div className="panel inventory-panel"><PanelHead eyebrow="MATERIAL STOCK" title="耗材余量" action="管理库存 →" onClick={()=>onNavigate("耗材库存")}/><div className="material-list">{data.materials.slice(0,5).map((m,i)=><div className="material" key={m.id}><span className="spool" style={{"--spool":["#aeb4b8","#24292f","#244d7c","#f26722"][i%4]} as React.CSSProperties}><i/></span><div><div className="material-title"><strong>{m.material} {m.color}</strong><em className={m.remainingGrams>m.lowStockGrams?"ok":"warn"}>{m.remainingGrams>m.lowStockGrams?"充足":"补货"}</em></div><p>{m.brand||"未填写品牌"} · 1.75mm</p><div className="progress small"><i style={{width:`${Math.min(100,m.remainingGrams/m.initialGrams*100)}%`}}/></div></div><b>{m.remainingGrams}<small>g</small></b></div>)}</div></div>
    </section>
    <section className="panel orders-panel"><PanelHead eyebrow="RECENT ORDERS" title="近期订单" action="查看全部订单 →" onClick={()=>onNavigate("订单")}/><DataTable heads={["订单编号","客户","交付日期","状态"]} rows={data.orders.slice(0,5).map(o=>[o.orderNo,o.customer,o.dueAt||"未设置",o.status])}/></section>
  </>;
}

function Management({section,filtered,onDelete,onAdvance}:{section:Exclude<Section,"概览">;filtered:{items:Item[];materials:Material[];orders:Order[];jobs:Job[]};onDelete:(e:Entity,id:number)=>void;onAdvance:(j:Job)=>void}) {
  const configs = {
    "打印物品": { eyebrow:"ITEM LIBRARY", note:"维护可打印产品及其预计用料、工时", heads:["SKU","物品名称","分类","预计用料","预计工时","操作"], rows:filtered.items.map(x=>[x.sku,x.name,x.category,`${x.estimatedGrams} g`,`${x.estimatedMinutes} 分钟`,<button className="danger-link" key="d" onClick={()=>onDelete("item",x.id)}>删除</button>]) },
    "耗材库存": { eyebrow:"MATERIAL BATCHES", note:"按卷材批次跟踪初始重量、余量与预警线", heads:["材料","颜色","品牌","当前余量","预警线","操作"], rows:filtered.materials.map(x=>[x.material,x.color,x.brand||"—",`${x.remainingGrams} / ${x.initialGrams} g`,`${x.lowStockGrams} g`,<button className="danger-link" key="d" onClick={()=>onDelete("material",x.id)}>删除</button>]) },
    "订单": { eyebrow:"CUSTOMER ORDERS", note:"跟踪客户需求、交期和生产状态", heads:["订单编号","客户","交付日期","状态","操作"], rows:filtered.orders.map(x=>[x.orderNo,x.customer,x.dueAt||"未设置",<span className="order-state blue" key="s">{x.status}</span>,<button className="danger-link" key="d" onClick={()=>onDelete("order",x.id)}>删除</button>]) },
    "打印队列": { eyebrow:"PRINT JOBS", note:"管理任务优先顺序与生产进度", heads:["任务编号","打印物品","打印机","进度","状态","操作"], rows:filtered.jobs.map(x=>[x.jobNo,x.itemName||"未关联",x.printerName,`${x.progress}%`,<span className={`badge ${x.status==="排队"?"waiting":"printing"}`} key="s">{x.status}</span>,<div className="row-actions" key="a"><button onClick={()=>onAdvance(x)}>推进</button><button className="danger-link" onClick={()=>onDelete("job",x.id)}>删除</button></div>]) },
  } as const;
  const config = configs[section];
  return <section className="panel management"><div className="management-hero"><small>{config.eyebrow}</small><h2>{section}</h2><p>{config.note}</p></div><DataTable heads={[...config.heads]} rows={[...config.rows]}/>{config.rows.length===0&&<div className="empty-state">没有匹配的记录，请新建一条数据。</div>}</section>;
}

function CreateModal({entity,data,onClose,onSaved}:{entity:Entity;data:WorkspaceData;onClose:()=>void;onSaved:()=>void}) {
  const [saving,setSaving]=useState(false); const [error,setError]=useState("");
  const titles={item:"打印物品",material:"耗材批次",order:"客户订单",job:"打印任务"};
  async function submit(event:FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(""); const values=Object.fromEntries(new FormData(event.currentTarget)); const response=await fetch("/api/workspace",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entity,...values})}); const result=await response.json(); setSaving(false); if(!response.ok){setError(result.error||"保存失败");return;} onSaved(); }
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><form className="record-modal" onSubmit={submit}><div className="modal-head"><div><small>NEW RECORD</small><h2>新建{titles[entity]}</h2></div><button type="button" onClick={onClose}>×</button></div><div className="form-grid">
    {entity==="item"&&<><Field name="sku" label="SKU" placeholder="ITEM-004"/><Field name="name" label="物品名称" placeholder="例如：传感器支架"/><Field name="category" label="分类" placeholder="机械零件"/><Field name="estimatedGrams" label="预计用料（g）" type="number"/><Field name="estimatedMinutes" label="预计工时（分钟）" type="number"/></>}
    {entity==="material"&&<><Field name="material" label="材料类型" placeholder="PLA"/><Field name="color" label="颜色" placeholder="哑光白"/><Field name="brand" label="品牌" placeholder="eSUN"/><Field name="initialGrams" label="初始重量（g）" type="number" defaultValue="1000"/><Field name="remainingGrams" label="当前余量（g）" type="number" defaultValue="1000"/><Field name="lowStockGrams" label="预警线（g）" type="number" defaultValue="200"/></>}
    {entity==="order"&&<><Field name="orderNo" label="订单编号" placeholder="ORD-0271"/><Field name="customer" label="客户名称" placeholder="客户或公司"/><Field name="dueAt" label="交付日期" type="date"/><label><span>订单状态</span><select name="status"><option>待确认</option><option>待打印</option><option>生产中</option><option>已完成</option></select></label></>}
    {entity==="job"&&<><Field name="jobNo" label="任务编号" placeholder="JOB-045"/><Field name="printerName" label="打印机" placeholder="Bambu X1C"/><label><span>打印物品</span><select name="itemId"><option value="">暂不关联</option>{data.items.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label><span>关联订单</span><select name="orderId"><option value="">暂不关联</option>{data.orders.map(x=><option key={x.id} value={x.id}>{x.orderNo} · {x.customer}</option>)}</select></label><label><span>状态</span><select name="status"><option>排队</option><option>打印中</option><option>已完成</option></select></label></>}
  </div>{error&&<p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button className="primary" disabled={saving}>{saving?"保存中…":"保存记录"}</button></div></form></div>;
}

function Field({name,label,placeholder,type="text",defaultValue}:{name:string;label:string;placeholder?:string;type?:string;defaultValue?:string}) { return <label><span>{label}</span><input name={name} type={type} placeholder={placeholder} defaultValue={defaultValue} required={name!=="category"&&name!=="brand"}/></label>; }
function DataTable({heads,rows}:{heads:string[];rows:(string|React.ReactNode)[][]}) { return <div className="table-wrap"><table><thead><tr>{heads.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>; }
function Metric({label,value,unit,delta,accent}:{label:string;value:string;unit:string;delta:string;accent:string}) { return <article className={`metric ${accent}`}><div><p>{label}</p><strong>{value}<small>{unit}</small></strong><span>{delta}</span></div><div className="spark"><i/><i/><i/><i/><i/></div></article>; }
function PanelHead({eyebrow,title,action,onClick}:{eyebrow:string;title:string;action:string;onClick:()=>void}) { return <div className="panel-head"><div><small>{eyebrow}</small><h2>{title}</h2></div><button onClick={onClick}>{action}</button></div>; }
