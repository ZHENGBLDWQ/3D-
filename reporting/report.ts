export type ReportRange={from:string;to:string};
export type ReportRow={date:string;orders:number;revenueCents:number;completed:number;failed:number;goodUnits:number;failedUnits:number;actualGrams:number;materialCostCents:number;otherCostCents:number;productiveMinutes:number};

const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;
export function normalizeRange(from:string|null,to:string|null,now=new Date()):ReportRange{
  const end=ISO_DATE.test(to??"")?String(to):now.toISOString().slice(0,10);
  const fallback=new Date(`${end}T00:00:00.000Z`);fallback.setUTCDate(fallback.getUTCDate()-29);
  const start=ISO_DATE.test(from??"")?String(from):fallback.toISOString().slice(0,10);
  if(start>end)throw new Error("开始日期不能晚于结束日期");
  const days=(Date.parse(`${end}T00:00:00Z`)-Date.parse(`${start}T00:00:00Z`))/86400000;
  if(days>366)throw new Error("报表日期范围不能超过 367 天");
  return {from:start,to:end};
}

export function summarize(rows:ReportRow[],activePrinters:number){
  const total=rows.reduce((a,r)=>({orders:a.orders+r.orders,revenueCents:a.revenueCents+r.revenueCents,completed:a.completed+r.completed,failed:a.failed+r.failed,goodUnits:a.goodUnits+r.goodUnits,failedUnits:a.failedUnits+r.failedUnits,actualGrams:a.actualGrams+r.actualGrams,materialCostCents:a.materialCostCents+r.materialCostCents,otherCostCents:a.otherCostCents+r.otherCostCents,productiveMinutes:a.productiveMinutes+r.productiveMinutes}),{orders:0,revenueCents:0,completed:0,failed:0,goodUnits:0,failedUnits:0,actualGrams:0,materialCostCents:0,otherCostCents:0,productiveMinutes:0});
  const inspected=total.goodUnits+total.failedUnits,totalCostCents=total.materialCostCents+total.otherCostCents;
  return {...total,totalCostCents,profitCents:total.revenueCents-totalCostCents,yieldBasisPoints:inspected?Math.round(total.goodUnits/inspected*10000):0,utilizationBasisPoints:activePrinters&&rows.length?Math.min(10000,Math.round(total.productiveMinutes/(activePrinters*rows.length*1440)*10000)):0};
}

const FORMULA=/^[\t\r\n ]*[=+\-@]/;
export function safeCsvCell(value:unknown){const raw=String(value??"");const safe=FORMULA.test(raw)?`'${raw}`:raw;return `"${safe.replaceAll('"','""')}"`}
export function buildCsv(rows:ReportRow[]){
  const header=["日期","订单数","收入(RM)","完成任务","失败任务","良品数","不良数","实际耗材(g)","材料成本(RM)","其他成本(RM)","生产分钟"];
  const data=rows.map(r=>[r.date,r.orders,(r.revenueCents/100).toFixed(2),r.completed,r.failed,r.goodUnits,r.failedUnits,r.actualGrams.toFixed(2),(r.materialCostCents/100).toFixed(2),(r.otherCostCents/100).toFixed(2),r.productiveMinutes]);
  return "\uFEFF"+[header,...data].map(row=>row.map(safeCsvCell).join(",")).join("\r\n");
}
