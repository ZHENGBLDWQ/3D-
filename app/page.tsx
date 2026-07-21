"use client";

import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import InventoryCenter from "./inventory-center";
import { DialogProvider, useDialogs } from "./ui-dialogs";

type Section =
  | "概览"
  | "经营分析"
  | "良率分析"
  | "打印物品"
  | "耗材库存"
  | "耗材卷同步"
  | "订单"
  | "打印队列"
  | "生产明细"
  | "文件资产"
  | "设备管理"
  | "外部任务"
  | "系统中心";
type Entity = "item" | "material" | "order" | "job";
type Item = {
  id: number;
  sku: string;
  name: string;
  category: string;
  estimatedGrams: number;
  estimatedMinutes: number;
};
type Material = {
  id: number;
  material: string;
  color: string;
  brand: string;
  initialGrams: number;
  remainingGrams: number;
  lowStockGrams: number;
  costPerKg: number;
  reservedGrams: number;
  availableGrams: number;
  stockValue: number;
  usedPercent: number;
};
type InventoryMaterial = Material & {
  sku: string;
  specification: string;
  spoolWeightGrams: number;
  spoolCount: number;
  supplier: string;
  warehouse: string;
  location: string;
  lotNo: string;
  receivedAt: string | null;
  expiryAt: string | null;
  status: string;
  notes: string;
};
type InventoryTransaction = {
  id: number;
  batchId: number;
  material: string;
  color: string;
  type: string;
  grams: number;
  note: string;
  documentNo: string;
  operator: string;
  warehouse: string;
  source: string;
  createdAt: string;
};
type InventoryData = {
  materials: InventoryMaterial[];
  products: Array<InventoryMaterial & {
    printerOccupiedGrams: number;
    taskOccupiedGrams: number;
    occupiedGrams: number;
    inTransitGrams: number;
    usage3Days: number;
    usage15Days: number;
    usage30Days: number;
  }>;
  printers: Array<{
    id: number;
    name: string;
    model: string;
    location: string;
    status: string;
    connectionState: string;
    currentFile: string | null;
    remoteProgress: number | null;
    nozzleTemp: number | null;
    bedTemp: number | null;
    lastSeenAt: string | null;
    allocations: Array<{ id:number; batchId:number; sku:string; material:string; color:string; brand:string; amsUnit:number|null; trayIndex:number|null; allocatedGrams:number; remainingGrams:number; assignedAt:string }>;
    amsSlots: Array<{ amsUnit:number; trayIndex:number; material:string; colorHex:string; remainingPercent:number|null; active:boolean; lastSeenAt:string }>;
  }>;
  transit: Array<{ id:number; batchId:number; sku:string; material:string; color:string; grams:number; supplier:string; purchaseNo:string; eta:string|null; status:string; operator:string; createdAt:string }>;
  transactions: InventoryTransaction[];
  stocktakes: Array<{
    id: number;
    batchId: number;
    material: string;
    color: string;
    bookGrams: number;
    countedGrams: number;
    varianceGrams: number;
    reason: string;
    operator: string;
    createdAt: string;
  }>;
  summary: {
    skuCount: number;
    totalGrams: number;
    stockValue: number;
    lowStockCount: number;
    monthlyUsageGrams: number;
    monthlyWasteGrams: number;
  };
};
type ItemCost = {
  itemId: number;
  plannedGrams: number;
  materialCost: number;
  machineCost: number;
  energyCost: number;
  laborCost: number;
  overheadCost: number;
  estimatedUnitCost: number;
  suggestedPrice: number;
  actualUnitCost: number | null;
  completedUnits: number;
};
type Order = {
  id: number;
  orderNo: string;
  customer: string;
  status: string;
  dueAt: string | null;
};
type Job = {
  id: number;
  jobNo: string;
  itemId: number | null;
  itemName: string | null;
  orderId: number | null;
  printerId: number | null;
  fileId: number | null;
  printerName: string;
  status: string;
  progress: number;
  quantity: number;
  priority: number;
  materialDeducted: boolean;
  startedAt: string | null;
  completedAt: string | null;
  plannedStartAt: string | null;
  expectedCompleteAt: string | null;
};
type OrderLine = { id:number; orderId:number; itemId:number; quantity:number; unitPrice:number };
type ItemMaterialRequirement = { itemId:number; batchId:number; gramsPerItem:number; wastePercent:number };
type WorkspaceData = {
  items: Item[];
  materials: Material[];
  orders: Order[];
  jobs: Job[];
  printers: Printer[];
  orderLines: OrderLine[];
  files: PrintFile[];
  itemMaterialRequirements: ItemMaterialRequirement[];
  itemCosts: ItemCost[];
};

const navGroups: { title: string; items: { label: Section; mark: string }[] }[] = [
  { title: "工作台", items: [{ label: "概览", mark: "⌂" }, { label: "经营分析", mark: "▥" }, { label: "良率分析", mark: "◎" }] },
  { title: "业务与生产", items: [{ label: "订单", mark: "▤" }, { label: "打印物品", mark: "◇" }, { label: "打印队列", mark: "▷" }, { label: "生产明细", mark: "≋" }, { label: "外部任务", mark: "↗" }] },
  { title: "库存与设备", items: [{ label: "耗材库存", mark: "◉" }, { label: "耗材卷同步", mark: "◍" }, { label: "文件资产", mark: "▱" }, { label: "设备管理", mark: "▣" }] },
];
const sectionDescriptions: Record<Section,string> = {
  概览:"掌握订单、设备、库存和生产风险",经营分析:"查看收入、成本与订单利润",良率分析:"定位失败原因与质量趋势",
  打印物品:"维护产品档案、工艺与标准成本",耗材库存:"管理仓库、在途、盘点与在机耗材",耗材卷同步:"同步并挂载 Spoolman 耗材卷",
  订单:"管理客户订单与交付状态",打印队列:"安排任务并跟踪打印进度",生产明细:"关联订单、物品与实际用料",
  文件资产:"管理 STL、3MF 与 G-code 版本",设备管理:"连接并控制工作室打印机",外部任务:"认领 Bambu Studio 外部任务",
  系统中心:"检查运行状态、告警与数据备份",
};
const emptyData: WorkspaceData = {
  items: [],
  materials: [],
  orders: [],
  jobs: [],
  printers: [],
  orderLines: [],
  files: [],
  itemMaterialRequirements: [],
  itemCosts: [],
};
const entityBySection: Record<
  "打印物品" | "耗材库存" | "订单" | "打印队列",
  Entity
> = { 打印物品: "item", 耗材库存: "material", 订单: "order", 打印队列: "job" };

export default function Home() { return <DialogProvider><HomeWorkspace/></DialogProvider>; }

function HomeWorkspace() {
  const dialogs = useDialogs();
  const [section, setSection] = useState<Section>("概览");
  const [data, setData] = useState<WorkspaceData>(emptyData);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<Entity | null>(null);
  const todayLabel = useMemo(() => new Intl.DateTimeFormat("zh-CN", { year:"numeric", month:"long", day:"numeric", weekday:"long" }).format(new Date()), []);

  async function loadData() {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result);
    } catch {
      setNotice("数据服务暂时不可用，请稍后刷新");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    fetch("/api/workspace", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setData(result);
      })
      .catch(() => setNotice("数据服务暂时不可用，请稍后刷新"))
      .finally(() => setLoading(false));
  }, []);

  const toast = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }, []);
  function openCreate() {
    if (
      [
        "生产明细",
        "文件资产",
        "设备管理",
        "外部任务",
        "耗材卷同步",
        "耗材库存",
        "经营分析",
        "良率分析",
        "系统中心",
      ].includes(section)
    )
      return;
    setModal(section === "概览" ? "job" : entityBySection[section]);
  }
  async function remove(entity: Entity, id: number) {
    if (!await dialogs.confirm({title:"删除这条记录？",message:"删除后无法撤销，关联数据可能受到影响。",confirmLabel:"确认删除",danger:true})) return;
    const response = await fetch(`/api/workspace?entity=${entity}&id=${id}`, {
      method: "DELETE",
    });
    if (response.ok) {
      toast("记录已删除");
      await loadData();
    } else toast("删除失败：记录可能正在被其他数据使用");
  }
  async function runJobAction(job: Job, action: string) {
    let note = "";
    if (action === "fail") {
      const reason = await dialogs.prompt({title:"记录打印失败原因",message:"失败原因将用于良率分析和后续工艺改进。",defaultValue:"翘边",choices:["翘边","脱层","堵头","断料","尺寸偏差","表面缺陷","设备故障","其他"].map(value=>({label:value,value}))});
      if (!reason) return;
      note = reason.trim();
    }
    const response = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: "job", id: job.id, action, note }),
    });
    const result = await response.json();
    if (response.ok) {
      toast(`任务已更新为${result.status}`);
      await loadData();
    } else toast(result.error || "任务操作失败");
  }
  async function updateMaterialCost(material: Material) {
    const value = await dialogs.prompt({title:"更新耗材采购成本",message:`${material.material} · ${material.color}（RM/kg）`,defaultValue:String(material.costPerKg||0),inputType:"number",confirmLabel:"保存成本"});
    if (value === null) return;
    const response = await fetch("/api/workspace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: "material",
        id: material.id,
        costPerKg: Number(value),
      }),
    });
    if (response.ok) {
      toast("耗材成本已更新");
      await loadData();
    } else toast("成本更新失败");
  }
  async function advanceJob(job: Job) {
    const action =
      job.status === "排队"
        ? "start"
        : job.status === "打印中" || job.status === "已暂停"
          ? "complete"
          : "retry";
    await runJobAction(job, action);
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return {
      items: data.items.filter((x) =>
        `${x.sku}${x.name}${x.category}`.toLowerCase().includes(q),
      ),
      materials: data.materials.filter((x) =>
        `${x.material}${x.color}${x.brand}`.toLowerCase().includes(q),
      ),
      orders: data.orders.filter((x) =>
        `${x.orderNo}${x.customer}${x.status}`.toLowerCase().includes(q),
      ),
      jobs: data.jobs.filter((x) =>
        `${x.jobNo}${x.itemName}${x.printerName}${x.status}`
          .toLowerCase()
          .includes(q),
      ),
    };
  }, [data, query]);

  const printing = data.jobs.filter((x) => x.status === "打印中").length;
  const waiting = data.jobs.filter((x) => x.status === "排队").length;
  const completed = data.jobs.filter((x) => x.status === "已完成").length;
  const alerts = data.materials.filter(
    (x) => x.remainingGrams <= x.lowStockGrams,
  ).length;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-cube">3D</span>
          <div>
            <strong>层迹</strong>
            <small>PRINT OPS</small>
          </div>
        </div>
        <nav>
          {navGroups.map(group => <div className="nav-group" key={group.title}>
            <p className="nav-title">{group.title}</p>
            {group.items.map(item => <button key={item.label} className={section===item.label?"nav-active":""} aria-current={section===item.label?"page":undefined} title={item.label} onClick={()=>setSection(item.label)}>
              <span>{item.mark}</span><em>{item.label}</em>{item.label==="打印队列"&&waiting>0&&<b>{waiting}</b>}
            </button>)}
          </div>)}
          <div className="nav-group">
            <p className="nav-title">管理</p>
            <a className="main-nav-link" href="/team" title="员工与权限"><span>♙</span><em>员工与权限</em></a>
            <a className="main-nav-link" href="/fleet" title="打印机中枢"><span>▣</span><em>打印机中枢</em></a>
            <a className="main-nav-link" href="/models" title="模型资产库"><span>⬡</span><em>模型资产库</em></a>
            <a className="main-nav-link" href="/gateways" title="通信网关"><span>⌁</span><em>通信网关</em></a>
            <a className="main-nav-link" href="/slicing" title="切片中心"><span>◫</span><em>切片中心</em></a>
            <a className="main-nav-link" href="/preflight" title="下发预检"><span>✓</span><em>下发预检</em></a>
            <a className="main-nav-link" href="/scheduling" title="智能排产"><span>⌘</span><em>智能排产</em></a>
            <a className="main-nav-link" href="/dispatch" title="下发工作流"><span>⇢</span><em>下发工作流</em></a>
            <a className="main-nav-link" href="/execution" title="生产执行"><span>▶</span><em>生产执行</em></a>
            <a className="main-nav-link" href="/quality" title="质量追溯"><span>◎</span><em>质量追溯</em></a>
            <a className="main-nav-link" href="/profit" title="利润分析"><span>RM</span><em>利润分析</em></a>
            <button className={section==="系统中心"?"nav-active":""} aria-current={section==="系统中心"?"page":undefined} title="系统中心" onClick={()=>setSection("系统中心")}><span>⚙</span><em>系统中心</em></button>
          </div>
        </nav>
        <div className="sidebar-bottom">
          <div className="system-state">
            <i /> {loading ? "正在同步数据" : "数据已同步"}
          </div>
          <div className="profile">
            <span>郑</span>
            <div>
              <strong>管理员</strong>
              <small>私有工作区</small>
            </div>
            <em>•••</em>
          </div>
        </div>
      </aside>
      <section className="content">
        <header className="topbar">
          <div>
            <p>{sectionDescriptions[section]}</p>
            <h1>{section}</h1>
          </div>
          <div className="top-actions">
            <label className="search">
              <span>⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索当前数据"
              />
            </label>
            <button className="icon-btn" aria-label="通知">
              ♢<i />
            </button>
            {!(
              [
                "生产明细",
                "文件资产",
                "设备管理",
                "耗材卷同步",
                "耗材库存",
                "经营分析",
                "良率分析",
                "系统中心",
              ] as Section[]
            ).includes(section) && (
              <button className="primary" onClick={openCreate}>
                ＋ 新建{section === "概览" ? "任务" : section}
              </button>
            )}
          </div>
        </header>
        <div className="workspace">
          <div className="date-row">
            <div>
              <span className="live-dot" />{" "}
              {loading ? "正在读取生产数据" : "实时生产数据"}
            </div>
            <time>{todayLabel}</time>
          </div>
          {section === "概览" ? (
            <Dashboard
              data={data}
              metrics={{ printing, waiting, completed, alerts }}
              onNavigate={setSection}
              onAdvance={advanceJob}
            />
          ) : section === "经营分析" ? (
            <Analytics toast={toast} />
          ) : section === "良率分析" ? (
            <QualityAnalytics toast={toast} />
          ) : section === "系统中心" ? (
            <SystemCenter toast={toast} />
          ) : section === "生产明细" ? (
            <ProductionDetails
              data={data}
              toast={toast}
              onWorkspaceChanged={loadData}
            />
          ) : section === "文件资产" ? (
            <FileAssets data={data} toast={toast} />
          ) : section === "设备管理" ? (
            <PrinterManager toast={toast} />
          ) : section === "外部任务" ? (
            <ExternalPrintJobs data={data} toast={toast} onChanged={loadData} />
          ) : section === "耗材卷同步" ? (
            <SpoolmanInventory toast={toast} />
          ) : section === "耗材库存" ? (
            <InventoryCenter toast={toast} />
          ) : (
            <Management
              section={section}
              filtered={filtered}
              itemCosts={data.itemCosts}
              onDelete={remove}
              onAction={runJobAction}
              onCost={updateMaterialCost}
            />
          )}
        </div>
      </section>
      {modal ? (
        <CreateModal
          entity={modal}
          data={data}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            toast("记录已保存");
            await loadData();
          }}
        />
      ) : null}
      {notice && (
        <div className="toast">
          <span>✓</span>
          {notice}
        </div>
      )}
    </main>
  );
}

function Dashboard({
  data,
  metrics,
  onNavigate,
  onAdvance,
}: {
  data: WorkspaceData;
  metrics: {
    printing: number;
    waiting: number;
    completed: number;
    alerts: number;
  };
  onNavigate: (s: Section) => void;
  onAdvance: (j: Job) => void;
}) {
  const [systemHealth,setSystemHealth]=useState<SystemData["health"]|null>(null);
  const [systemAlerts,setSystemAlerts]=useState<SystemData["alerts"]>([]);
  const [dashboardNow]=useState(()=>Date.now());
  useEffect(()=>{let active=true;const load=()=>fetch("/api/system",{cache:"no-store"}).then(response=>response.ok?response.json():null).then(result=>{if(active&&result){setSystemHealth(result.health);setSystemAlerts(result.alerts||[])}}).catch(()=>undefined);void load();const timer=window.setInterval(load,30000);return()=>{active=false;window.clearInterval(timer)}},[]);
  const dueSoon=data.orders.filter(order=>order.dueAt&&order.status!=="已完成"&&new Date(order.dueAt).getTime()<=dashboardNow+2*86400000);
  const tasks=[
    ...(dueSoon.length?[{tone:"danger",title:`${dueSoon.length} 个订单临近或已超过交期`,detail:"优先检查排程与交付承诺",section:"订单" as Section}]:[]),
    ...(metrics.waiting?[{tone:"warning",title:`${metrics.waiting} 个任务正在等待打印`,detail:"检查打印机负载并安排生产",section:"打印队列" as Section}]:[]),
    ...(metrics.alerts?[{tone:"danger",title:`${metrics.alerts} 项耗材低于安全库存`,detail:"补货、调拨或调整生产计划",section:"耗材库存" as Section}]:[]),
    ...(systemHealth?.offlinePrinters?[{tone:"danger",title:`${systemHealth.offlinePrinters} 台打印机连接异常`,detail:"检查本地 Agent 与局域网连接",section:"设备管理" as Section}]:[]),
    ...((systemHealth?.pendingCommands||systemHealth?.failedCommands)?[{tone:"warning",title:"设备命令需要处理",detail:`超时 ${systemHealth?.pendingCommands||0} · 失败 ${systemHealth?.failedCommands||0}`,section:"系统中心" as Section}]:[]),
    ...(!data.printers.length?[{tone:"info",title:"还没有添加打印机",detail:"建立第一台设备档案后即可安排任务",section:"设备管理" as Section}]:[]),
  ];
  return (
    <>
      <section className="metrics">
        <Metric
          label="正在打印"
          value={String(metrics.printing)}
          unit="台设备"
          delta="生产运行中"
          accent="orange"
        />
        <Metric
          label="累计完成"
          value={String(metrics.completed)}
          unit="个任务"
          delta="实时记录"
          accent="green"
        />
        <Metric
          label="队列等待"
          value={String(metrics.waiting)}
          unit="个任务"
          delta="等待分配"
          accent="blue"
        />
        <Metric
          label="库存预警"
          value={String(metrics.alerts)}
          unit="卷耗材"
          delta="需要补货"
          accent="red"
        />
      </section>
      <section className="today-center panel">
        <header className="today-center-head"><div><small>TODAY'S PRIORITIES</small><h2>今天需要处理什么</h2><p>{tasks.length?`当前有 ${tasks.length} 类事项需要关注。建议从高风险项目开始。`:"订单、设备与库存运行正常，暂无紧急事项。"}</p></div><button onClick={()=>onNavigate("系统中心")}>查看全部告警 →</button></header>
        <div className="today-task-grid">
          {tasks.slice(0,5).map((task,index)=><button className={`today-task ${task.tone}`} key={`${task.title}-${index}`} onClick={()=>onNavigate(task.section)}><i>{task.tone==="danger"?"!":task.tone==="warning"?"△":"+"}</i><span><strong>{task.title}</strong><small>{task.detail}</small></span><b>→</b></button>)}
          {!tasks.length&&<div className="today-clear"><i>✓</i><span><strong>今日运行平稳</strong><small>系统会持续检查交期、设备连接、任务队列和库存水位。</small></span></div>}
        </div>
        {systemAlerts[0]&&<footer className="today-alert-preview"><span>最新告警</span><strong>{systemAlerts[0].title}</strong><p>{systemAlerts[0].detail}</p></footer>}
      </section>
      <section className="main-grid">
        <div className="panel queue-panel">
          <PanelHead
            eyebrow="LIVE QUEUE"
            title="打印队列"
            action="查看全部 →"
            onClick={() => onNavigate("打印队列")}
          />
          <div className="job-list">
            {data.jobs.slice(0, 4).map((job, i) => (
              <article className="job" key={job.id}>
                <div
                  className="job-icon"
                  style={
                    {
                      "--job-color": ["#ff6b35", "#f0b429", "#58749b"][i % 3],
                    } as React.CSSProperties
                  }
                >
                  ⬡
                </div>
                <div className="job-main">
                  <div className="job-title">
                    <strong>{job.itemName || "未关联物品"}</strong>
                    <span
                      className={`badge ${job.status === "排队" ? "waiting" : "printing"}`}
                    >
                      {job.status}
                    </span>
                  </div>
                  <p>
                    {job.jobNo}　·　{job.printerName}
                  </p>
                  <div className="progress">
                    <i style={{ width: `${job.progress}%` }} />
                  </div>
                </div>
                <div className="job-eta">
                  <strong>{job.progress}%</strong>
                  <small>{job.status}</small>
                </div>
                <button onClick={() => onAdvance(job)}>→</button>
              </article>
            ))}
          </div>
        </div>
        <div className="panel inventory-panel">
          <PanelHead
            eyebrow="MATERIAL STOCK"
            title="耗材余量"
            action="管理库存 →"
            onClick={() => onNavigate("耗材库存")}
          />
          <div className="material-list">
            {data.materials.slice(0, 5).map((m, i) => (
              <div className="material" key={m.id}>
                <span
                  className="spool"
                  style={
                    {
                      "--spool": ["#aeb4b8", "#24292f", "#244d7c", "#f26722"][
                        i % 4
                      ],
                    } as React.CSSProperties
                  }
                >
                  <i />
                </span>
                <div>
                  <div className="material-title">
                    <strong>
                      {m.material} {m.color}
                    </strong>
                    <em
                      className={
                        m.remainingGrams > m.lowStockGrams ? "ok" : "warn"
                      }
                    >
                      {m.remainingGrams > m.lowStockGrams ? "充足" : "补货"}
                    </em>
                  </div>
                  <p>{m.brand || "未填写品牌"} · 1.75mm</p>
                  <div className="progress small">
                    <i
                      style={{
                        width: `${Math.min(100, (m.remainingGrams / m.initialGrams) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <b>
                  {m.remainingGrams}
                  <small>g</small>
                </b>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="panel orders-panel">
        <PanelHead
          eyebrow="RECENT ORDERS"
          title="近期订单"
          action="查看全部订单 →"
          onClick={() => onNavigate("订单")}
        />
        <DataTable
          heads={["订单编号", "客户", "交付日期", "状态"]}
          rows={data.orders
            .slice(0, 5)
            .map((o) => [o.orderNo, o.customer, o.dueAt || "未设置", o.status])}
        />
      </section>
    </>
  );
}

function LegacyInventoryCenter({ toast }: { toast: (message: string) => void }) {
  const [inventory, setInventory] = useState<InventoryData | null>(null);
  const [dialog, setDialog] = useState<"create" | "movement" | "stocktake" | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [inventoryView, setInventoryView] = useState<"cards" | "table">("cards");
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [inventoryFilter, setInventoryFilter] = useState<"all" | "active" | "sealed" | "low">("all");

  async function loadInventory() {
    const response = await fetch("/api/inventory", { cache: "no-store" });
    const result = await response.json();
    if (response.ok) setInventory(result);
    else toast(result.error || "库存数据读取失败");
  }
  useEffect(() => {
    void loadInventory();
  }, []);

  async function submitInventory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog) return;
    setSaving(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const action = dialog === "create" ? "createMaterial" : dialog;
    const response = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...values }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) return toast(result.error || "库存操作失败");
    toast(dialog === "stocktake" ? `盘点完成，差异 ${Number(result.variance || 0).toFixed(1)}g` : "库存记录已保存");
    setDialog(null);
    setSelectedBatch(null);
    await loadInventory();
  }

  if (!inventory) return <div className="empty-state">正在建立正规库存台账…</div>;
  const summary = inventory.summary;
  const totalSpools = inventory.materials.reduce(
    (sum, item) => sum + Number(item.remainingGrams || 0) / Math.max(1, Number(item.spoolWeightGrams || 1000)),
    0,
  );
  const colorValue = (color: string) => {
    const key = color.toLowerCase();
    const palette: Record<string, string> = { "白": "#f5f4ef", white: "#f5f4ef", "黑": "#22282a", black: "#22282a", "灰": "#8d9696", gray: "#8d9696", grey: "#8d9696", "红": "#e6534c", red: "#e6534c", "蓝": "#376fd5", blue: "#376fd5", "黄": "#f0cf3e", yellow: "#f0cf3e", "绿": "#4eaa70", green: "#4eaa70", "橙": "#ef8a3d", orange: "#ef8a3d", "紫": "#7458bb", purple: "#7458bb", "粉": "#ed7ca6", pink: "#ed7ca6" };
    return Object.entries(palette).find(([name]) => key.includes(name))?.[1] || "#b7c1bd";
  };
  const materialState = (item: InventoryMaterial) => {
    const available = Math.max(0, Number(item.remainingGrams) - Number(item.reservedGrams || 0));
    if (available <= Number(item.lowStockGrams || 0)) return { key: "low", label: "库存不足" };
    if (Number(item.remainingGrams) >= Number(item.spoolWeightGrams) * 0.98) return { key: "sealed", label: "未开封" };
    return { key: "active", label: item.status === "已装入 AMS" ? "已装入 AMS" : "使用中" };
  };
  const normalizedQuery = inventoryQuery.trim().toLowerCase();
  const visibleMaterials = inventory.materials.filter((item) => {
    const state = materialState(item);
    const matchesQuery = !normalizedQuery || [item.sku, item.material, item.color, item.brand, item.lotNo, item.location].join(" ").toLowerCase().includes(normalizedQuery);
    return matchesQuery && (inventoryFilter === "all" || state.key === inventoryFilter);
  });
  const commonMaterials = [...inventory.materials]
    .sort((a, b) => Number(b.reservedGrams || 0) - Number(a.reservedGrams || 0) || Number(b.remainingGrams || 0) - Number(a.remainingGrams || 0))
    .slice(0, 4);
  return (
    <section className="inventory-center">
      <div className="inventory-kpis">
        <article><small>物料品种</small><strong>{summary.skuCount}</strong><span>SKU / 批次</span></article>
        <article><small>账面库存</small><strong>{(Number(summary.totalGrams || 0) / 1000).toFixed(2)} kg</strong><span>约 {totalSpools.toFixed(1)} 卷</span></article>
        <article><small>库存价值</small><strong>RM {Number(summary.stockValue || 0).toFixed(2)}</strong><span>移动加权成本口径</span></article>
        <article className={Number(summary.lowStockCount) ? "inventory-kpi-alert" : ""}><small>补货预警</small><strong>{summary.lowStockCount}</strong><span>低于安全库存</span></article>
        <article><small>本月领用</small><strong>{Number(summary.monthlyUsageGrams || 0).toFixed(0)} g</strong><span>打印自动扣减</span></article>
        <article><small>本月损耗</small><strong>{Number(summary.monthlyWasteGrams || 0).toFixed(0)} g</strong><span>损耗 + 盘亏</span></article>
      </div>
      <div className="inventory-toolbar">
        <div>
          <small>WAREHOUSE CONTROL</small>
          <h2>耗材库存总账</h2>
          <p>物料主档、批次卷、出入库、盘点、损耗、预警和成本统一留痕。</p>
        </div>
        <div>
          <button onClick={() => { setSelectedBatch(null); setDialog("movement"); }}>出入库登记</button>
          <button onClick={() => { setSelectedBatch(null); setDialog("stocktake"); }}>库存盘点</button>
          <button className="primary" onClick={() => setDialog("create")}>＋ 新建物料</button>
        </div>
      </div>
      {commonMaterials.length > 0 && <div className="panel inventory-common-panel">
        <div className="inventory-section-head"><div><small>QUICK ACCESS</small><h3>常用耗材</h3></div><span>按任务预占和库存量推荐</span></div>
        <div className="inventory-common-grid">{commonMaterials.map((item) => {
          const percent = Math.max(0, Math.min(100, Number(item.remainingGrams) / Math.max(1, Number(item.spoolWeightGrams)) * 100));
          return <button key={item.id} onClick={() => { setSelectedBatch(item.id); setDialog("movement"); }}>
            <span className="spool-mini" style={{ "--spool-color": colorValue(item.color), "--spool-level": `${percent}%` } as CSSProperties}><i /><i /><i /></span>
            <span><strong>{item.material} · {item.color}</strong><small>{item.brand || "未填写品牌"} · {item.remainingGrams.toFixed(0)}g</small></span>
          </button>;
        })}</div>
      </div>}
      <div className="inventory-controls">
        <div className="inventory-search"><span>⌕</span><input value={inventoryQuery} onChange={(event) => setInventoryQuery(event.target.value)} placeholder="搜索 SKU、材质、颜色、品牌、批次或库位" /></div>
        <div className="inventory-filter-tabs">
          {([['all','全部'],['active','使用中'],['sealed','未开封'],['low','库存不足']] as const).map(([value, label]) => <button key={value} className={inventoryFilter === value ? "active" : ""} onClick={() => setInventoryFilter(value)}>{label}</button>)}
        </div>
        <div className="inventory-view-toggle"><button className={inventoryView === "cards" ? "active" : ""} onClick={() => setInventoryView("cards")} aria-label="卡片视图">▦</button><button className={inventoryView === "table" ? "active" : ""} onClick={() => setInventoryView("table")} aria-label="表格视图">☷</button></div>
      </div>
      {inventoryView === "cards" ? <div className="inventory-card-grid">
        {visibleMaterials.map((item) => {
          const available = Math.max(0, Number(item.remainingGrams) - Number(item.reservedGrams || 0));
          const percent = Math.max(0, Math.min(100, Number(item.remainingGrams) / Math.max(1, Number(item.spoolWeightGrams)) * 100));
          const state = materialState(item);
          return <article className={`inventory-spool-card ${state.key}`} key={item.id}>
            <div className="spool-card-top"><span className="spool-visual" style={{ "--spool-color": colorValue(item.color), "--spool-level": `${percent}%` } as CSSProperties}><i /><i /><i /><i /></span><div><span className={`inventory-status ${state.key === "low" ? "low" : ""}`}>{state.label}</span><small>{item.sku}</small></div></div>
            <div className="spool-card-title"><h3>{item.material} · {item.color}</h3><p>{item.brand || "未填写品牌"} · {item.specification || `${item.spoolWeightGrams}g/卷`}</p></div>
            <div className="spool-progress"><div><span style={{ width: `${percent}%` }} /></div><strong>{item.remainingGrams.toFixed(0)} / {item.spoolWeightGrams.toFixed(0)} g</strong></div>
            <dl><div><dt>可用库存</dt><dd>{available.toFixed(0)}g</dd></div><div><dt>任务预占</dt><dd>{Number(item.reservedGrams || 0).toFixed(0)}g</dd></div><div><dt>库存价值</dt><dd>RM {(Number(item.remainingGrams) * Number(item.costPerKg || 0) / 1000).toFixed(2)}</dd></div><div><dt>仓库 / 库位</dt><dd>{item.warehouse} · {item.location || "未设置"}</dd></div></dl>
            <div className="spool-card-actions"><button onClick={() => { setSelectedBatch(item.id); setDialog("movement"); }}>出入库</button><button onClick={() => { setSelectedBatch(item.id); setDialog("stocktake"); }}>盘点</button></div>
          </article>;
        })}
        {visibleMaterials.length === 0 && <div className="empty-state inventory-empty-card">没有符合条件的耗材。</div>}
      </div> : <div className="panel inventory-ledger-panel">
        <div className="table-wrap">
          <table>
            <thead><tr><th>物料 / SKU</th><th>规格与批次</th><th>账面库存</th><th>预占 / 可用</th><th>单位成本</th><th>库存价值</th><th>库位</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {visibleMaterials.map((item) => {
                const available = Math.max(0, Number(item.remainingGrams) - Number(item.reservedGrams || 0));
                const low = available <= Number(item.lowStockGrams || 0);
                return <tr key={item.id} className={low ? "inventory-low-row" : ""}>
                  <td><span className="product-identity"><strong>{item.material} · {item.color}</strong><small>{item.sku} · {item.brand || "未填写品牌"}</small></span></td>
                  <td><span className="product-identity"><strong>{item.specification || `${item.spoolWeightGrams}g/卷`}</strong><small>批次 {item.lotNo || "未编号"} · {item.spoolCount.toFixed(1)} 卷入账</small></span></td>
                  <td><span className="inventory-quantity"><strong>{Number(item.remainingGrams).toFixed(1)} g</strong><small>{(Number(item.remainingGrams) / Math.max(1, Number(item.spoolWeightGrams))).toFixed(2)} 卷</small></span></td>
                  <td><span className="inventory-quantity"><strong>{Number(item.reservedGrams || 0).toFixed(1)} / {available.toFixed(1)} g</strong><small>预占 / 可用</small></span></td>
                  <td>RM {Number(item.costPerKg || 0).toFixed(2)}/kg</td>
                  <td><strong>RM {(Number(item.remainingGrams) * Number(item.costPerKg || 0) / 1000).toFixed(2)}</strong></td>
                  <td>{item.warehouse}<small className="table-hint">{item.location || "未设库位"}</small></td>
                  <td><span className={`inventory-status ${low ? "low" : ""}`}>{low ? "需补货" : item.status}</span><small className="table-hint">安全线 {item.lowStockGrams}g</small></td>
                  <td><div className="row-actions"><button onClick={() => { setSelectedBatch(item.id); setDialog("movement"); }}>出入库</button><button onClick={() => { setSelectedBatch(item.id); setDialog("stocktake"); }}>盘点</button></div></td>
                </tr>;
              })}
              {visibleMaterials.length === 0 && <tr><td colSpan={9}><div className="empty-state">没有符合条件的耗材。</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>}
      <div className="panel inventory-flow-panel">
        <PanelHead eyebrow="PERPETUAL LEDGER" title="库存流水 · 最近 300 笔" action="刷新 ↻" onClick={() => void loadInventory()} />
        <div className="table-wrap"><table><thead><tr><th>时间</th><th>单据号</th><th>物料</th><th>业务类型</th><th>数量</th><th>仓库 / 经办人</th><th>来源 / 备注</th></tr></thead><tbody>
          {inventory.transactions.map((tx) => <tr key={tx.id}><td>{new Date(tx.createdAt).toLocaleString("zh-CN")}</td><td>{tx.documentNo || `TX-${tx.id}`}</td><td>{tx.material} · {tx.color}</td><td><span className={`flow-type ${tx.grams >= 0 ? "in" : "out"}`}>{tx.type}</span></td><td className={tx.grams >= 0 ? "flow-in" : "flow-out"}>{tx.grams >= 0 ? "+" : ""}{Number(tx.grams).toFixed(1)} g</td><td>{tx.warehouse}<small className="table-hint">{tx.operator || "系统"}</small></td><td>{tx.source}<small className="table-hint">{tx.note || "—"}</small></td></tr>)}
          {inventory.transactions.length === 0 && <tr><td colSpan={7}><div className="empty-state">暂无库存流水。</div></td></tr>}
        </tbody></table></div>
      </div>
      {dialog && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setDialog(null)}>
        <form className="record-modal inventory-modal" onSubmit={submitInventory}>
          <div className="modal-head"><div><small>INVENTORY DOCUMENT</small><h2>{dialog === "create" ? "新建物料与期初入库" : dialog === "movement" ? "出入库登记" : "库存盘点"}</h2></div><button type="button" onClick={() => setDialog(null)}>×</button></div>
          <div className="form-grid">
            {dialog === "create" ? <>
              <Field name="sku" label="物料编码 SKU" placeholder="PLA-WHITE-1KG" />
              <Field name="material" label="材料类型" placeholder="PLA" />
              <Field name="color" label="颜色" placeholder="哑光白" />
              <Field name="brand" label="品牌" placeholder="R3D" />
              <Field name="specification" label="规格" placeholder="1.75mm · 1kg/卷" />
              <Field name="spoolWeightGrams" label="每卷净重（g）" type="number" defaultValue="1000" />
              <Field name="spoolCount" label="入库卷数" type="number" defaultValue="1" />
              <Field name="costPerKg" label="成本（RM/kg）" type="number" defaultValue="0" />
              <Field name="lowStockGrams" label="安全库存（g）" type="number" defaultValue="1000" />
              <Field name="supplier" label="供应商" placeholder="供应商名称" />
              <Field name="lotNo" label="批次号" placeholder="LOT-202607" />
              <Field name="documentNo" label="入库单号" placeholder="GRN-202607-001" />
              <Field name="warehouse" label="仓库" placeholder="主仓" defaultValue="主仓" />
              <Field name="location" label="库位" placeholder="A-01-01" />
              <Field name="receivedAt" label="入库日期" type="date" />
              <Field name="operator" label="经办人" placeholder="员工姓名" />
              <Field name="notes" label="备注" placeholder="采购来源或异常说明" />
            </> : <>
              <label><span>耗材批次</span><select name="batchId" required defaultValue={selectedBatch || ""}><option value="">请选择</option>{inventory.materials.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.material} {item.color} · {item.remainingGrams.toFixed(0)}g</option>)}</select></label>
              {dialog === "movement" ? <>
                <label><span>业务类型</span><select name="type" required><option>采购入库</option><option>生产领用</option><option>损耗</option><option>报废</option><option>退料</option></select></label>
                <Field name="grams" label="数量（g）" type="number" />
                <Field name="documentNo" label="单据号" placeholder="GRN / ISSUE / LOSS" />
                <Field name="operator" label="经办人" placeholder="员工姓名" />
                <Field name="warehouse" label="仓库" defaultValue="主仓" />
                <Field name="note" label="业务说明" placeholder="订单、任务或损耗原因" />
              </> : <>
                <Field name="countedGrams" label="实盘重量（g）" type="number" />
                <Field name="operator" label="盘点人" placeholder="员工姓名" />
                <Field name="reason" label="差异原因" placeholder="称重差异、标签错误、遗失等" />
              </>}
            </>}
          </div>
          <p className="modal-note">所有数量统一以克为库存基本单位；卷数仅用于采购和现场查看，流水保存后不可删除，只能用反向业务或盘点调整。</p>
          <button className="primary modal-submit" disabled={saving}>{saving ? "保存中…" : "保存库存单据"}</button>
        </form>
      </div>}
    </section>
  );
}

function Management({
  section,
  filtered,
  itemCosts,
  onDelete,
  onAction,
  onCost,
}: {
  section: "打印物品" | "耗材库存" | "订单" | "打印队列";
  filtered: {
    items: Item[];
    materials: Material[];
    orders: Order[];
    jobs: Job[];
  };
  itemCosts: ItemCost[];
  onDelete: (e: Entity, id: number) => void;
  onAction: (j: Job, a: string) => void;
  onCost: (m: Material) => void;
}) {
  const configs = {
    打印物品: {
      eyebrow: "ITEM LIBRARY",
      note: "按单件核算耗材、设备、电费、人工和管理分摊，支持报价与毛利控制",
      heads: [
        "SKU / 产品",
        "计划用料",
        "成本构成",
        "预计 / 实际单件",
        "建议售价",
        "操作",
      ],
      rows: filtered.items.map((x) => {
        const cost = itemCosts.find((value) => value.itemId === x.id);
        return [
          <span className="product-identity" key="product">
            <strong>{x.name}</strong>
            <small>
              {x.sku} · {x.category}
            </small>
          </span>,
          `${(cost?.plannedGrams ?? x.estimatedGrams).toFixed(1)} g / ${x.estimatedMinutes} 分钟`,
          <span className="cost-breakdown" key="cost">
            <small>材料 RM {(cost?.materialCost || 0).toFixed(2)}</small>
            <small>设备 RM {(cost?.machineCost || 0).toFixed(2)}</small>
            <small>电费 RM {(cost?.energyCost || 0).toFixed(2)}</small>
            <small>
              人工/分摊 RM{" "}
              {((cost?.laborCost || 0) + (cost?.overheadCost || 0)).toFixed(2)}
            </small>
          </span>,
          <span className="unit-cost-pair" key="unit">
            <strong>预计 RM {(cost?.estimatedUnitCost || 0).toFixed(2)}</strong>
            <small>
              {cost?.actualUnitCost == null
                ? "完成生产后显示实际成本"
                : `实际 RM ${cost.actualUnitCost.toFixed(2)} · ${cost.completedUnits}件`}
            </small>
          </span>,
          <span key="price">
            RM {(cost?.suggestedPrice || 0).toFixed(2)}
            <small className="table-hint">按50%目标毛利</small>
          </span>,
          <button
            className="danger-link"
            key="d"
            onClick={() => onDelete("item", x.id)}
          >
            删除
          </button>,
        ];
      }),
    },
    耗材库存: {
      eyebrow: "MATERIAL BATCHES",
      note: "按卷追踪物理余量、任务预占、真实可用量、库存价值和消耗进度",
      heads: [
        "耗材卷",
        "库存进度",
        "任务预占",
        "可用量",
        "库存价值",
        "预警",
        "操作",
      ],
      rows: filtered.materials.map((x) => [
        <span className="product-identity" key="material">
          <strong>
            {x.material} · {x.color}
          </strong>
          <small>
            {x.brand || "未填写品牌"} · RM {x.costPerKg || 0}/kg
          </small>
        </span>,
        <span className="stock-progress" key="stock">
          <b>
            {x.remainingGrams.toFixed(1)} / {x.initialGrams.toFixed(0)}g
          </b>
          <i>
            <span
              style={{
                width: `${Math.max(0, Math.min(100, 100 - x.usedPercent))}%`,
              }}
            />
          </i>
          <small>已使用 {x.usedPercent.toFixed(1)}%</small>
        </span>,
        `${x.reservedGrams.toFixed(1)} g`,
        <strong
          className={x.availableGrams <= x.lowStockGrams ? "stock-low" : ""}
          key="available"
        >
          {x.availableGrams.toFixed(1)} g
        </strong>,
        `RM ${x.stockValue.toFixed(2)}`,
        `${x.lowStockGrams} g`,
        <span className="row-actions" key="d">
          <button onClick={() => onCost(x)}>改成本</button>
          <button
            className="danger-link"
            onClick={() => onDelete("material", x.id)}
          >
            删除
          </button>
        </span>,
      ]),
    },
    订单: {
      eyebrow: "CUSTOMER ORDERS",
      note: "跟踪客户需求、交期和生产状态",
      heads: ["订单编号", "客户", "交付日期", "状态", "操作"],
      rows: filtered.orders.map((x) => [
        x.orderNo,
        x.customer,
        x.dueAt || "未设置",
        <span className="order-state blue" key="s">
          {x.status}
        </span>,
        <button
          className="danger-link"
          key="d"
          onClick={() => onDelete("order", x.id)}
        >
          删除
        </button>,
      ]),
    },
    打印队列: {
      eyebrow: "PRINT JOBS",
      note: "管理排队、开始、暂停、完成、失败与重打；完成时按 BOM 自动扣料",
      heads: [
        "任务编号",
        "打印物品",
        "打印机",
        "数量/优先级",
        "进度",
        "状态",
        "生产操作",
      ],
      rows: filtered.jobs.map((x) => [
        x.jobNo,
        x.itemName || "未关联",
        x.printerName,
        `${x.quantity} 件 / P${x.priority}`,
        `${x.progress}%`,
        <span
          className={`badge ${x.status === "排队" ? "waiting" : "printing"}`}
          key="s"
        >
          {x.status}
        </span>,
        <JobActions
          key="a"
          job={x}
          onAction={onAction}
          onDelete={() => onDelete("job", x.id)}
        />,
      ]),
    },
  } as const;
  const config = configs[section];
  return (
    <section className="panel management">
      <div className="management-hero">
        <small>{config.eyebrow}</small>
        <h2>{section}</h2>
        <p>{config.note}</p>
      </div>
      <DataTable heads={[...config.heads]} rows={[...config.rows]} />
      {config.rows.length === 0 && (
        <div className="empty-state">没有匹配的记录，请新建一条数据。</div>
      )}
    </section>
  );
}

type DetailData = {
  lines: {
    id: number;
    orderNo: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
  }[];
  bom: {
    id: number;
    itemName: string;
    material: string;
    color: string;
    gramsPerItem: number;
    wastePercent: number;
  }[];
  transactions: {
    id: number;
    material: string;
    color: string;
    type: string;
    grams: number;
    note: string;
    createdAt: string;
  }[];
  events: {
    id: number;
    jobNo: string;
    action: string;
    fromStatus: string;
    toStatus: string;
    note: string;
    createdAt: string;
  }[];
};

function ProductionDetails({
  data,
  toast,
  onWorkspaceChanged,
}: {
  data: WorkspaceData;
  toast: (m: string) => void;
  onWorkspaceChanged: () => Promise<void>;
}) {
  const [details, setDetails] = useState<DetailData>({
    lines: [],
    bom: [],
    transactions: [],
    events: [],
  });
  const [tab, setTab] = useState<
    "orderLine" | "bom" | "transaction" | "events"
  >("orderLine");
  const [busy, setBusy] = useState(false);
  async function load() {
    const response = await fetch("/api/details", { cache: "no-store" });
    const result = await response.json();
    if (response.ok) setDetails(result);
    else toast("明细读取失败");
  }
  useEffect(() => {
    fetch("/api/details", { cache: "no-store" })
      .then((r) => r.json().then((v) => ({ ok: r.ok, v })))
      .then(({ ok, v }) => {
        if (ok) setDetails(v);
      })
      .catch(() => undefined);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: tab, ...values }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) {
      toast(result.error || "保存失败");
      return;
    }
    event.currentTarget.reset();
    toast("生产明细已保存");
    await Promise.all([load(), onWorkspaceChanged()]);
  }
  async function remove(entity: "orderLine" | "bom", id: number) {
    const response = await fetch(`/api/details?entity=${entity}&id=${id}`, {
      method: "DELETE",
    });
    if (response.ok) {
      toast("明细已删除");
      await load();
    } else toast("删除失败");
  }
  return (
    <section className="details-layout">
      <div className="panel detail-entry">
        <div className="management-hero">
          <small>PRODUCTION DETAILS</small>
          <h2>业务明细</h2>
          <p>建立订单、物品配方与库存变动之间的可追溯关系</p>
        </div>
        <div className="detail-tabs">
          <button
            className={tab === "orderLine" ? "active" : ""}
            onClick={() => setTab("orderLine")}
          >
            订单行
          </button>
          <button
            className={tab === "bom" ? "active" : ""}
            onClick={() => setTab("bom")}
          >
            物品 BOM
          </button>
          <button
            className={tab === "transaction" ? "active" : ""}
            onClick={() => setTab("transaction")}
          >
            库存流水
          </button>
          <button
            className={tab === "events" ? "active" : ""}
            onClick={() => setTab("events")}
          >
            任务事件
          </button>
        </div>
        <form className="detail-form" onSubmit={submit}>
          {tab === "orderLine" && (
            <>
              <label>
                <span>客户订单</span>
                <select name="orderId" required>
                  <option value="">请选择</option>
                  {data.orders.map((x) => (
                    <option value={x.id} key={x.id}>
                      {x.orderNo} · {x.customer}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>打印物品</span>
                <select name="itemId" required>
                  <option value="">请选择</option>
                  {data.items.map((x) => (
                    <option value={x.id} key={x.id}>
                      {x.sku} · {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                name="quantity"
                label="订购数量"
                type="number"
                defaultValue="1"
              />
              <Field
                name="unitPrice"
                label="单价（RM）"
                type="number"
                defaultValue="0"
              />
            </>
          )}
          {tab === "bom" && (
            <>
              <label>
                <span>打印物品</span>
                <select name="itemId" required>
                  <option value="">请选择</option>
                  {data.items.map((x) => (
                    <option value={x.id} key={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>耗材批次</span>
                <select name="batchId" required>
                  <option value="">请选择</option>
                  {data.materials.map((x) => (
                    <option value={x.id} key={x.id}>
                      {x.material} {x.color} · {x.brand}
                    </option>
                  ))}
                </select>
              </label>
              <Field name="gramsPerItem" label="单件用料（g）" type="number" />
              <Field
                name="wastePercent"
                label="损耗率（%）"
                type="number"
                defaultValue="5"
              />
            </>
          )}
          {tab === "transaction" && (
            <>
              <label>
                <span>耗材批次</span>
                <select name="batchId" required>
                  <option value="">请选择</option>
                  {data.materials.map((x) => (
                    <option value={x.id} key={x.id}>
                      {x.material} {x.color} · 余 {x.remainingGrams}g
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>变动类型</span>
                <select name="type">
                  <option>入库</option>
                  <option>领用</option>
                  <option>退料</option>
                  <option>报废</option>
                </select>
              </label>
              <Field name="grams" label="变动克重（g）" type="number" />
              <Field
                name="note"
                label="备注"
                placeholder="采购入库、样件打印等"
              />
            </>
          )}
          {tab !== "events" && (
            <button className="primary detail-save" disabled={busy}>
              {busy ? "保存中…" : "保存明细"}
            </button>
          )}
        </form>
      </div>
      <div className="panel detail-history">
        <PanelHead
          eyebrow="TRACEABLE RECORDS"
          title={
            tab === "orderLine"
              ? "订单内容"
              : tab === "bom"
                ? "物品用料清单"
                : tab === "transaction"
                  ? "库存变动记录"
                  : "任务事件记录"
          }
          action="刷新 ↻"
          onClick={() => void load()}
        />
        {tab === "orderLine" ? (
          <DataTable
            heads={["订单", "物品", "数量", "单价", "操作"]}
            rows={details.lines.map((x) => [
              x.orderNo,
              x.itemName,
              String(x.quantity),
              `RM ${x.unitPrice.toFixed(2)}`,
              <button
                className="danger-link"
                key="d"
                onClick={() => remove("orderLine", x.id)}
              >
                删除
              </button>,
            ])}
          />
        ) : null}
        {tab === "bom" ? (
          <DataTable
            heads={["物品", "耗材", "单件克重", "损耗", "操作"]}
            rows={details.bom.map((x) => [
              x.itemName,
              `${x.material} ${x.color}`,
              `${x.gramsPerItem} g`,
              `${x.wastePercent}%`,
              <button
                className="danger-link"
                key="d"
                onClick={() => remove("bom", x.id)}
              >
                删除
              </button>,
            ])}
          />
        ) : null}
        {tab === "transaction" ? (
          <DataTable
            heads={["耗材", "类型", "变动", "备注", "时间"]}
            rows={details.transactions.map((x) => [
              `${x.material} ${x.color}`,
              x.type,
              `${x.grams > 0 ? "+" : ""}${x.grams} g`,
              x.note || "—",
              x.createdAt,
            ])}
          />
        ) : null}
        {tab === "events" ? (
          <DataTable
            heads={["任务", "操作", "状态变化", "备注", "时间"]}
            rows={details.events.map((x) => [
              x.jobNo,
              x.action,
              `${x.fromStatus} → ${x.toStatus}`,
              x.note || "—",
              x.createdAt,
            ])}
          />
        ) : null}
      </div>
    </section>
  );
}

function JobActions({
  job,
  onAction,
  onDelete,
}: {
  job: Job;
  onAction: (j: Job, a: string) => void;
  onDelete: () => void;
}) {
  const actions: Record<string, { key: string; label: string }[]> = {
    排队: [
      { key: "start", label: "开始" },
      { key: "cancel", label: "取消" },
    ],
    打印中: [
      { key: "pause", label: "暂停" },
      { key: "complete", label: "完成" },
      { key: "fail", label: "失败" },
    ],
    已暂停: [
      { key: "resume", label: "继续" },
      { key: "complete", label: "完成" },
      { key: "fail", label: "失败" },
    ],
    失败: [{ key: "retry", label: "重打" }],
    已取消: [{ key: "retry", label: "重新排队" }],
  };
  return (
    <div className="row-actions job-actions">
      {(actions[job.status] || []).map((a) => (
        <button key={a.key} onClick={() => onAction(job, a.key)}>
          {a.label}
        </button>
      ))}
      {!["打印中", "已暂停"].includes(job.status) && (
        <button className="danger-link" onClick={onDelete}>
          删除
        </button>
      )}
    </div>
  );
}

type SystemData = {
  health: {
    status: string;
    offlinePrinters: number;
    pendingCommands: number;
    failedCommands: number;
    lowStock: number;
    checkedAt: string;
  };
  alerts: Array<{ level: string; title: string; detail: string }>;
  audit: Array<{
    createdAt: string;
    source: string;
    action: string;
    detail: string;
  }>;
};
function SystemCenter({ toast }: { toast: (m: string) => void }) {
  const [data, setData] = useState<SystemData | null>(null);
  async function load() {
    const response = await fetch("/api/system", { cache: "no-store" });
    const result = await response.json();
    if (response.ok) setData(result);
    else toast(result.error || "系统检查失败");
  }
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, []);
  if (!data) return <div className="empty-state">正在执行系统健康检查…</div>;
  const h = data.health;
  return (
    <section>
      <div
        className={`health-banner ${h.status === "正常" ? "healthy" : "attention"}`}
      >
        <div>
          <small>SYSTEM HEALTH</small>
          <h2>{h.status}</h2>
          <p>
            最后检查：{new Date(h.checkedAt).toLocaleString("zh-CN")} · 每 30
            秒自动刷新
          </p>
        </div>
        <div>
          <strong>{h.offlinePrinters}</strong>
          <span>离线设备</span>
        </div>
        <div>
          <strong>{h.pendingCommands}</strong>
          <span>超时命令</span>
        </div>
        <div>
          <strong>{h.failedCommands}</strong>
          <span>失败命令</span>
        </div>
        <div>
          <strong>{h.lowStock}</strong>
          <span>库存告警</span>
        </div>
        <a className="primary" href="/api/system?format=backup">
          下载完整备份
        </a>
      </div>
      <div className="system-grid">
        <div className="panel">
          <PanelHead
            eyebrow="ACTIVE ALERTS"
            title="异常告警"
            action="刷新 ↻"
            onClick={() => void load()}
          />
          <div className="alert-list">
            {data.alerts.map((alert, index) => (
              <article className={alert.level} key={`${alert.title}-${index}`}>
                <i>{alert.level === "danger" ? "!" : "△"}</i>
                <div>
                  <strong>{alert.title}</strong>
                  <p>{alert.detail}</p>
                </div>
              </article>
            ))}
            {data.alerts.length === 0 && (
              <div className="empty-state">当前没有异常告警。</div>
            )}
          </div>
        </div>
        <div className="panel">
          <PanelHead eyebrow="RECOVERY" title="备份与恢复说明" />
          <div className="recovery-copy">
            <p>
              备份包含订单、任务、库存、BOM、文件元数据、设备状态、命令与审计记录。
            </p>
            <p>设备连接令牌哈希不会导出，避免备份文件泄露后被用于连接设备。</p>
            <p>
              请定期下载并保存到加密磁盘；恢复建议在正式迁移时由管理员离线执行。
            </p>
          </div>
        </div>
      </div>
      <div className="panel audit-panel">
        <PanelHead eyebrow="AUDIT TRAIL" title="关键操作审计 · 最近 100 条" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>来源</th>
                <th>操作</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              {data.audit.map((row, index) => (
                <tr key={`${row.createdAt}-${index}`}>
                  <td>{row.createdAt}</td>
                  <td>{row.source}</td>
                  <td>{row.action}</td>
                  <td>{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

type QualityRow = {
  name: string;
  total: number;
  completed: number;
  failed: number;
};
type AnalyticsData = {
  summary: {
    revenue: number;
    materialCost: number;
    machineCost: number;
    energyCost: number;
    laborCost: number;
    overheadCost: number;
    totalCost: number;
    grossProfit: number;
    margin: number;
    successRate: number;
    utilization: number;
    completed: number;
    reworks: number;
  };
  settings: {
    electricityRate: number;
    laborRate: number;
    laborMinutesPerJob: number;
    overheadPercent: number;
  };
  orders: Array<{
    orderNo: string;
    customer: string;
    status: string;
    revenue: number;
    jobs: number;
    completedJobs: number;
  }>;
  trends: Array<{ day: string; completed: number }>;
  byPrinter: QualityRow[];
  byItem: QualityRow[];
  reasons: Array<{ reason: string; count: number }>;
};
function Analytics({ toast }: { toast: (m: string) => void }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const load = () =>
    fetch("/api/analytics", { cache: "no-store" })
      .then((response) =>
        response.json().then((value) => ({ ok: response.ok, value })),
      )
      .then(({ ok, value }) =>
        ok ? setData(value) : toast(value.error || "分析数据读取失败"),
      )
      .catch(() => toast("分析数据读取失败"));
  useEffect(() => {
    void load();
  }, []);
  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/cost-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        Object.fromEntries(new FormData(event.currentTarget)),
      ),
    });
    if (response.ok) {
      toast("成本参数已更新");
      await load();
    } else toast("成本参数更新失败");
  }
  if (!data) return <div className="empty-state">正在计算经营数据…</div>;
  const s = data.summary,
    money = (value: number) => `RM ${value.toFixed(2)}`,
    max = Math.max(1, ...data.trends.map((x) => x.completed));
  return (
    <section>
      <div className="analytics-metrics">
        <Metric
          label="订单收入"
          value={money(s.revenue)}
          unit="累计报价"
          delta="订单明细汇总"
          accent="green"
        />
        <Metric
          label="生产总成本"
          value={money(s.totalCost)}
          unit="五项成本合计"
          delta={`材料 ${money(s.materialCost)}`}
          accent="orange"
        />
        <Metric
          label="预计毛利"
          value={money(s.grossProfit)}
          unit={`${s.margin.toFixed(1)}% 毛利率`}
          delta="收入减完整生产成本"
          accent="blue"
        />
        <Metric
          label="打印成功率"
          value={`${s.successRate.toFixed(1)}%`}
          unit={`${s.completed} 个完成任务`}
          delta={`设备利用率 ${s.utilization.toFixed(1)}%`}
          accent="red"
        />
      </div>
      <div className="analytics-grid">
        <div className="panel">
          <PanelHead eyebrow="7 DAY OUTPUT" title="近 7 日完成趋势" />
          <div className="trend-chart">
            {data.trends.map((x) => (
              <div key={x.day}>
                <span
                  style={{
                    height: `${Math.max(6, (x.completed / max) * 100)}%`,
                  }}
                  title={`${x.completed} 个任务`}
                />
                <b>{x.completed}</b>
                <small>{x.day.slice(5)}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <PanelHead eyebrow="COST STRUCTURE" title="完整成本结构" />
          <div className="cost-stack">
            <div>
              <span>材料成本</span>
              <b>{money(s.materialCost)}</b>
            </div>
            <div>
              <span>设备折旧/工时</span>
              <b>{money(s.machineCost)}</b>
            </div>
            <div>
              <span>电费</span>
              <b>{money(s.energyCost)}</b>
            </div>
            <div>
              <span>人工</span>
              <b>{money(s.laborCost)}</b>
            </div>
            <div>
              <span>管理损耗</span>
              <b>{money(s.overheadCost)}</b>
            </div>
            <div className="total">
              <span>合计</span>
              <b>{money(s.totalCost)}</b>
            </div>
          </div>
        </div>
      </div>
      <form className="panel cost-settings" onSubmit={saveSettings}>
        <PanelHead eyebrow="COST PARAMETERS" title="成本参数" />
        <div>
          <Field
            name="electricityRate"
            label="电价（RM/kWh）"
            type="number"
            defaultValue={String(data.settings.electricityRate || 0.8)}
          />
          <Field
            name="laborRate"
            label="人工时薪（RM/小时）"
            type="number"
            defaultValue={String(data.settings.laborRate || 0)}
          />
          <Field
            name="laborMinutesPerJob"
            label="每单人工分钟"
            type="number"
            defaultValue={String(data.settings.laborMinutesPerJob || 0)}
          />
          <Field
            name="overheadPercent"
            label="管理损耗（%）"
            type="number"
            defaultValue={String(data.settings.overheadPercent || 0)}
          />
          <button className="primary">保存成本参数</button>
        </div>
        <p>
          电费按设备默认功率 1000W ×
          实际打印时长计算；接入打印机后可继续细化每台设备功率。
        </p>
      </form>
      <div className="panel analytics-orders">
        <PanelHead eyebrow="ORDER PROFITABILITY" title="订单收入与生产进度" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>订单</th>
                <th>客户</th>
                <th>状态</th>
                <th>收入</th>
                <th>打印任务</th>
                <th>已完成</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((order) => (
                <tr key={order.orderNo}>
                  <td>{order.orderNo}</td>
                  <td>{order.customer}</td>
                  <td>
                    <span className="badge">{order.status}</span>
                  </td>
                  <td>{money(Number(order.revenue))}</td>
                  <td>{order.jobs}</td>
                  <td>{order.completedJobs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function QualityAnalytics({ toast }: { toast: (m: string) => void }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  useEffect(() => {
    fetch("/api/analytics", { cache: "no-store" })
      .then((r) => r.json().then((v) => ({ ok: r.ok, v })))
      .then(({ ok, v }) =>
        ok ? setData(v) : toast(v.error || "良率数据读取失败"),
      )
      .catch(() => toast("良率数据读取失败"));
  }, []);
  if (!data) return <div className="empty-state">正在计算良率数据…</div>;
  const quality = (row: QualityRow) =>
    row.total ? (row.completed / row.total) * 100 : 0;
  const table = (rows: QualityRow[], label: string) => (
    <div className="panel quality-panel">
      <PanelHead eyebrow="YIELD BREAKDOWN" title={label} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>总任务</th>
              <th>成功</th>
              <th>失败</th>
              <th>成功率</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td>{row.total}</td>
                <td>{row.completed}</td>
                <td>{row.failed}</td>
                <td>
                  <b
                    className={
                      quality(row) < 90 ? "quality-warn" : "quality-ok"
                    }
                  >
                    {quality(row).toFixed(1)}%
                  </b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
  return (
    <section>
      <div className="quality-head">
        <div>
          <small>QUALITY CONTROL</small>
          <h2>生产良率复盘</h2>
          <p>失败时必须填写原因；重打会计入返工次数。</p>
        </div>
        <div>
          <strong>{data.summary.successRate.toFixed(1)}%</strong>
          <span>总体成功率</span>
        </div>
        <div>
          <strong>{data.summary.reworks}</strong>
          <span>累计返工</span>
        </div>
        <a className="primary" href="/api/analytics?format=csv">
          导出 CSV
        </a>
      </div>
      <div className="quality-grid">
        {table(data.byPrinter, "按打印机")}
        {table(data.byItem, "按打印物品")}
      </div>
      <div className="panel">
        <PanelHead eyebrow="FAILURE PARETO" title="失败原因分布" />
        <div className="reason-list">
          {data.reasons.map((item, index) => (
            <div key={item.reason}>
              <b>{index + 1}</b>
              <span>{item.reason}</span>
              <i
                style={{
                  width: `${(item.count / Math.max(1, ...data.reasons.map((r) => r.count))) * 100}%`,
                }}
              />
              <strong>{item.count} 次</strong>
            </div>
          ))}
          {data.reasons.length === 0 && (
            <div className="empty-state">暂无失败记录。</div>
          )}
        </div>
      </div>
    </section>
  );
}

type SyncedSpool = {
  id: number;
  externalId: number;
  filamentName: string;
  vendor: string;
  material: string;
  colorHex: string;
  initialWeight: number | null;
  remainingWeight: number | null;
  usedWeight: number | null;
  location: string;
  lotNr: string;
  archived: boolean;
  lastUsed: string | null;
  lastSeenAt: string;
};
type SpoolPrinter = {
  id: number;
  name: string;
  connectionState: string;
  activeSpoolExternalId: number | null;
};
function SpoolmanInventory({ toast }: { toast: (m: string) => void }) {
  const dialogs = useDialogs();
  const [spools, setSpools] = useState<SyncedSpool[]>([]);
  const [printers, setPrinters] = useState<SpoolPrinter[]>([]);
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    const response = await fetch("/api/spools", { cache: "no-store" });
    const result = await response.json();
    setLoading(false);
    if (response.ok) {
      setSpools(result.spools);
      setPrinters(result.printers);
    } else toast(result.error || "耗材卷读取失败");
  }
  useEffect(() => {
    void load();
  }, []);
  async function mount(spool: SyncedSpool) {
    if (!printers.length) {
      toast("请先添加打印机");
      return;
    }
    const choice = await dialogs.prompt({title:`挂载耗材卷 #${spool.externalId}`,message:"选择要使用这卷耗材的打印机。",choices:printers.map(p=>({label:p.name,value:String(p.id),description:p.activeSpoolExternalId?`当前 #${p.activeSpoolExternalId}`:"未挂载耗材"})),confirmLabel:"确认挂载"});
    const printer = printers.find(p=>p.id===Number(choice));
    if (!printer) return;
    const response = await fetch("/api/spools", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        printerId: printer.id,
        spoolId: spool.externalId,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      toast(result.error || "挂载失败");
      return;
    }
    toast(`耗材卷 #${spool.externalId} 已挂载到 ${printer.name}`);
    await load();
  }
  const active = spools.filter((s) => !s.archived);
  const total = active.reduce((sum, s) => sum + (s.remainingWeight || 0), 0);
  return (
    <section>
      <div className="spool-summary">
        <div>
          <small>SPOOLMAN STATUS</small>
          <strong>{active.length}</strong>
          <span>可用耗材卷</span>
        </div>
        <div>
          <small>REMAINING</small>
          <strong>{Math.round(total)}g</strong>
          <span>同步剩余重量</span>
        </div>
        <div>
          <small>MOUNTED</small>
          <strong>
            {printers.filter((p) => p.activeSpoolExternalId).length}
          </strong>
          <span>已挂载打印机</span>
        </div>
      </div>
      <div className="panel">
        <PanelHead
          eyebrow="SPOOLMAN INVENTORY"
          title="耗材卷库存"
          action={loading ? "同步中…" : "刷新 ↻"}
          onClick={() => void load()}
        />
        <div className="spool-grid">
          {spools.map((spool) => {
            const capacity =
              spool.initialWeight ||
              (spool.remainingWeight || 0) + (spool.usedWeight || 0);
            const percent = capacity
              ? Math.max(
                  0,
                  Math.min(
                    100,
                    ((spool.remainingWeight || 0) / capacity) * 100,
                  ),
                )
              : 0;
            const mounted = printers.filter(
              (p) => p.activeSpoolExternalId === spool.externalId,
            );
            return (
              <article
                className={`spool-card ${spool.archived ? "archived" : ""}`}
                key={spool.id}
              >
                <div
                  className="spool-ring"
                  style={
                    {
                      "--spool-color": spool.colorHex
                        ? `#${spool.colorHex.replace("#", "")}`
                        : "#8c9b95",
                      "--spool-level": `${percent}%`,
                    } as React.CSSProperties
                  }
                >
                  <i />
                </div>
                <div>
                  <div className="spool-title">
                    <strong>
                      #{spool.externalId} ·{" "}
                      {spool.filamentName || spool.material || "未命名耗材"}
                    </strong>
                    <span>
                      {spool.archived
                        ? "已归档"
                        : percent < 20
                          ? "低库存"
                          : "可用"}
                    </span>
                  </div>
                  <p>
                    {spool.vendor || "未知厂商"} ·{" "}
                    {spool.material || "未知材质"} ·{" "}
                    {spool.location || "未设置位置"}
                  </p>
                  <div className="spool-weight">
                    <b>{Math.round(spool.remainingWeight || 0)}g</b>
                    <span>剩余 / {Math.round(capacity || 0)}g</span>
                  </div>
                  <div className="spool-bar">
                    <i style={{ width: `${percent}%` }} />
                  </div>
                  <small>
                    批次 {spool.lotNr || "--"}
                    {mounted.length
                      ? ` · 已挂载 ${mounted.map((p) => p.name).join("、")}`
                      : ""}
                  </small>
                  {!spool.archived && (
                    <button
                      className="spool-mount"
                      onClick={() => mount(spool)}
                    >
                      挂载到打印机
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {!loading && spools.length === 0 && (
            <div className="empty-state">
              尚未收到 Spoolman 数据。请在本地代理设置 SPOOLMAN_URL。
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

type PrintFile = {
  id: number;
  itemId: number | null;
  itemName: string | null;
  filename: string;
  kind: string;
  version: string;
  sizeBytes: number;
  contentType: string;
  printerProfile: string;
  layerHeight: number | null;
  infillPercent: number | null;
  estimatedMinutes: number | null;
  notes: string;
  createdAt: string;
};
function FileAssets({
  data,
  toast,
}: {
  data: WorkspaceData;
  toast: (m: string) => void;
}) {
  const dialogs = useDialogs();
  const [files, setFiles] = useState<PrintFile[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [uploading, setUploading] = useState(false);
  async function load() {
    const response = await fetch("/api/files", { cache: "no-store" });
    const result = await response.json();
    if (response.ok) setFiles(result.files);
    else toast(result.error || "文件读取失败");
  }
  useEffect(() => {
    fetch("/api/files", { cache: "no-store" })
      .then((r) => r.json().then((v) => ({ ok: r.ok, v })))
      .then(({ ok, v }) => {
        if (ok) setFiles(v.files);
      })
      .catch(() => undefined);
    fetch("/api/printers", { cache: "no-store" })
      .then((r) => r.json().then((v) => ({ ok: r.ok, v })))
      .then(({ ok, v }) => {
        if (ok) setPrinters(v.printers);
      })
      .catch(() => undefined);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploading(true);
    const response = await fetch("/api/files", {
      method: "POST",
      body: new FormData(event.currentTarget),
    });
    const result = await response.json();
    setUploading(false);
    if (!response.ok) {
      toast(result.error || "上传失败");
      return;
    }
    event.currentTarget.reset();
    toast("文件已上传");
    await load();
  }
  async function remove(id: number) {
    if (!await dialogs.confirm({title:"删除打印文件？",message:"文件内容和相关元数据将同时删除，此操作无法撤销。",confirmLabel:"删除文件",danger:true})) return;
    const response = await fetch(`/api/files?id=${id}`, { method: "DELETE" });
    if (response.ok) {
      toast("文件已删除");
      await load();
    } else toast("删除失败");
  }
  async function dispatch(file: PrintFile) {
    if (!printers.length) {
      toast("请先在设备管理中添加并连接打印机");
      return;
    }
    const choice = await dialogs.prompt({title:"选择接收打印机",message:file.filename,choices:printers.map(p=>({label:p.name,value:String(p.id),description:p.connectionState})),confirmLabel:"加入打印队列"});
    const printer = printers.find(p=>p.id===Number(choice));
    if (!printer) return;
    const response = await fetch("/api/printers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: printer.id,
        action: "command",
        command: "start",
        fileId: file.id,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      toast(result.error || "下发失败");
      return;
    }
    toast(`已将 ${file.filename} 加入 ${printer.name} 的启动队列`);
  }
  const size = (bytes: number) =>
    bytes > 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.ceil(bytes / 1024)} KB`;
  return (
    <section className="file-layout">
      <div className="panel file-upload">
        <div className="management-hero">
          <small>MODEL REPOSITORY</small>
          <h2>上传打印文件</h2>
          <p>支持 STL、3MF、G-code 和产品预览图片，单文件最大 100MB</p>
        </div>
        <form className="detail-form" onSubmit={submit}>
          <label className="file-picker">
            <span>选择文件</span>
            <input
              type="file"
              name="file"
              accept=".stl,.3mf,.gcode,.gco,.png,.jpg,.jpeg,.webp"
              required
            />
          </label>
          <label>
            <span>关联物品</span>
            <select name="itemId">
              <option value="">暂不关联</option>
              {data.items.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.sku} · {x.name}
                </option>
              ))}
            </select>
          </label>
          <Field name="version" label="版本" defaultValue="v1" />
          <Field
            name="printerProfile"
            label="打印机配置"
            placeholder="例如：Bambu X1C 0.4mm"
          />
          <Field name="layerHeight" label="层高（mm）" type="number" />
          <Field name="infillPercent" label="填充率（%）" type="number" />
          <Field
            name="estimatedMinutes"
            label="预计时长（分钟）"
            type="number"
          />
          <Field
            name="notes"
            label="备注"
            placeholder="切片器、喷嘴或变更说明"
          />
          <button className="primary detail-save" disabled={uploading}>
            {uploading ? "上传中…" : "上传并保存"}
          </button>
        </form>
      </div>
      <div className="panel file-library">
        <PanelHead
          eyebrow="FILES & VERSIONS"
          title="文件库"
          action="刷新 ↻"
          onClick={() => void load()}
        />
        <div className="file-cards">
          {files.map((file) => (
            <article className="file-card" key={file.id}>
              <div
                className={`file-kind ${file.kind === "图片" ? "image" : ""}`}
              >
                {file.kind === "图片"
                  ? "▧"
                  : file.kind === "G-code"
                    ? "G"
                    : "3D"}
              </div>
              <div className="file-info">
                <div>
                  <strong>{file.filename}</strong>
                  <span>
                    {file.kind} · {file.version}
                  </span>
                </div>
                <p>
                  {file.itemName || "未关联物品"}　·　{size(file.sizeBytes)}
                </p>
                <small>
                  {file.printerProfile || "未设置打印机配置"}
                  {file.layerHeight ? ` · ${file.layerHeight}mm` : ""}
                  {file.infillPercent ? ` · 填充 ${file.infillPercent}%` : ""}
                </small>
              </div>
              <div className="file-actions">
                {["G-code", "3MF"].includes(file.kind) && (
                  <button onClick={() => dispatch(file)}>发送并打印</button>
                )}
                <a href={`/api/files?download=${file.id}`}>下载</a>
                <button onClick={() => remove(file.id)}>删除</button>
              </div>
            </article>
          ))}
          {files.length === 0 && (
            <div className="empty-state">
              还没有文件，先上传一个模型或 G-code。
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

type AmsSlot = {
  id: number;
  amsUnit: number;
  trayIndex: number;
  material: string;
  colorHex: string;
  remainingPercent: number | null;
  active: boolean;
};
type Printer = {
  id: number;
  name: string;
  model: string;
  technology: string;
  location: string;
  nozzleDiameter: number;
  buildVolume: string;
  status: string;
  totalHours: number;
  hourlyRate: number;
  powerWatts: number;
  maintenanceDueAt: string | null;
  notes: string;
  connectorType: string;
  connectionState: string;
  lastSeenAt: string | null;
  nozzleTemp: number | null;
  bedTemp: number | null;
  currentFile: string | null;
  remoteProgress: number | null;
  amsSlots?: AmsSlot[];
};
const bambuPresets: Record<string, { volume: string; watts: number }> = {
  "Bambu Lab X1C": { volume: "256 × 256 × 256 mm", watts: 1000 },
  "Bambu Lab X1E": { volume: "256 × 256 × 256 mm", watts: 1000 },
  "Bambu Lab X2D": { volume: "256 × 256 × 260 mm", watts: 1000 },
  "Bambu Lab P1S": { volume: "256 × 256 × 256 mm", watts: 1000 },
  "Bambu Lab P1P": { volume: "256 × 256 × 256 mm", watts: 1000 },
  "Bambu Lab P2S": { volume: "256 × 256 × 256 mm", watts: 1000 },
  "Bambu Lab A1": { volume: "256 × 256 × 256 mm", watts: 1300 },
  "Bambu Lab A1 mini": { volume: "180 × 180 × 180 mm", watts: 350 },
  "Bambu Lab H2D": { volume: "325 × 320 × 325 mm", watts: 2200 },
  "Bambu Lab H2S": { volume: "340 × 320 × 340 mm", watts: 2000 },
};

type ExternalPrintJob = {
  id: number;
  filename: string;
  printerName: string;
  material: string;
  amsUnit: number | null;
  trayIndex: number | null;
  quantity: number;
  estimatedGrams: number;
  consumedGrams: number;
  status: string;
  result: string;
  itemName: string | null;
  orderNo: string | null;
  batchMaterial: string | null;
  batchColor: string | null;
  startedAt: string;
};

function ExternalPrintJobs({
  data,
  toast,
  onChanged,
}: {
  data: WorkspaceData;
  toast: (m: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [jobs, setJobs] = useState<ExternalPrintJob[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  async function load() {
    const response = await fetch("/api/external-jobs", { cache: "no-store" });
    const result = await response.json();
    if (response.ok) setJobs(result.jobs || []);
    else toast(result.error || "外部任务读取失败");
  }
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(timer);
  }, []);
  async function claim(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault();
    setBusy(id);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/external-jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...values }),
    });
    const result = await response.json();
    setBusy(null);
    if (!response.ok) return toast(result.error || "任务认领失败");
    toast("外部打印任务已关联，耗材将自动结算");
    await Promise.all([load(), onChanged()]);
  }
  return (
    <section className="external-jobs">
      <div className="panel management-hero">
        <small>BAMBU STUDIO INBOX</small>
        <h2>外部打印任务</h2>
        <p>
          自动接收由 Bambu Studio
          发起的打印；首次选择产品、订单和耗材卷，完成后自动扣料并计入实际成本。
        </p>
      </div>
      <div className="external-job-grid">
        {jobs.map((job) => (
          <article className="panel external-job-card" key={job.id}>
            <header>
              <div>
                <small>
                  {job.printerName} ·{" "}
                  {job.amsUnit == null
                    ? "外置料架"
                    : `AMS ${job.amsUnit + 1}-${(job.trayIndex || 0) + 1}`}
                </small>
                <h3>{job.filename || "未命名打印文件"}</h3>
              </div>
              <b className={job.status === "待认领" ? "waiting" : "printing"}>
                {job.status}
              </b>
            </header>
            <dl>
              <div>
                <dt>识别材料</dt>
                <dd>{job.material || "待识别"}</dd>
              </div>
              <div>
                <dt>任务结果</dt>
                <dd>{job.result || "打印进行中"}</dd>
              </div>
              <div>
                <dt>预计 / 消耗</dt>
                <dd>
                  {job.estimatedGrams || 0}g / {job.consumedGrams || 0}g
                </dd>
              </div>
              <div>
                <dt>开始时间</dt>
                <dd>{new Date(job.startedAt).toLocaleString("zh-CN")}</dd>
              </div>
            </dl>
            {job.itemName ? (
              <div className="claimed-summary">
                <strong>{job.itemName}</strong>
                <span>
                  {job.orderNo || "未关联订单"} · {job.batchMaterial}{" "}
                  {job.batchColor}
                </span>
              </div>
            ) : (
              <form onSubmit={(event) => claim(event, job.id)}>
                <label>
                  <span>对应产品</span>
                  <select name="itemId" required>
                    <option value="">请选择</option>
                    {data.items.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.sku} · {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>客户订单</span>
                  <select name="orderId">
                    <option value="">不关联</option>
                    {data.orders.map((order) => (
                      <option value={order.id} key={order.id}>
                        {order.orderNo} · {order.customer}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>实际耗材卷</span>
                  <select name="batchId" required>
                    <option value="">请选择</option>
                    {data.materials.map((material) => (
                      <option value={material.id} key={material.id}>
                        {material.material} {material.color} · 可用{" "}
                        {material.availableGrams.toFixed(1)}g
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>本板数量</span>
                  <input
                    name="quantity"
                    type="number"
                    min="1"
                    defaultValue="1"
                  />
                </label>
                <label>
                  <span>切片总克重</span>
                  <input
                    name="estimatedGrams"
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="从 Bambu Studio 填入"
                  />
                </label>
                <button className="primary" disabled={busy === job.id}>
                  {busy === job.id ? "保存中…" : "认领并纳入成本"}
                </button>
              </form>
            )}
          </article>
        ))}
        {jobs.length === 0 && (
          <div className="panel empty-state">
            Agent 连接后，在 Bambu Studio 发起打印，任务会自动出现在这里。
          </div>
        )}
      </div>
    </section>
  );
}

function PrinterManager({ toast }: { toast: (m: string) => void }) {
  const dialogs = useDialogs();
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [saving, setSaving] = useState(false);
  async function load() {
    const response = await fetch("/api/printers", { cache: "no-store" });
    const result = await response.json();
    if (response.ok) setPrinters(result.printers);
    else toast("设备读取失败");
  }
  useEffect(() => {
    fetch("/api/printers", { cache: "no-store" })
      .then((r) => r.json().then((v) => ({ ok: r.ok, v })))
      .then(({ ok, v }) => {
        if (ok) setPrinters(v.printers);
      })
      .catch(() => undefined);
    const timer = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(timer);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/printers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      toast(result.error || "保存失败");
      return;
    }
    event.currentTarget.reset();
    toast("设备档案已保存");
    await load();
  }
  async function status(printer: Printer, next: string) {
    const response = await fetch("/api/printers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: printer.id, status: next }),
    });
    if (response.ok) {
      toast(`设备已设为${next}`);
      await load();
    } else toast("状态更新失败");
  }
  async function rate(printer: Printer) {
    const hourlyRate = await dialogs.prompt({title:"设置设备小时成本",message:`${printer.name} · RM/小时`,defaultValue:String(printer.hourlyRate||0),inputType:"number",confirmLabel:"下一步"});
    if (hourlyRate === null) return;
    const powerWatts = await dialogs.prompt({title:"设置设备估算功率",message:`${printer.name} · 瓦特（W）`,defaultValue:String(printer.powerWatts||1000),inputType:"number",confirmLabel:"保存参数"});
    if (powerWatts === null) return;
    const hourly = Number(hourlyRate);
    const watts = Number(powerWatts);
    if (
      !Number.isFinite(hourly) ||
      hourly < 0 ||
      !Number.isFinite(watts) ||
      watts < 0
    ) {
      toast("成本与功率必须是大于或等于 0 的数字");
      return;
    }
    const response = await fetch("/api/printers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: printer.id,
        hourlyRate: hourly,
        powerWatts: watts,
      }),
    });
    if (response.ok) {
      toast("设备成本参数已更新");
      await load();
    } else toast("成本更新失败");
  }
  async function connect(printer: Printer) {
    const connectorType = await dialogs.prompt({title:"选择打印机连接方式",message:`为 ${printer.name} 生成一次性代理令牌。`,defaultValue:printer.connectorType==="manual"?"bambu_lan":printer.connectorType,choices:[{label:"Bambu LAN",value:"bambu_lan",description:"Bambu Lab 局域网模式"},{label:"Moonraker",value:"moonraker",description:"Klipper 打印机"},{label:"OctoPrint",value:"octoprint",description:"OctoPrint API"}],confirmLabel:"生成令牌"});
    if (!connectorType) return;
    const response = await fetch("/api/printers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: printer.id,
        action: "rotateToken",
        connectorType,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      toast(result.error || "生成令牌失败");
      return;
    }
    await navigator.clipboard.writeText(result.token);
    await dialogs.alert({title:"代理令牌已复制",message:`请立即安全保存，关闭后将无法再次查看：\n${result.token}${connectorType==="bambu_lan"?"\nBambu LAN 还需在本地 Agent 设置主机、序列号和访问码。":""}`,confirmLabel:"我已保存"});
    await load();
  }
  async function command(
    printer: Printer,
    name: "pause" | "resume" | "cancel",
  ) {
    const labels = { pause: "暂停", resume: "继续", cancel: "取消" };
    if (
      name === "cancel" &&
      !await dialogs.confirm({title:"取消当前打印？",message:`${printer.name} 将停止当前任务，该操作可能产生报废耗材。`,confirmLabel:"确认取消",danger:true})
    )
      return;
    const response = await fetch("/api/printers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: printer.id,
        action: "command",
        command: name,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      toast(result.error || "命令下发失败");
      return;
    }
    toast(`${labels[name]}命令已进入安全队列`);
  }
  async function remove(id: number) {
    if (!await dialogs.confirm({title:"删除设备档案？",message:"设备历史记录仍会保留，但该设备将不能继续接收命令。",confirmLabel:"删除设备",danger:true})) return;
    const response = await fetch(`/api/printers?id=${id}`, {
      method: "DELETE",
    });
    if (response.ok) {
      toast("设备已删除");
      await load();
    } else toast("删除失败");
  }
  return (
    <section className="printer-layout">
      <div className="panel printer-entry">
        <div className="management-hero">
          <small>PRINTER REGISTRY</small>
          <h2>添加打印机</h2>
          <p>本地代理主动连接云端，无需开放工作室路由器端口</p>
        </div>
        <form className="detail-form" onSubmit={submit}>
          <Field name="name" label="设备名称" placeholder="打印机 01" />
          <label>
            <span>品牌型号</span>
            <select
              name="model"
              defaultValue="Bambu Lab X1C"
              onChange={(event) => {
                const preset = bambuPresets[event.currentTarget.value],
                  form = event.currentTarget.form;
                if (!preset || !form) return;
                const volume = form.elements.namedItem(
                    "buildVolume",
                  ) as HTMLInputElement | null,
                  power = form.elements.namedItem(
                    "powerWatts",
                  ) as HTMLInputElement | null;
                if (volume) volume.value = preset.volume;
                if (power) power.value = String(preset.watts);
              }}
            >
              <optgroup label="X 系列">
                <option>Bambu Lab X1C</option>
                <option>Bambu Lab X1E</option>
                <option>Bambu Lab X2D</option>
              </optgroup>
              <optgroup label="P 系列">
                <option>Bambu Lab P1S</option>
                <option>Bambu Lab P1P</option>
                <option>Bambu Lab P2S</option>
              </optgroup>
              <optgroup label="A 系列">
                <option>Bambu Lab A1</option>
                <option>Bambu Lab A1 mini</option>
              </optgroup>
              <optgroup label="H 系列">
                <option>Bambu Lab H2D</option>
                <option>Bambu Lab H2S</option>
              </optgroup>
            </select>
          </label>
          <label>
            <span>打印技术</span>
            <select name="technology">
              <option>FDM</option>
              <option>SLA</option>
              <option>SLS</option>
            </select>
          </label>
          <Field name="location" label="摆放位置" placeholder="工作室 A 区" />
          <Field
            name="nozzleDiameter"
            label="喷嘴直径（mm）"
            type="number"
            defaultValue="0.4"
          />
          <Field
            name="buildVolume"
            label="成型尺寸"
            placeholder="256 × 256 × 256 mm"
            defaultValue="256 × 256 × 256 mm"
          />
          <Field
            name="totalHours"
            label="累计工时"
            type="number"
            defaultValue="0"
          />
          <Field
            name="hourlyRate"
            label="设备成本（RM/小时）"
            type="number"
            defaultValue="0"
          />
          <Field
            name="powerWatts"
            label="估算功率（W）"
            type="number"
            defaultValue="1000"
          />
          <Field name="maintenanceDueAt" label="下次保养日期" type="date" />
          <Field
            name="notes"
            label="设备备注"
            placeholder="耗材槽、改装和维护说明"
          />
          <button className="primary detail-save" disabled={saving}>
            {saving ? "保存中…" : "保存设备"}
          </button>
        </form>
      </div>
      <div className="panel printer-list">
        <PanelHead
          eyebrow="WORKSHOP FLEET"
          title={`设备列表 · ${printers.length} 台`}
          action="刷新 ↻"
          onClick={() => void load()}
        />
        <div className="printer-cards">
          {printers.map((p) => (
            <article className="printer-card" key={p.id}>
              <div className="printer-visual">
                ▣
                <i
                  className={
                    p.connectionState === "未连接"
                      ? ""
                      : p.status === "维护中"
                        ? "maintain"
                        : "online"
                  }
                />
              </div>
              <div className="printer-copy">
                <div>
                  <strong>{p.name}</strong>
                  <span>{p.status}</span>
                  <span>
                    {p.connectorType} · {p.connectionState}
                  </span>
                </div>
                <p>
                  {p.model || "未填写型号"} · {p.technology} ·{" "}
                  {p.nozzleDiameter}mm 喷嘴
                </p>
                <small>
                  {p.location || "未设置位置"}　|　累计 {p.totalHours}h · RM
                  {p.hourlyRate || 0}/h · {p.powerWatts || 1000}W
                  {p.nozzleTemp !== null
                    ? `　|　喷嘴 ${p.nozzleTemp.toFixed(1)}℃ / 热床 ${(p.bedTemp || 0).toFixed(1)}℃`
                    : ""}
                </small>
                {p.currentFile && (
                  <em>
                    {p.currentFile} · {Math.round(p.remoteProgress || 0)}%
                  </em>
                )}
                {p.lastSeenAt && (
                  <em>
                    最后上报：{new Date(p.lastSeenAt).toLocaleString("zh-CN")}
                  </em>
                )}
              </div>
              <div className="printer-actions">
                <button onClick={() => rate(p)}>成本设置</button>
                <button onClick={() => connect(p)}>连接代理</button>
                {p.connectionState !== "未连接" && (
                  <>
                    <button onClick={() => command(p, "pause")}>暂停</button>
                    <button onClick={() => command(p, "resume")}>继续</button>
                    <button
                      className="danger-link"
                      onClick={() => command(p, "cancel")}
                    >
                      取消打印
                    </button>
                  </>
                )}
                <button onClick={() => status(p, "维护中")}>维护</button>
                <button onClick={() => status(p, "停用")}>停用</button>
                <button className="danger-link" onClick={() => remove(p.id)}>
                  删除
                </button>
              </div>
            </article>
          ))}
          {printers.length === 0 && (
            <div className="empty-state">还没有设备档案，请先添加打印机。</div>
          )}
        </div>
      </div>
    </section>
  );
}

function CreateModal({
  entity,
  data,
  onClose,
  onSaved,
}: {
  entity: Entity;
  data: WorkspaceData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedOrderId,setSelectedOrderId]=useState("");
  const [selectedItemId,setSelectedItemId]=useState("");
  const [selectedPrinterId,setSelectedPrinterId]=useState("");
  const [jobQuantity,setJobQuantity]=useState(1);
  const orderItemIds=selectedOrderId?new Set(data.orderLines.filter(line=>line.orderId===Number(selectedOrderId)).map(line=>line.itemId)):null;
  const availableItems=orderItemIds?data.items.filter(item=>orderItemIds.has(item.id)):data.items;
  const selectedItem=data.items.find(item=>item.id===Number(selectedItemId));
  const selectedPrinter=data.printers.find(printer=>printer.id===Number(selectedPrinterId));
  const compatibleFiles=data.files.filter(file=>(!file.itemId||file.itemId===Number(selectedItemId))&&(!selectedPrinter||selectedPrinter.connectorType==="bambu_lan"||file.kind==="G-code"));
  const requirements=data.itemMaterialRequirements.filter(row=>row.itemId===Number(selectedItemId)).map(row=>{const material=data.materials.find(item=>item.id===row.batchId);const needed=row.gramsPerItem*jobQuantity*(1+row.wastePercent/100);return{...row,material,needed,ready:Number(material?.availableGrams||0)>=needed}});
  const titles = {
    item: "打印物品",
    material: "耗材批次",
    order: "客户订单",
    job: "打印任务",
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, ...values }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(result.error || "保存失败");
      return;
    }
    onSaved();
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form className="record-modal" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <small>NEW RECORD</small>
            <h2>新建{titles[entity]}</h2>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="form-grid">
          {entity === "item" && (
            <>
              <Field name="sku" label="SKU" placeholder="ITEM-004" />
              <Field
                name="name"
                label="物品名称"
                placeholder="例如：传感器支架"
              />
              <Field name="category" label="分类" placeholder="机械零件" />
              <Field
                name="estimatedGrams"
                label="预计用料（g）"
                type="number"
              />
              <Field
                name="estimatedMinutes"
                label="预计工时（分钟）"
                type="number"
              />
            </>
          )}
          {entity === "material" && (
            <>
              <Field name="material" label="材料类型" placeholder="PLA" />
              <Field name="color" label="颜色" placeholder="哑光白" />
              <Field name="brand" label="品牌" placeholder="eSUN" />
              <Field
                name="initialGrams"
                label="初始重量（g）"
                type="number"
                defaultValue="1000"
              />
              <Field
                name="remainingGrams"
                label="当前余量（g）"
                type="number"
                defaultValue="1000"
              />
              <Field
                name="lowStockGrams"
                label="预警线（g）"
                type="number"
                defaultValue="200"
              />
              <Field
                name="costPerKg"
                label="采购成本（RM/kg）"
                type="number"
                defaultValue="0"
              />
            </>
          )}
          {entity === "order" && (
            <>
              <Field name="orderNo" label="订单编号" placeholder="ORD-0271" />
              <Field
                name="customer"
                label="客户名称"
                placeholder="客户或公司"
              />
              <Field name="dueAt" label="交付日期" type="date" />
              <label>
                <span>订单状态</span>
                <select name="status">
                  <option>待确认</option>
                  <option>待打印</option>
                  <option>生产中</option>
                  <option>已完成</option>
                </select>
              </label>
            </>
          )}
          {entity === "job" && (
            <>
              <Field name="jobNo" label="任务编号" placeholder="JOB-045" />
              <label>
                <span>关联打印机</span>
                <select name="printerId" required value={selectedPrinterId} onChange={event=>setSelectedPrinterId(event.target.value)}>
                  <option value="" disabled>{data.printers.length?"请选择打印机":"请先到设备管理添加打印机"}</option>
                  {data.printers.filter(x=>x.status!=="停用").map(x=><option key={x.id} value={x.id}>{x.name}{x.model?` · ${x.model}`:""} · {x.status}</option>)}
                </select>
              </label>
              <label>
                <span>关联订单</span>
                <select name="orderId" value={selectedOrderId} onChange={event=>{const value=event.target.value;setSelectedOrderId(value);if(value&&!data.orderLines.some(line=>line.orderId===Number(value)&&line.itemId===Number(selectedItemId)))setSelectedItemId("")}}>
                  <option value="">暂不关联</option>
                  {data.orders.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.orderNo} · {x.customer} · {x.status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>打印物品</span>
                <select name="itemId" value={selectedItemId} onChange={event=>setSelectedItemId(event.target.value)}>
                  <option value="">暂不关联</option>
                  {availableItems.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.sku} · {x.name} · 预计 {x.estimatedGrams}g
                    </option>
                  ))}
                </select>
              </label>
              <label><span>打印文件</span><select name="fileId" defaultValue=""><option value="">稍后选择</option>{compatibleFiles.map(file=><option key={file.id} value={file.id}>{file.filename} · {file.kind} · {file.version}</option>)}</select></label>
              <label><span>打印数量</span><input name="quantity" type="number" min="1" value={jobQuantity} onChange={event=>setJobQuantity(Math.max(1,Number(event.target.value)||1))}/></label>
              <label>
                <span>优先级</span>
                <select name="priority" defaultValue="3">
                  <option value="1">P1 · 紧急</option>
                  <option value="2">P2 · 高</option>
                  <option value="3">P3 · 普通</option>
                  <option value="4">P4 · 低</option>
                </select>
              </label>
              {selectedItem&&<div className="job-link-summary"><div><small>预计生产</small><strong>{selectedItem.estimatedGrams*jobQuantity}g · {selectedItem.estimatedMinutes*jobQuantity} 分钟</strong></div><div><small>计划设备</small><strong>{selectedPrinter?`${selectedPrinter.name} · ${selectedPrinter.status}`:"请选择打印机"}</strong></div></div>}
              {selectedItem&&<div className="job-material-check"><small>物料可用性</small>{requirements.length?requirements.map(row=><div className={row.ready?"ready":"short"} key={row.batchId}><span>{row.material?`${row.material.material} ${row.material.color}`:`批次 #${row.batchId}`}</span><strong>需要 {row.needed.toFixed(1)}g · 可用 {Number(row.material?.availableGrams||0).toFixed(1)}g</strong><b>{row.ready?"充足":"不足"}</b></div>):<p>该物品尚未配置 BOM，任务可创建但无法自动预留耗材。</p>}</div>}
            </>
          )}
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={saving}>
            {saving ? "保存中…" : "保存记录"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  name,
  label,
  placeholder,
  type = "text",
  defaultValue,
}: {
  name: string;
  label: string;
  placeholder?: string;
  type?: string;
  defaultValue?: string;
}) {
  const optional = [
    "category",
    "brand",
    "note",
    "notes",
    "printerProfile",
    "layerHeight",
    "infillPercent",
    "estimatedMinutes",
    "model",
    "location",
    "buildVolume",
    "totalHours",
    "hourlyRate",
    "costPerKg",
    "maintenanceDueAt",
  ].includes(name);
  return (
    <label>
      <span>{label}</span>
      <input
        name={name}
        type={type}
        step={type === "number" ? "any" : undefined}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required={!optional}
      />
    </label>
  );
}
function DataTable({
  heads,
  rows,
}: {
  heads: string[];
  rows: (string | React.ReactNode)[][];
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Metric({
  label,
  value,
  unit,
  delta,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  delta: string;
  accent: string;
}) {
  return (
    <article className={`metric ${accent}`}>
      <div>
        <p>{label}</p>
        <strong>
          {value}
          <small>{unit}</small>
        </strong>
        <span>{delta}</span>
      </div>
      <div className="spark">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
    </article>
  );
}
function PanelHead({
  eyebrow,
  title,
  action,
  onClick,
}: {
  eyebrow: string;
  title: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="panel-head">
      <div>
        <small>{eyebrow}</small>
        <h2>{title}</h2>
      </div>
      <button onClick={onClick}>{action}</button>
    </div>
  );
}
