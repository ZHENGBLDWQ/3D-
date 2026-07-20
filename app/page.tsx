"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Section = "概览" | "打印物品" | "耗材库存" | "耗材卷同步" | "订单" | "打印队列" | "生产明细" | "文件资产" | "设备管理";
type Entity = "item" | "material" | "order" | "job";
type Item = { id:number; sku:string; name:string; category:string; estimatedGrams:number; estimatedMinutes:number };
type Material = { id:number; material:string; color:string; brand:string; initialGrams:number; remainingGrams:number; lowStockGrams:number };
type Order = { id:number; orderNo:string; customer:string; status:string; dueAt:string|null };
type Job = { id:number; jobNo:string; itemId:number|null; itemName:string|null; orderId:number|null; printerName:string; status:string; progress:number; quantity:number; priority:number; materialDeducted:boolean; startedAt:string|null; completedAt:string|null };
type WorkspaceData = { items:Item[]; materials:Material[]; orders:Order[]; jobs:Job[] };

const nav: { label:Section; mark:string }[] = [
  { label:"概览", mark:"⌂" }, { label:"打印物品", mark:"◇" }, { label:"耗材库存", mark:"◉" }, { label:"耗材卷同步", mark:"◍" }, { label:"订单", mark:"▤" }, { label:"打印队列", mark:"▷" }, { label:"生产明细", mark:"≋" }, { label:"文件资产", mark:"▱" }, { label:"设备管理", mark:"▣" },
];
const emptyData:WorkspaceData = { items:[], materials:[], orders:[], jobs:[] };
const entityBySection:Record<"打印物品"|"耗材库存"|"订单"|"打印队列",Entity> = { "打印物品":"item", "耗材库存":"material", "订单":"order", "打印队列":"job" };

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
  function openCreate() { if(["生产明细","文件资产","设备管理","耗材卷同步"].includes(section)) return; setModal(section === "概览" ? "job" : entityBySection[section]); }
  async function remove(entity:Entity,id:number) {
    if (!window.confirm("确定删除这条记录吗？此操作不可撤销。")) return;
    const response = await fetch(`/api/workspace?entity=${entity}&id=${id}`, { method:"DELETE" });
    if (response.ok) { toast("记录已删除"); await loadData(); } else toast("删除失败：记录可能正在被其他数据使用");
  }
  async function runJobAction(job:Job,action:string) {
    const response = await fetch("/api/workspace", { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ entity:"job", id:job.id, action }) });
    const result=await response.json();
    if (response.ok) { toast(`任务已更新为${result.status}`); await loadData(); } else toast(result.error||"任务操作失败");
  }
  async function advanceJob(job:Job){const action=job.status==="排队"?"start":job.status==="打印中"||job.status==="已暂停"?"complete":"retry";await runJobAction(job,action);}

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
      <header className="topbar"><div><p>生产控制台</p><h1>{section}</h1></div><div className="top-actions"><label className="search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索当前数据"/></label><button className="icon-btn" aria-label="通知">♢<i/></button>{!(["生产明细","文件资产","设备管理","耗材卷同步"] as Section[]).includes(section)&&<button className="primary" onClick={openCreate}>＋ 新建{section==="概览"?"任务":section}</button>}</div></header>
      <div className="workspace">
        <div className="date-row"><div><span className="live-dot"/> {loading?"正在读取生产数据":"实时生产数据"}</div><time>2026年7月20日 · 星期一</time></div>
        {section === "概览" ? <Dashboard data={data} metrics={{printing,waiting,completed,alerts}} onNavigate={setSection} onAdvance={advanceJob}/> : section === "生产明细" ? <ProductionDetails data={data} toast={toast} onWorkspaceChanged={loadData}/> : section === "文件资产" ? <FileAssets data={data} toast={toast}/> : section === "设备管理" ? <PrinterManager toast={toast}/> : section === "耗材卷同步" ? <SpoolmanInventory toast={toast}/> : <Management section={section} filtered={filtered} onDelete={remove} onAction={runJobAction}/>}
      </div>
    </section>
    {modal ? <CreateModal entity={modal} data={data} onClose={() => setModal(null)} onSaved={async () => { setModal(null); toast("记录已保存"); await loadData(); }}/> : null}
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

function Management({section,filtered,onDelete,onAction}:{section:"打印物品"|"耗材库存"|"订单"|"打印队列";filtered:{items:Item[];materials:Material[];orders:Order[];jobs:Job[]};onDelete:(e:Entity,id:number)=>void;onAction:(j:Job,a:string)=>void}) {
  const configs = {
    "打印物品": { eyebrow:"ITEM LIBRARY", note:"维护可打印产品及其预计用料、工时", heads:["SKU","物品名称","分类","预计用料","预计工时","操作"], rows:filtered.items.map(x=>[x.sku,x.name,x.category,`${x.estimatedGrams} g`,`${x.estimatedMinutes} 分钟`,<button className="danger-link" key="d" onClick={()=>onDelete("item",x.id)}>删除</button>]) },
    "耗材库存": { eyebrow:"MATERIAL BATCHES", note:"按卷材批次跟踪初始重量、余量与预警线", heads:["材料","颜色","品牌","当前余量","预警线","操作"], rows:filtered.materials.map(x=>[x.material,x.color,x.brand||"—",`${x.remainingGrams} / ${x.initialGrams} g`,`${x.lowStockGrams} g`,<button className="danger-link" key="d" onClick={()=>onDelete("material",x.id)}>删除</button>]) },
    "订单": { eyebrow:"CUSTOMER ORDERS", note:"跟踪客户需求、交期和生产状态", heads:["订单编号","客户","交付日期","状态","操作"], rows:filtered.orders.map(x=>[x.orderNo,x.customer,x.dueAt||"未设置",<span className="order-state blue" key="s">{x.status}</span>,<button className="danger-link" key="d" onClick={()=>onDelete("order",x.id)}>删除</button>]) },
    "打印队列": { eyebrow:"PRINT JOBS", note:"管理排队、开始、暂停、完成、失败与重打；完成时按 BOM 自动扣料", heads:["任务编号","打印物品","打印机","数量/优先级","进度","状态","生产操作"], rows:filtered.jobs.map(x=>[x.jobNo,x.itemName||"未关联",x.printerName,`${x.quantity} 件 / P${x.priority}`,`${x.progress}%`,<span className={`badge ${x.status==="排队"?"waiting":"printing"}`} key="s">{x.status}</span>,<JobActions key="a" job={x} onAction={onAction} onDelete={()=>onDelete("job",x.id)}/>]) },
  } as const;
  const config = configs[section];
  return <section className="panel management"><div className="management-hero"><small>{config.eyebrow}</small><h2>{section}</h2><p>{config.note}</p></div><DataTable heads={[...config.heads]} rows={[...config.rows]}/>{config.rows.length===0&&<div className="empty-state">没有匹配的记录，请新建一条数据。</div>}</section>;
}

type DetailData={
  lines:{id:number;orderNo:string;itemName:string;quantity:number;unitPrice:number}[];
  bom:{id:number;itemName:string;material:string;color:string;gramsPerItem:number;wastePercent:number}[];
  transactions:{id:number;material:string;color:string;type:string;grams:number;note:string;createdAt:string}[];
  events:{id:number;jobNo:string;action:string;fromStatus:string;toStatus:string;note:string;createdAt:string}[];
};

function ProductionDetails({data,toast,onWorkspaceChanged}:{data:WorkspaceData;toast:(m:string)=>void;onWorkspaceChanged:()=>Promise<void>}) {
  const [details,setDetails]=useState<DetailData>({lines:[],bom:[],transactions:[],events:[]});
  const [tab,setTab]=useState<"orderLine"|"bom"|"transaction"|"events">("orderLine");
  const [busy,setBusy]=useState(false);
  async function load(){const response=await fetch("/api/details",{cache:"no-store"});const result=await response.json();if(response.ok)setDetails(result);else toast("明细读取失败");}
  useEffect(()=>{fetch("/api/details",{cache:"no-store"}).then(r=>r.json().then(v=>({ok:r.ok,v}))).then(({ok,v})=>{if(ok)setDetails(v);}).catch(()=>undefined);},[]);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);const values=Object.fromEntries(new FormData(event.currentTarget));const response=await fetch("/api/details",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entity:tab,...values})});const result=await response.json();setBusy(false);if(!response.ok){toast(result.error||"保存失败");return;}event.currentTarget.reset();toast("生产明细已保存");await Promise.all([load(),onWorkspaceChanged()]);}
  async function remove(entity:"orderLine"|"bom",id:number){const response=await fetch(`/api/details?entity=${entity}&id=${id}`,{method:"DELETE"});if(response.ok){toast("明细已删除");await load();}else toast("删除失败");}
  return <section className="details-layout">
    <div className="panel detail-entry"><div className="management-hero"><small>PRODUCTION DETAILS</small><h2>业务明细</h2><p>建立订单、物品配方与库存变动之间的可追溯关系</p></div><div className="detail-tabs"><button className={tab==="orderLine"?"active":""} onClick={()=>setTab("orderLine")}>订单行</button><button className={tab==="bom"?"active":""} onClick={()=>setTab("bom")}>物品 BOM</button><button className={tab==="transaction"?"active":""} onClick={()=>setTab("transaction")}>库存流水</button><button className={tab==="events"?"active":""} onClick={()=>setTab("events")}>任务事件</button></div>
      <form className="detail-form" onSubmit={submit}>
        {tab==="orderLine"&&<><label><span>客户订单</span><select name="orderId" required><option value="">请选择</option>{data.orders.map(x=><option value={x.id} key={x.id}>{x.orderNo} · {x.customer}</option>)}</select></label><label><span>打印物品</span><select name="itemId" required><option value="">请选择</option>{data.items.map(x=><option value={x.id} key={x.id}>{x.sku} · {x.name}</option>)}</select></label><Field name="quantity" label="订购数量" type="number" defaultValue="1"/><Field name="unitPrice" label="单价（元）" type="number" defaultValue="0"/></>}
        {tab==="bom"&&<><label><span>打印物品</span><select name="itemId" required><option value="">请选择</option>{data.items.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label><label><span>耗材批次</span><select name="batchId" required><option value="">请选择</option>{data.materials.map(x=><option value={x.id} key={x.id}>{x.material} {x.color} · {x.brand}</option>)}</select></label><Field name="gramsPerItem" label="单件用料（g）" type="number"/><Field name="wastePercent" label="损耗率（%）" type="number" defaultValue="5"/></>}
        {tab==="transaction"&&<><label><span>耗材批次</span><select name="batchId" required><option value="">请选择</option>{data.materials.map(x=><option value={x.id} key={x.id}>{x.material} {x.color} · 余 {x.remainingGrams}g</option>)}</select></label><label><span>变动类型</span><select name="type"><option>入库</option><option>领用</option><option>退料</option><option>报废</option></select></label><Field name="grams" label="变动克重（g）" type="number"/><Field name="note" label="备注" placeholder="采购入库、样件打印等"/></>}
        {tab!=="events"&&<button className="primary detail-save" disabled={busy}>{busy?"保存中…":"保存明细"}</button>}
      </form>
    </div>
    <div className="panel detail-history"><PanelHead eyebrow="TRACEABLE RECORDS" title={tab==="orderLine"?"订单内容":tab==="bom"?"物品用料清单":tab==="transaction"?"库存变动记录":"任务事件记录"} action="刷新 ↻" onClick={()=>void load()}/>
      {tab==="orderLine"?<DataTable heads={["订单","物品","数量","单价","操作"]} rows={details.lines.map(x=>[x.orderNo,x.itemName,String(x.quantity),`¥ ${x.unitPrice.toFixed(2)}`,<button className="danger-link" key="d" onClick={()=>remove("orderLine",x.id)}>删除</button>])}/>:null}
      {tab==="bom"?<DataTable heads={["物品","耗材","单件克重","损耗","操作"]} rows={details.bom.map(x=>[x.itemName,`${x.material} ${x.color}`,`${x.gramsPerItem} g`,`${x.wastePercent}%`,<button className="danger-link" key="d" onClick={()=>remove("bom",x.id)}>删除</button>])}/>:null}
      {tab==="transaction"?<DataTable heads={["耗材","类型","变动","备注","时间"]} rows={details.transactions.map(x=>[`${x.material} ${x.color}`,x.type,`${x.grams>0?"+":""}${x.grams} g`,x.note||"—",x.createdAt])}/>:null}
      {tab==="events"?<DataTable heads={["任务","操作","状态变化","备注","时间"]} rows={details.events.map(x=>[x.jobNo,x.action,`${x.fromStatus} → ${x.toStatus}`,x.note||"—",x.createdAt])}/>:null}
    </div>
  </section>;
}

function JobActions({job,onAction,onDelete}:{job:Job;onAction:(j:Job,a:string)=>void;onDelete:()=>void}) {
  const actions:Record<string,{key:string;label:string}[]>={
    "排队":[{key:"start",label:"开始"},{key:"cancel",label:"取消"}],
    "打印中":[{key:"pause",label:"暂停"},{key:"complete",label:"完成"},{key:"fail",label:"失败"}],
    "已暂停":[{key:"resume",label:"继续"},{key:"complete",label:"完成"},{key:"fail",label:"失败"}],
    "失败":[{key:"retry",label:"重打"}],
    "已取消":[{key:"retry",label:"重新排队"}],
  };
  return <div className="row-actions job-actions">{(actions[job.status]||[]).map(a=><button key={a.key} onClick={()=>onAction(job,a.key)}>{a.label}</button>)}{!["打印中","已暂停"].includes(job.status)&&<button className="danger-link" onClick={onDelete}>删除</button>}</div>;
}

type SyncedSpool={id:number;externalId:number;filamentName:string;vendor:string;material:string;colorHex:string;initialWeight:number|null;remainingWeight:number|null;usedWeight:number|null;location:string;lotNr:string;archived:boolean;lastUsed:string|null;lastSeenAt:string};
function SpoolmanInventory({toast}:{toast:(m:string)=>void}){const [spools,setSpools]=useState<SyncedSpool[]>([]);const [loading,setLoading]=useState(true);async function load(){setLoading(true);const response=await fetch("/api/spools",{cache:"no-store"});const result=await response.json();setLoading(false);if(response.ok)setSpools(result.spools);else toast(result.error||"耗材卷读取失败");}useEffect(()=>{void load();},[]);const active=spools.filter(s=>!s.archived);const total=active.reduce((sum,s)=>sum+(s.remainingWeight||0),0);return <section><div className="spool-summary"><div><small>SPOOLMAN STATUS</small><strong>{active.length}</strong><span>可用耗材卷</span></div><div><small>REMAINING</small><strong>{Math.round(total)}g</strong><span>同步剩余重量</span></div><div><small>LAST SYNC</small><strong>{spools[0]?new Date(spools[0].lastSeenAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"}):"--"}</strong><span>由本地代理更新</span></div></div><div className="panel"><PanelHead eyebrow="SPOOLMAN INVENTORY" title="耗材卷库存" action={loading?"同步中…":"刷新 ↻"} onClick={()=>void load()}/><div className="spool-grid">{spools.map(spool=>{const capacity=spool.initialWeight||((spool.remainingWeight||0)+(spool.usedWeight||0));const percent=capacity?Math.max(0,Math.min(100,(spool.remainingWeight||0)/capacity*100)):0;return <article className={`spool-card ${spool.archived?"archived":""}`} key={spool.id}><div className="spool-ring" style={{"--spool-color":spool.colorHex?`#${spool.colorHex.replace("#","")}`:"#8c9b95","--spool-level":`${percent}%`} as React.CSSProperties}><i/></div><div><div className="spool-title"><strong>#{spool.externalId} · {spool.filamentName||spool.material||"未命名耗材"}</strong><span>{spool.archived?"已归档":percent<20?"低库存":"可用"}</span></div><p>{spool.vendor||"未知厂商"} · {spool.material||"未知材质"} · {spool.location||"未设置位置"}</p><div className="spool-weight"><b>{Math.round(spool.remainingWeight||0)}g</b><span>剩余 / {Math.round(capacity||0)}g</span></div><div className="spool-bar"><i style={{width:`${percent}%`}}/></div><small>批次 {spool.lotNr||"--"}{spool.lastUsed?` · 最近使用 ${new Date(spool.lastUsed).toLocaleDateString("zh-CN")}`:""}</small></div></article>})}{!loading&&spools.length===0&&<div className="empty-state">尚未收到 Spoolman 数据。请在本地代理设置 SPOOLMAN_URL。</div>}</div></div></section>}

type PrintFile={id:number;itemId:number|null;itemName:string|null;filename:string;kind:string;version:string;sizeBytes:number;contentType:string;printerProfile:string;layerHeight:number|null;infillPercent:number|null;estimatedMinutes:number|null;notes:string;createdAt:string};
function FileAssets({data,toast}:{data:WorkspaceData;toast:(m:string)=>void}){
  const [files,setFiles]=useState<PrintFile[]>([]);const [printers,setPrinters]=useState<Printer[]>([]);const [uploading,setUploading]=useState(false);
  async function load(){const response=await fetch("/api/files",{cache:"no-store"});const result=await response.json();if(response.ok)setFiles(result.files);else toast(result.error||"文件读取失败");}
  useEffect(()=>{fetch("/api/files",{cache:"no-store"}).then(r=>r.json().then(v=>({ok:r.ok,v}))).then(({ok,v})=>{if(ok)setFiles(v.files);}).catch(()=>undefined);fetch("/api/printers",{cache:"no-store"}).then(r=>r.json().then(v=>({ok:r.ok,v}))).then(({ok,v})=>{if(ok)setPrinters(v.printers);}).catch(()=>undefined);},[]);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setUploading(true);const response=await fetch("/api/files",{method:"POST",body:new FormData(event.currentTarget)});const result=await response.json();setUploading(false);if(!response.ok){toast(result.error||"上传失败");return;}event.currentTarget.reset();toast("文件已上传");await load();}
  async function remove(id:number){if(!window.confirm("确定同时删除文件和元数据吗？"))return;const response=await fetch(`/api/files?id=${id}`,{method:"DELETE"});if(response.ok){toast("文件已删除");await load();}else toast("删除失败");}
  async function dispatch(file:PrintFile){if(!printers.length){toast("请先在设备管理中添加并连接打印机");return;}const menu=printers.map((p,i)=>`${i+1}. ${p.name}（${p.connectionState}）`).join("\n");const choice=Number(window.prompt(`选择接收 ${file.filename} 的打印机：\n${menu}`,"1"));const printer=printers[choice-1];if(!printer)return;const response=await fetch("/api/printers",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:printer.id,action:"command",command:"start",fileId:file.id})});const result=await response.json();if(!response.ok){toast(result.error||"下发失败");return;}toast(`已将 ${file.filename} 加入 ${printer.name} 的启动队列`);}
  const size=(bytes:number)=>bytes>1024*1024?`${(bytes/1024/1024).toFixed(1)} MB`:`${Math.ceil(bytes/1024)} KB`;
  return <section className="file-layout"><div className="panel file-upload"><div className="management-hero"><small>MODEL REPOSITORY</small><h2>上传打印文件</h2><p>支持 STL、3MF、G-code 和产品预览图片，单文件最大 100MB</p></div><form className="detail-form" onSubmit={submit}><label className="file-picker"><span>选择文件</span><input type="file" name="file" accept=".stl,.3mf,.gcode,.gco,.png,.jpg,.jpeg,.webp" required/></label><label><span>关联物品</span><select name="itemId"><option value="">暂不关联</option>{data.items.map(x=><option key={x.id} value={x.id}>{x.sku} · {x.name}</option>)}</select></label><Field name="version" label="版本" defaultValue="v1"/><Field name="printerProfile" label="打印机配置" placeholder="例如：Bambu X1C 0.4mm"/><Field name="layerHeight" label="层高（mm）" type="number"/><Field name="infillPercent" label="填充率（%）" type="number"/><Field name="estimatedMinutes" label="预计时长（分钟）" type="number"/><Field name="notes" label="备注" placeholder="切片器、喷嘴或变更说明"/><button className="primary detail-save" disabled={uploading}>{uploading?"上传中…":"上传并保存"}</button></form></div>
    <div className="panel file-library"><PanelHead eyebrow="FILES & VERSIONS" title="文件库" action="刷新 ↻" onClick={()=>void load()}/><div className="file-cards">{files.map(file=><article className="file-card" key={file.id}><div className={`file-kind ${file.kind==="图片"?"image":""}`}>{file.kind==="图片"?"▧":file.kind==="G-code"?"G":"3D"}</div><div className="file-info"><div><strong>{file.filename}</strong><span>{file.kind} · {file.version}</span></div><p>{file.itemName||"未关联物品"}　·　{size(file.sizeBytes)}</p><small>{file.printerProfile||"未设置打印机配置"}{file.layerHeight?` · ${file.layerHeight}mm`:""}{file.infillPercent?` · 填充 ${file.infillPercent}%`:""}</small></div><div className="file-actions">{file.kind==="G-code"&&<button onClick={()=>dispatch(file)}>发送并打印</button>}<a href={`/api/files?download=${file.id}`}>下载</a><button onClick={()=>remove(file.id)}>删除</button></div></article>)}{files.length===0&&<div className="empty-state">还没有文件，先上传一个模型或 G-code。</div>}</div></div></section>;
}

type Printer={id:number;name:string;model:string;technology:string;location:string;nozzleDiameter:number;buildVolume:string;status:string;totalHours:number;maintenanceDueAt:string|null;notes:string;connectorType:string;connectionState:string;lastSeenAt:string|null;nozzleTemp:number|null;bedTemp:number|null;currentFile:string|null;remoteProgress:number|null};
function PrinterManager({toast}:{toast:(m:string)=>void}){
  const [printers,setPrinters]=useState<Printer[]>([]);const [saving,setSaving]=useState(false);
  async function load(){const response=await fetch("/api/printers",{cache:"no-store"});const result=await response.json();if(response.ok)setPrinters(result.printers);else toast("设备读取失败");}
  useEffect(()=>{fetch("/api/printers",{cache:"no-store"}).then(r=>r.json().then(v=>({ok:r.ok,v}))).then(({ok,v})=>{if(ok)setPrinters(v.printers);}).catch(()=>undefined);const timer=window.setInterval(()=>void load(),10000);return()=>window.clearInterval(timer);},[]);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setSaving(true);const values=Object.fromEntries(new FormData(event.currentTarget));const response=await fetch("/api/printers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(values)});const result=await response.json();setSaving(false);if(!response.ok){toast(result.error||"保存失败");return;}event.currentTarget.reset();toast("设备档案已保存");await load();}
  async function status(printer:Printer,next:string){const response=await fetch("/api/printers",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:printer.id,status:next})});if(response.ok){toast(`设备已设为${next}`);await load();}else toast("状态更新失败");}
  async function connect(printer:Printer){const connectorType=window.prompt("连接类型：moonraker 或 octoprint",printer.connectorType==="manual"?"moonraker":printer.connectorType);if(!connectorType)return;const response=await fetch("/api/printers",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:printer.id,action:"rotateToken",connectorType})});const result=await response.json();if(!response.ok){toast(result.error||"生成令牌失败");return;}await navigator.clipboard.writeText(result.token);window.alert(`代理令牌已复制。请立即保存，关闭后将无法再次查看：\n\n${result.token}`);await load();}
  async function command(printer:Printer,name:"pause"|"resume"|"cancel"){const labels={pause:"暂停",resume:"继续",cancel:"取消"};if(name==="cancel"&&!window.confirm(`确定取消 ${printer.name} 当前的打印吗？`))return;const response=await fetch("/api/printers",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:printer.id,action:"command",command:name})});const result=await response.json();if(!response.ok){toast(result.error||"命令下发失败");return;}toast(`${labels[name]}命令已进入安全队列`);}
  async function remove(id:number){if(!window.confirm("确定删除该设备档案吗？"))return;const response=await fetch(`/api/printers?id=${id}`,{method:"DELETE"});if(response.ok){toast("设备已删除");await load();}else toast("删除失败");}
  return <section className="printer-layout"><div className="panel printer-entry"><div className="management-hero"><small>PRINTER REGISTRY</small><h2>添加打印机</h2><p>本地代理主动连接云端，无需开放工作室路由器端口</p></div><form className="detail-form" onSubmit={submit}><Field name="name" label="设备名称" placeholder="打印机 01"/><Field name="model" label="品牌型号" placeholder="Bambu Lab X1C"/><label><span>打印技术</span><select name="technology"><option>FDM</option><option>SLA</option><option>SLS</option></select></label><Field name="location" label="摆放位置" placeholder="工作室 A 区"/><Field name="nozzleDiameter" label="喷嘴直径（mm）" type="number" defaultValue="0.4"/><Field name="buildVolume" label="成型尺寸" placeholder="256 × 256 × 256 mm"/><Field name="totalHours" label="累计工时" type="number" defaultValue="0"/><Field name="maintenanceDueAt" label="下次保养日期" type="date"/><Field name="notes" label="设备备注" placeholder="耗材槽、改装和维护说明"/><button className="primary detail-save" disabled={saving}>{saving?"保存中…":"保存设备"}</button></form></div><div className="panel printer-list"><PanelHead eyebrow="WORKSHOP FLEET" title={`设备列表 · ${printers.length} 台`} action="刷新 ↻" onClick={()=>void load()}/><div className="printer-cards">{printers.map(p=><article className="printer-card" key={p.id}><div className="printer-visual">▣<i className={p.connectionState==="未连接"?"":p.status==="维护中"?"maintain":"online"}/></div><div className="printer-copy"><div><strong>{p.name}</strong><span>{p.status}</span><span>{p.connectorType} · {p.connectionState}</span></div><p>{p.model||"未填写型号"} · {p.technology} · {p.nozzleDiameter}mm 喷嘴</p><small>{p.location||"未设置位置"}　|　累计 {p.totalHours}h{p.nozzleTemp!==null?`　|　喷嘴 ${p.nozzleTemp.toFixed(1)}℃ / 热床 ${(p.bedTemp||0).toFixed(1)}℃`:""}</small>{p.currentFile&&<em>{p.currentFile} · {Math.round(p.remoteProgress||0)}%</em>}{p.lastSeenAt&&<em>最后上报：{new Date(p.lastSeenAt).toLocaleString("zh-CN")}</em>}</div><div className="printer-actions"><button onClick={()=>connect(p)}>连接代理</button>{p.connectionState!=="未连接"&&<><button onClick={()=>command(p,"pause")}>暂停</button><button onClick={()=>command(p,"resume")}>继续</button><button className="danger-link" onClick={()=>command(p,"cancel")}>取消打印</button></>}<button onClick={()=>status(p,"维护中")}>维护</button><button onClick={()=>status(p,"停用")}>停用</button><button className="danger-link" onClick={()=>remove(p.id)}>删除</button></div></article>)}{printers.length===0&&<div className="empty-state">还没有设备档案，请先添加打印机。</div>}</div></div></section>;
}

function CreateModal({entity,data,onClose,onSaved}:{entity:Entity;data:WorkspaceData;onClose:()=>void;onSaved:()=>void}) {
  const [saving,setSaving]=useState(false); const [error,setError]=useState("");
  const titles={item:"打印物品",material:"耗材批次",order:"客户订单",job:"打印任务"};
  async function submit(event:FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(""); const values=Object.fromEntries(new FormData(event.currentTarget)); const response=await fetch("/api/workspace",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entity,...values})}); const result=await response.json(); setSaving(false); if(!response.ok){setError(result.error||"保存失败");return;} onSaved(); }
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><form className="record-modal" onSubmit={submit}><div className="modal-head"><div><small>NEW RECORD</small><h2>新建{titles[entity]}</h2></div><button type="button" onClick={onClose}>×</button></div><div className="form-grid">
    {entity==="item"&&<><Field name="sku" label="SKU" placeholder="ITEM-004"/><Field name="name" label="物品名称" placeholder="例如：传感器支架"/><Field name="category" label="分类" placeholder="机械零件"/><Field name="estimatedGrams" label="预计用料（g）" type="number"/><Field name="estimatedMinutes" label="预计工时（分钟）" type="number"/></>}
    {entity==="material"&&<><Field name="material" label="材料类型" placeholder="PLA"/><Field name="color" label="颜色" placeholder="哑光白"/><Field name="brand" label="品牌" placeholder="eSUN"/><Field name="initialGrams" label="初始重量（g）" type="number" defaultValue="1000"/><Field name="remainingGrams" label="当前余量（g）" type="number" defaultValue="1000"/><Field name="lowStockGrams" label="预警线（g）" type="number" defaultValue="200"/></>}
    {entity==="order"&&<><Field name="orderNo" label="订单编号" placeholder="ORD-0271"/><Field name="customer" label="客户名称" placeholder="客户或公司"/><Field name="dueAt" label="交付日期" type="date"/><label><span>订单状态</span><select name="status"><option>待确认</option><option>待打印</option><option>生产中</option><option>已完成</option></select></label></>}
    {entity==="job"&&<><Field name="jobNo" label="任务编号" placeholder="JOB-045"/><Field name="printerName" label="打印机" placeholder="Bambu X1C"/><label><span>打印物品</span><select name="itemId"><option value="">暂不关联</option>{data.items.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label><span>关联订单</span><select name="orderId"><option value="">暂不关联</option>{data.orders.map(x=><option key={x.id} value={x.id}>{x.orderNo} · {x.customer}</option>)}</select></label><Field name="quantity" label="打印数量" type="number" defaultValue="1"/><label><span>优先级</span><select name="priority" defaultValue="3"><option value="1">P1 · 紧急</option><option value="2">P2 · 高</option><option value="3">P3 · 普通</option><option value="4">P4 · 低</option></select></label></>}
  </div>{error&&<p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" onClick={onClose}>取消</button><button className="primary" disabled={saving}>{saving?"保存中…":"保存记录"}</button></div></form></div>;
}

function Field({name,label,placeholder,type="text",defaultValue}:{name:string;label:string;placeholder?:string;type?:string;defaultValue?:string}) { const optional=["category","brand","note","notes","printerProfile","layerHeight","infillPercent","estimatedMinutes","model","location","buildVolume","totalHours","maintenanceDueAt"].includes(name); return <label><span>{label}</span><input name={name} type={type} step={type==="number"?"any":undefined} placeholder={placeholder} defaultValue={defaultValue} required={!optional}/></label>; }
function DataTable({heads,rows}:{heads:string[];rows:(string|React.ReactNode)[][]}) { return <div className="table-wrap"><table><thead><tr>{heads.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>; }
function Metric({label,value,unit,delta,accent}:{label:string;value:string;unit:string;delta:string;accent:string}) { return <article className={`metric ${accent}`}><div><p>{label}</p><strong>{value}<small>{unit}</small></strong><span>{delta}</span></div><div className="spark"><i/><i/><i/><i/><i/></div></article>; }
function PanelHead({eyebrow,title,action,onClick}:{eyebrow:string;title:string;action:string;onClick:()=>void}) { return <div className="panel-head"><div><small>{eyebrow}</small><h2>{title}</h2></div><button onClick={onClick}>{action}</button></div>; }
