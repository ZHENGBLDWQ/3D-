"use client";

import { CSSProperties, FormEvent, useEffect, useState } from "react";

type Material = {
  id:number; sku:string; material:string; color:string; brand:string; specification:string;
  spoolWeightGrams:number; remainingGrams:number; lowStockGrams:number; costPerKg:number;
  warehouse:string; location:string; availableGrams:number; occupiedGrams:number;
  printerOccupiedGrams:number; taskOccupiedGrams:number; inTransitGrams:number;
  usage3Days:number; usage15Days:number; usage30Days:number;
};
type Allocation = { id:number; batchId:number; sku:string; material:string; color:string; brand:string; amsUnit:number|null; trayIndex:number|null; allocatedGrams:number; remainingGrams:number; assignedAt:string };
type Printer = {
  id:number; name:string; model:string; location:string; status:string; connectionState:string;
  currentFile:string|null; remoteProgress:number|null; nozzleTemp:number|null; bedTemp:number|null;
  allocations:Allocation[];
  amsSlots:Array<{amsUnit:number;trayIndex:number;material:string;colorHex:string;remainingPercent:number|null;active:boolean}>;
};
type Transit = { id:number; batchId:number; sku:string; material:string; color:string; grams:number; supplier:string; purchaseNo:string; eta:string|null; status:string; operator:string; createdAt:string };
type Inventory = {
  products:Material[]; printers:Printer[]; transit:Transit[];
  summary:{skuCount:number;totalGrams:number;stockValue:number;lowStockCount:number;monthlyUsageGrams:number;monthlyWasteGrams:number};
};
type Dialog = "create"|"movement"|"stocktake"|"transferToPrinter"|"createTransit"|"returnFromPrinter"|null;

function Field({ name, label, type="text", placeholder="", defaultValue }: {name:string;label:string;type?:string;placeholder?:string;defaultValue?:string|number}) {
  return <label><span>{label}</span><input name={name} type={type} placeholder={placeholder} defaultValue={defaultValue} required={name === "grams" || name === "countedGrams"} /></label>;
}

function swatch(color:string) {
  const key=color.toLowerCase();
  const colors:Record<string,string>={"白":"#f5f4ef",white:"#f5f4ef","黑":"#25292b",black:"#25292b","灰":"#8b9493",gray:"#8b9493","红":"#e4554e",red:"#e4554e","蓝":"#3972d7",blue:"#3972d7","黄":"#efcf3e",yellow:"#efcf3e","绿":"#49a96f",green:"#49a96f","橙":"#ee873a",orange:"#ee873a","紫":"#7559bb",purple:"#7559bb","粉":"#eb7ba5",pink:"#eb7ba5"};
  return Object.entries(colors).find(([name])=>key.includes(name))?.[1]||"#aab6b1";
}

function Spool({ color, percent=100 }: {color:string;percent?:number}) {
  return <span className="stock-product-spool" style={{"--spool-color":swatch(color),"--spool-level":`${Math.max(0,Math.min(100,percent))}%`} as CSSProperties}><i/><i/><i/></span>;
}

export default function InventoryCenter({ toast }: {toast:(message:string)=>void}) {
  const [data,setData]=useState<Inventory|null>(null);
  const [tab,setTab]=useState<"stock"|"active">("stock");
  const [dialog,setDialog]=useState<Dialog>(null);
  const [selectedBatch,setSelectedBatch]=useState<number|null>(null);
  const [selectedAllocation,setSelectedAllocation]=useState<number|null>(null);
  const [query,setQuery]=useState("");
  const [saving,setSaving]=useState(false);

  async function load() {
    const response=await fetch("/api/inventory",{cache:"no-store"});
    const result=await response.json();
    if(response.ok)setData(result); else toast(result.error||"库存数据读取失败");
  }
  useEffect(()=>{
    let active=true;
    void fetch("/api/inventory",{cache:"no-store"}).then(async response=>({response,result:await response.json()})).then(({response,result})=>{
      if(!active)return;
      if(response.ok)setData(result); else toast(result.error||"库存数据读取失败");
    });
    return()=>{active=false;};
  },[toast]);

  async function post(payload:Record<string,unknown>) {
    const response=await fetch("/api/inventory",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const result=await response.json();
    if(!response.ok){toast(result.error||"库存操作失败");return false;}
    await load(); return true;
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(!dialog)return;
    setSaving(true);
    const values=Object.fromEntries(new FormData(event.currentTarget));
    const action=dialog==="create"?"createMaterial":dialog;
    const ok=await post({action,...values});
    setSaving(false);
    if(ok){toast(dialog==="transferToPrinter"?"耗材已调拨到打印机":"库存单据已保存");setDialog(null);setSelectedBatch(null);setSelectedAllocation(null);}
  }
  async function receive(item:Transit) {
    if(await post({action:"receiveTransit",transitId:item.id})){toast(`${item.purchaseNo||item.sku} 已收货入库`);}
  }

  if(!data)return <div className="empty-state">正在读取库存总账…</div>;
  const q=query.trim().toLowerCase();
  const products=data.products.filter(item=>!q||[item.sku,item.material,item.color,item.brand,item.location].join(" ").toLowerCase().includes(q));
  const occupied=data.products.reduce((sum,item)=>sum+Number(item.occupiedGrams||0),0);
  const inTransit=data.products.reduce((sum,item)=>sum+Number(item.inTransitGrams||0),0);
  const available=data.products.reduce((sum,item)=>sum+Number(item.availableGrams||0),0);

  return <section className="inventory-center stock-control-center">
    <div className="stock-workspace-tabs">
      <button className={tab==="stock"?"active":""} onClick={()=>setTab("stock")}><strong>库存管理</strong><span>库存查询与总账</span></button>
      <button className={tab==="active"?"active":""} onClick={()=>setTab("active")}><strong>正在使用中</strong><span>{data.printers.length} 台打印机 · {data.printers.reduce((sum,p)=>sum+p.allocations.length,0)} 个在用卷</span></button>
    </div>

    {tab==="stock"?<>
      <div className="inventory-kpis stock-kpis">
        <article><small>商品数量</small><strong>{data.summary.skuCount}</strong><span>SKU / 物料</span></article>
        <article><small>可用库存</small><strong>{(available/1000).toFixed(2)} kg</strong><span>仓库可直接领用</span></article>
        <article><small>在途数量</small><strong>{(inTransit/1000).toFixed(2)} kg</strong><span>采购未到货</span></article>
        <article><small>占用数量</small><strong>{(occupied/1000).toFixed(2)} kg</strong><span>打印机 + 任务占用</span></article>
        <article className={data.summary.lowStockCount?"inventory-kpi-alert":""}><small>库存预警</small><strong>{data.summary.lowStockCount}</strong><span>需要采购补货</span></article>
        <article><small>库存总价值</small><strong>RM {Number(data.summary.stockValue||0).toFixed(2)}</strong><span>公司全部耗材</span></article>
      </div>
      <div className="inventory-toolbar stock-ledger-toolbar"><div><small>INVENTORY LEDGER</small><h2>耗材库存查询</h2><p>库存盘点录入后，采购形成在途和入库，领用调拨到具体打印机。</p></div><div>
        <button onClick={()=>setDialog("createTransit")}>＋ 采购在途</button>
        <button onClick={()=>setDialog("movement")}>采购入库</button>
        <button onClick={()=>setDialog("stocktake")}>库存盘点</button>
        <button className="primary" onClick={()=>setDialog("create")}>＋ 新建商品</button>
      </div></div>
      <div className="inventory-controls stock-query-bar"><div className="inventory-search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索商品编码、商品名称、材质、颜色、品牌或库位"/></div><span>共 {products.length} 项商品</span></div>
      <div className="panel inventory-ledger-panel stock-ledger-table"><div className="table-wrap"><table><thead><tr><th>图片</th><th>商品编码</th><th>商品名称</th><th>可用量</th><th>在途量</th><th>占用量</th><th>近 3 天</th><th>近 15 天</th><th>近 30 天</th><th>预警</th><th>操作</th></tr></thead><tbody>
        {products.map(item=>{const low=Number(item.availableGrams)<=Number(item.lowStockGrams);return <tr key={item.id} className={low?"inventory-low-row":""}>
          <td><Spool color={item.color} percent={Number(item.remainingGrams)/Math.max(1,Number(item.spoolWeightGrams))*100}/></td>
          <td><strong>{item.sku}</strong><small className="table-hint">{item.warehouse} · {item.location||"未设库位"}</small></td>
          <td><span className="product-identity"><strong>{item.material} · {item.color}</strong><small>{item.brand||"未填写品牌"} · {item.specification||`${item.spoolWeightGrams}g/卷`}</small></span></td>
          <td><strong>{Number(item.availableGrams).toFixed(0)} g</strong><small className="table-hint">总账 {Number(item.remainingGrams).toFixed(0)}g</small></td>
          <td><strong>{Number(item.inTransitGrams).toFixed(0)} g</strong></td>
          <td><strong>{Number(item.occupiedGrams).toFixed(0)} g</strong><small className="table-hint">在机 {Number(item.printerOccupiedGrams).toFixed(0)} / 任务 {Number(item.taskOccupiedGrams).toFixed(0)}</small></td>
          <td>{Number(item.usage3Days).toFixed(0)} g</td><td>{Number(item.usage15Days).toFixed(0)} g</td><td>{Number(item.usage30Days).toFixed(0)} g</td>
          <td><span className={`stock-warning ${low?"danger":"safe"}`}>{low?"需要补货":"库存正常"}</span><small className="table-hint">安全线 {item.lowStockGrams}g</small></td>
          <td><div className="row-actions"><button onClick={()=>{setSelectedBatch(item.id);setDialog("transferToPrinter");}}>出库到打印机</button><button onClick={()=>{setSelectedBatch(item.id);setDialog("stocktake");}}>盘点</button></div></td>
        </tr>})}
        {!products.length&&<tr><td colSpan={11}><div className="empty-state">没有符合条件的库存商品。</div></td></tr>}
      </tbody></table></div></div>
      {data.transit.some(item=>item.status==="在途")&&<div className="panel transit-panel"><div className="inventory-section-head"><div><small>PROCUREMENT</small><h3>采购在途</h3></div><span>到货后点击收货，数量自动进入库存总账</span></div><div className="transit-list">{data.transit.filter(item=>item.status==="在途").map(item=><div key={item.id}><span><strong>{item.purchaseNo||"未填写采购单"}</strong><small>{item.sku} · {item.material} {item.color} · {item.supplier||"未填写供应商"}</small></span><span><strong>{item.grams.toFixed(0)}g</strong><small>预计 {item.eta||"待确认"}</small></span><button onClick={()=>void receive(item)}>确认收货入库</button></div>)}</div></div>}
    </>:<>
      <div className="inventory-toolbar active-printer-head"><div><small>IN-USE MATERIALS</small><h2>打印机在用耗材</h2><p>每台打印机独立显示设备状态、当前任务、AMS 实时槽位与仓库调拨卷。</p></div><button className="primary" onClick={()=>setDialog("transferToPrinter")}>＋ 出库到打印机</button></div>
      <div className="printer-material-grid">{data.printers.map(printer=><article key={printer.id} className="printer-material-card">
        <header><div><span className={`printer-online-dot ${printer.connectionState==="在线"||printer.connectionState==="已连接"?"online":""}`}/><div><h3>{printer.name}</h3><p>{printer.model||"Bambu Lab"} · {printer.location||"未设置位置"}</p></div></div><span>{printer.status}</span></header>
        <div className="printer-live-strip"><div><small>连接状态</small><strong>{printer.connectionState}</strong></div><div><small>当前任务</small><strong>{printer.currentFile||"暂无打印任务"}</strong></div><div><small>进度</small><strong>{Number(printer.remoteProgress||0).toFixed(0)}%</strong></div><div><small>温度</small><strong>{printer.nozzleTemp==null?"—":`${printer.nozzleTemp}°`} / {printer.bedTemp==null?"—":`${printer.bedTemp}°`}</strong></div></div>
        <section><div className="printer-section-title"><strong>AMS 实时槽位</strong><small>{printer.amsSlots.length?"来自打印机自动识别":"等待设备同步"}</small></div><div className="ams-slot-grid">{printer.amsSlots.map(slot=><div key={`${slot.amsUnit}-${slot.trayIndex}`} className={slot.active?"active":""}><span className="ams-color" style={{background:`#${slot.colorHex||"bcc5c1"}`}}/><strong>AMS {slot.amsUnit+1}-{slot.trayIndex+1}</strong><small>{slot.material||"未识别"} · {slot.remainingPercent==null?"余量未知":`${slot.remainingPercent}%`}</small></div>)}{!printer.amsSlots.length&&<div className="ams-empty">本地 Agent 连线后自动显示 AMS 槽位</div>}</div></section>
        <section><div className="printer-section-title"><strong>仓库调拨到本机</strong><small>{printer.allocations.length} 卷</small></div><div className="printer-allocation-list">{printer.allocations.map(item=><div key={item.id}><Spool color={item.color} percent={item.remainingGrams/Math.max(1,item.allocatedGrams)*100}/><span><strong>{item.material} · {item.color}</strong><small>{item.sku} · {item.amsUnit==null?"外置料架":`AMS ${item.amsUnit+1}-${Number(item.trayIndex||0)+1}`}</small></span><span><strong>{item.remainingGrams.toFixed(0)}g</strong><button onClick={()=>{setSelectedAllocation(item.id);setDialog("returnFromPrinter");}}>退回仓库</button></span></div>)}{!printer.allocations.length&&<div className="empty-state">暂无调拨耗材</div>}</div></section>
        <button className="printer-transfer-button" onClick={()=>setDialog("transferToPrinter")}>＋ 给这台打印机出库耗材</button>
      </article>)}{!data.printers.length&&<div className="empty-state inventory-empty-card">请先在设备管理中添加打印机。</div>}</div>
    </>}

    {dialog&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setDialog(null)}><form className="record-modal inventory-modal" onSubmit={submit}><div className="modal-head"><div><small>INVENTORY DOCUMENT</small><h2>{{create:"新建商品与期初库存",movement:"采购入库 / 库存调整",stocktake:"库存盘点",transferToPrinter:"出库到打印机",createTransit:"登记采购在途",returnFromPrinter:"在机耗材退回仓库"}[dialog]}</h2></div><button type="button" onClick={()=>setDialog(null)}>×</button></div><div className="form-grid">
      {dialog==="create"?<><Field name="sku" label="商品编码" placeholder="PLA-WHITE-1KG"/><Field name="material" label="商品名称 / 材质" placeholder="PLA"/><Field name="color" label="颜色" placeholder="哑光白"/><Field name="brand" label="品牌" placeholder="Bambu Lab"/><Field name="specification" label="规格" placeholder="1.75mm · 1kg/卷"/><Field name="spoolWeightGrams" label="每卷净重（g）" type="number" defaultValue={1000}/><Field name="spoolCount" label="期初卷数" type="number" defaultValue={1}/><Field name="costPerKg" label="成本（RM/kg）" type="number" defaultValue={0}/><Field name="lowStockGrams" label="安全库存（g）" type="number" defaultValue={1000}/><Field name="supplier" label="供应商"/><Field name="lotNo" label="批次号"/><Field name="documentNo" label="期初单号"/><Field name="warehouse" label="仓库" defaultValue="主仓"/><Field name="location" label="库位"/><Field name="operator" label="经办人"/><Field name="notes" label="备注"/></>:
      dialog==="returnFromPrinter"?<><input type="hidden" name="allocationId" value={selectedAllocation||""}/><Field name="grams" label="退回重量（g）" type="number"/><Field name="documentNo" label="退料单号"/><Field name="operator" label="经办人"/></>:
      <><label><span>库存商品</span><select name="batchId" required defaultValue={selectedBatch||""}><option value="">请选择</option>{data.products.map(item=><option key={item.id} value={item.id}>{item.sku} · {item.material} {item.color} · 可用 {item.availableGrams.toFixed(0)}g</option>)}</select></label>
      {dialog==="transferToPrinter"?<><label><span>目标打印机</span><select name="printerId" required><option value="">请选择</option>{data.printers.map(p=><option key={p.id} value={p.id}>{p.name} · {p.model}</option>)}</select></label><Field name="grams" label="出库重量（g）" type="number"/><Field name="amsUnit" label="AMS 编号（从 0 开始）" type="number"/><Field name="trayIndex" label="槽位编号（从 0 开始）" type="number"/><Field name="documentNo" label="出库单号" placeholder="ISSUE-202607-001"/><Field name="operator" label="领料人 / 经办人"/></>:
      dialog==="createTransit"?<><Field name="grams" label="采购数量（g）" type="number"/><Field name="supplier" label="供应商"/><Field name="purchaseNo" label="采购单号"/><Field name="eta" label="预计到货日期" type="date"/><Field name="operator" label="采购经办人"/></>:
      dialog==="stocktake"?<><Field name="countedGrams" label="实盘重量（g）" type="number"/><Field name="operator" label="盘点人"/><Field name="reason" label="差异原因"/></>:
      <><input type="hidden" name="type" value="采购入库"/><Field name="grams" label="入库数量（g）" type="number"/><Field name="documentNo" label="入库单号"/><Field name="operator" label="经办人"/><Field name="warehouse" label="仓库" defaultValue="主仓"/><Field name="note" label="备注"/></>}</>}
    </div><p className="modal-note">库存数量统一以克为基本单位。出库到打印机属于内部调拨，会形成打印机占用量；实际打印后再自动扣减公司总库存。</p><button className="primary modal-submit" disabled={saving}>{saving?"保存中…":"保存单据"}</button></form></div>}
  </section>;
}
