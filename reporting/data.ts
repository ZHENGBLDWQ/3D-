import {getD1} from "../db";
import {type ReportRange,type ReportRow,summarize} from "./report";

type Row=Record<string,unknown>;
const n=(v:unknown)=>Number(v)||0;
export async function getOperationsReport(organizationId:number,range:ReportRange){
  const db=getD1(),args=[organizationId,range.from,range.to];
  const [orders,jobs,outcomes,materials,costs,printers]=await Promise.all([
    db.prepare(`SELECT date(o.created_at) day,COUNT(DISTINCT o.id) orders,COALESCE(SUM(oi.quantity*oi.unit_price*100),0) revenue FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id WHERE o.organization_id=? AND date(o.created_at) BETWEEN date(?) AND date(?) GROUP BY date(o.created_at)`).bind(...args).all<Row>(),
    db.prepare(`SELECT date(COALESCE(j.completed_at,j.started_at,j.created_at)) day,SUM(CASE WHEN j.status IN ('completed','已完成') THEN 1 ELSE 0 END) completed,SUM(CASE WHEN j.status IN ('failed','失败') THEN 1 ELSE 0 END) failed,COALESCE(SUM(CASE WHEN j.started_at IS NOT NULL AND j.completed_at IS NOT NULL THEN MAX(0,(julianday(j.completed_at)-julianday(j.started_at))*1440) ELSE 0 END),0) productive_minutes FROM print_jobs j WHERE j.organization_id=? AND date(COALESCE(j.completed_at,j.started_at,j.created_at)) BETWEEN date(?) AND date(?) GROUP BY date(COALESCE(j.completed_at,j.started_at,j.created_at))`).bind(...args).all<Row>(),
    db.prepare(`SELECT date(reported_at) day,SUM(successful_quantity) good_units,SUM(failed_quantity) failed_units FROM production_outcomes WHERE organization_id=? AND date(reported_at) BETWEEN date(?) AND date(?) GROUP BY date(reported_at)`).bind(...args).all<Row>(),
    db.prepare(`SELECT date(s.settled_at) day,SUM(s.actual_grams) actual_grams,COALESCE(SUM(s.actual_grams*b.cost_per_kg),0) material_cost_cents FROM material_settlements s JOIN material_batches b ON b.id=s.batch_id WHERE s.organization_id=? AND date(s.settled_at) BETWEEN date(?) AND date(?) GROUP BY date(s.settled_at)`).bind(...args).all<Row>(),
    db.prepare(`SELECT date(occurred_at) day,COALESCE(SUM(amount_cents),0) other_cost_cents FROM profit_cost_entries WHERE organization_id=? AND basis='actual' AND category<>'revenue_adjustment' AND date(occurred_at) BETWEEN date(?) AND date(?) GROUP BY date(occurred_at)`).bind(...args).all<Row>(),
    db.prepare("SELECT COUNT(DISTINCT printer_id) count FROM printer_bindings WHERE organization_id=? AND status='bound'").bind(organizationId).first<{count:number}>(),
  ]);
  const map=new Map<string,ReportRow>();for(let d=new Date(`${range.from}T00:00:00Z`);d<=new Date(`${range.to}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+1)){const date=d.toISOString().slice(0,10);map.set(date,{date,orders:0,revenueCents:0,completed:0,failed:0,goodUnits:0,failedUnits:0,actualGrams:0,materialCostCents:0,otherCostCents:0,productiveMinutes:0})}
  const merge=(result:{results?:Row[]},apply:(target:ReportRow,row:Row)=>void)=>{for(const row of result.results??[]){const target=map.get(String(row.day));if(target)apply(target,row)}};
  merge(orders,(t,r)=>{t.orders=n(r.orders);t.revenueCents=Math.round(n(r.revenue))});
  merge(jobs,(t,r)=>{t.completed=n(r.completed);t.failed=n(r.failed);t.productiveMinutes=Math.round(n(r.productive_minutes))});
  merge(outcomes,(t,r)=>{t.goodUnits=n(r.good_units);t.failedUnits=n(r.failed_units)});
  merge(materials,(t,r)=>{t.actualGrams=n(r.actual_grams);t.materialCostCents=Math.round(n(r.material_cost_cents))});
  merge(costs,(t,r)=>{t.otherCostCents=Math.round(n(r.other_cost_cents))});
  const rows=[...map.values()];return {range,rows,summary:summarize(rows,n(printers?.count)),activePrinters:n(printers?.count)};
}
