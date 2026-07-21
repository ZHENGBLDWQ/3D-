export type ProfitSettings={electricityRateCentsPerKwh:number;laborRateCentsPerHour:number;laborMinutesPerJob:number;packagingCentsPerOrder:number;overheadBasisPoints:number};
export type RevenueRow={organizationId:number;orderId:number;orderNo:string;customer:string;status:string;quantity:number;unitPriceRm:number};
export type JobCostRow={organizationId:number;jobId:number;orderId:number|null;printerId:number|null;printerName:string;status:string;quantity:number;estimatedGrams:number;estimatedMaterialRm?:number;estimatedMinutes:number;startedAt:string|null;completedAt:string|null;hourlyRateRm:number;powerWatts:number};
export type MaterialCostRow={organizationId:number;orderId:number|null;jobId:number;grams:number;costPerKgRm:number;kind:"consumption"|"scrap"};
export type ExtraCostRow={organizationId:number;orderId:number|null;category:"labor"|"packaging"|"overhead"|"scrap"|"other"|"revenue_adjustment";basis:"estimated"|"actual";amountCents:number;occurredAt:string};
export type ProfitFixture={settings:ProfitSettings;revenues:RevenueRow[];jobs:JobCostRow[];materials:MaterialCostRow[];extras:ExtraCostRow[];activePrinters:number;periodDays?:number};

const n=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;
const centsFromRm=(value:number)=>Math.round(n(value)*100);
const mulDiv=(value:number,multiplier:number,divisor:number)=>Math.round(n(value)*n(multiplier)/divisor);
const hours=(job:JobCostRow)=>job.startedAt&&job.completedAt?Math.max(0,(Date.parse(job.completedAt)-Date.parse(job.startedAt))/3_600_000):0;
const money=(cents:number)=>({cents:Math.round(cents),rm:(Math.round(cents)/100).toFixed(2)});

type MutableOrder={orderId:number;orderNo:string;customer:string;status:string;revenueCents:number;estimatedMaterialCents:number;actualMaterialCents:number;estimatedMachineCents:number;actualMachineCents:number;estimatedEnergyCents:number;actualEnergyCents:number;estimatedLaborCents:number;actualLaborCents:number;estimatedPackagingCents:number;actualPackagingCents:number;estimatedOverheadCents:number;actualOverheadCents:number;scrapCents:number;otherEstimatedCents:number;otherActualCents:number;estimatedGrams:number;actualGrams:number;jobs:number;completedJobs:number};
const emptyOrder=(row:RevenueRow):MutableOrder=>({orderId:row.orderId,orderNo:row.orderNo,customer:row.customer,status:row.status,revenueCents:0,estimatedMaterialCents:0,actualMaterialCents:0,estimatedMachineCents:0,actualMachineCents:0,estimatedEnergyCents:0,actualEnergyCents:0,estimatedLaborCents:0,actualLaborCents:0,estimatedPackagingCents:0,actualPackagingCents:0,estimatedOverheadCents:0,actualOverheadCents:0,scrapCents:0,otherEstimatedCents:0,otherActualCents:0,estimatedGrams:0,actualGrams:0,jobs:0,completedJobs:0});

export function buildProfitReport(organizationId:number,input:ProfitFixture){
  const settings=input.settings;
  const revenueRows=input.revenues.filter(row=>row.organizationId===organizationId);
  const jobs=input.jobs.filter(row=>row.organizationId===organizationId);
  const materials=input.materials.filter(row=>row.organizationId===organizationId);
  const extras=input.extras.filter(row=>row.organizationId===organizationId);
  const orders=new Map<number,MutableOrder>();
  for(const row of revenueRows){const order=orders.get(row.orderId)??emptyOrder(row);order.revenueCents+=centsFromRm(row.unitPriceRm*n(row.quantity));orders.set(row.orderId,order)}
  let productiveHours=0;
  const printerHours=new Map<string,{name:string;hours:number;jobs:number;failed:number}>();
  for(const job of jobs){
    if(job.orderId===null||!orders.has(job.orderId))continue;
    const order=orders.get(job.orderId)!;const estimatedMinutes=n(job.estimatedMinutes)*Math.max(1,n(job.quantity));const actualHours=hours(job);const estimatedHours=estimatedMinutes/60;
    order.jobs++;if(job.status==="completed"||job.status==="已完成")order.completedJobs++;
    order.estimatedGrams+=n(job.estimatedGrams)*Math.max(1,n(job.quantity));
    order.estimatedMaterialCents+=centsFromRm(n(job.estimatedMaterialRm)*Math.max(1,n(job.quantity)));
    order.estimatedMachineCents+=centsFromRm(estimatedHours*n(job.hourlyRateRm));
    order.actualMachineCents+=centsFromRm(actualHours*n(job.hourlyRateRm));
    order.estimatedEnergyCents+=mulDiv(estimatedMinutes*n(job.powerWatts),settings.electricityRateCentsPerKwh,60_000);
    order.actualEnergyCents+=mulDiv(actualHours*n(job.powerWatts),settings.electricityRateCentsPerKwh,1000);
    order.estimatedLaborCents+=mulDiv(settings.laborMinutesPerJob,settings.laborRateCentsPerHour,60);
    if(job.status==="completed"||job.status==="已完成")order.actualLaborCents+=mulDiv(settings.laborMinutesPerJob,settings.laborRateCentsPerHour,60);
    productiveHours+=actualHours;const key=job.printerName||`设备 ${job.printerId??"-"}`;const device=printerHours.get(key)??{name:key,hours:0,jobs:0,failed:0};device.hours+=actualHours;device.jobs++;if(job.status==="failed"||job.status==="失败")device.failed++;printerHours.set(key,device);
  }
  for(const row of materials){if(row.orderId===null||!orders.has(row.orderId))continue;const order=orders.get(row.orderId)!;const cost=centsFromRm(Math.abs(n(row.grams))*n(row.costPerKgRm)/1000);order.actualGrams+=Math.abs(n(row.grams));if(row.kind==="scrap")order.scrapCents+=cost;else order.actualMaterialCents+=cost}
  for(const order of orders.values()){order.estimatedPackagingCents=settings.packagingCentsPerOrder;if(order.completedJobs>0)order.actualPackagingCents=settings.packagingCentsPerOrder}
  for(const row of extras){if(row.orderId===null||!orders.has(row.orderId))continue;const order=orders.get(row.orderId)!;const amount=Math.round(n(row.amountCents));if(row.category==="revenue_adjustment")order.revenueCents+=amount;else if(row.category==="scrap"&&row.basis==="actual")order.scrapCents+=amount;else if(row.category==="labor")order[row.basis==="actual"?"actualLaborCents":"estimatedLaborCents"]+=amount;else if(row.category==="packaging")order[row.basis==="actual"?"actualPackagingCents":"estimatedPackagingCents"]+=amount;else if(row.category==="overhead")order[row.basis==="actual"?"actualOverheadCents":"estimatedOverheadCents"]+=amount;else order[row.basis==="actual"?"otherActualCents":"otherEstimatedCents"]+=amount}
  const orderReports=[...orders.values()].map(order=>{
    const estimatedBase=order.estimatedMaterialCents+order.estimatedMachineCents+order.estimatedEnergyCents+order.estimatedLaborCents+order.estimatedPackagingCents+order.otherEstimatedCents;
    const actualBase=order.actualMaterialCents+order.actualMachineCents+order.actualEnergyCents+order.actualLaborCents+order.actualPackagingCents+order.scrapCents+order.otherActualCents;
    order.estimatedOverheadCents+=mulDiv(estimatedBase,settings.overheadBasisPoints,10_000);order.actualOverheadCents+=mulDiv(actualBase,settings.overheadBasisPoints,10_000);
    const estimatedCost=estimatedBase+order.estimatedOverheadCents,actualCost=actualBase+order.actualOverheadCents,profit=order.revenueCents-actualCost;
    return{orderId:order.orderId,orderNo:order.orderNo,customer:order.customer,status:order.status,revenue:money(order.revenueCents),estimatedCost:money(estimatedCost),actualCost:money(actualCost),actualProfit:money(profit),marginBasisPoints:order.revenueCents?Math.round(profit*10_000/order.revenueCents):0,material:{estimated:money(order.estimatedMaterialCents),actual:money(order.actualMaterialCents),estimatedGrams:Math.round(order.estimatedGrams*10)/10,actualGrams:Math.round(order.actualGrams*10)/10,varianceGrams:Math.round((order.actualGrams-order.estimatedGrams)*10)/10},machine:money(order.actualMachineCents),energy:money(order.actualEnergyCents),labor:money(order.actualLaborCents),packaging:money(order.actualPackagingCents),overhead:money(order.actualOverheadCents),scrap:money(order.scrapCents),jobs:order.jobs,completedJobs:order.completedJobs};
  }).sort((a,b)=>b.actualProfit.cents-a.actualProfit.cents);
  const sum=(pick:(row:typeof orderReports[number])=>number)=>orderReports.reduce((total,row)=>total+pick(row),0);const revenue=sum(row=>row.revenue.cents),actualCost=sum(row=>row.actualCost.cents),profit=revenue-actualCost;
  const periodDays=Math.max(1,input.periodDays??30),capacityHours=Math.max(0,n(input.activePrinters))*periodDays*24;
  return{currency:"MYR",summary:{revenue:money(revenue),estimatedCost:money(sum(row=>row.estimatedCost.cents)),actualCost:money(actualCost),actualProfit:money(profit),marginBasisPoints:revenue?Math.round(profit*10_000/revenue):0,scrapCost:money(sum(row=>row.scrap.cents)),materialVarianceGrams:Math.round(orderReports.reduce((total,row)=>total+row.material.varianceGrams,0)*10)/10,utilizationBasisPoints:capacityHours?Math.round(productiveHours*10_000/capacityHours):0},orders:orderReports,trend:orderReports.slice(-12).map(row=>({label:row.orderNo,revenue:row.revenue,profit:row.actualProfit})),printers:[...printerHours.values()].map(row=>({...row,hours:Math.round(row.hours*10)/10,utilizationBasisPoints:capacityHours?Math.round(row.hours*10_000/(periodDays*24)):0})).sort((a,b)=>b.hours-a.hours),empty:orderReports.length===0};
}

export function formatRm(value:{cents:number}){return `RM ${(value.cents/100).toFixed(2)}`}
