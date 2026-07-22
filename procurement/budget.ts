import {getD1} from "../db";

export type BudgetSummary={month:string;budgetCents:number;warningBps:number;draftCents:number;pendingCents:number;orderedCents:number;inTransitCents:number;receivedUnreconciledCents:number;availableCents:number;usageBps:number};

export async function getProcurementBudget(organizationId:number,month=new Date().toISOString().slice(0,7)):Promise<BudgetSummary>{
 const db=getD1();
 const [budget,drafts,orders]=await Promise.all([
  db.prepare("SELECT budget_cents budgetCents,warning_bps warningBps FROM procurement_monthly_budgets WHERE organization_id=? AND budget_month=?").bind(organizationId,month).first<{budgetCents:number;warningBps:number}>(),
  db.prepare(`SELECT r.status,COALESCE(SUM(s.forecast_cost_cents),0) cents FROM procurement_requests r JOIN replenishment_forecast_snapshots s ON s.procurement_request_id=r.id AND s.organization_id=r.organization_id WHERE r.organization_id=? AND r.status IN ('draft','pending','approved') GROUP BY r.status`).bind(organizationId).all<{status:string;cents:number}>(),
  db.prepare(`SELECT po.status,po.reconciliation_status reconciliationStatus,COALESCE(SUM(po.landed_total_cents),0) cents FROM purchase_orders po WHERE po.organization_id=? AND substr(po.ordered_at,1,7)=? AND po.status!='cancelled' GROUP BY po.status,po.reconciliation_status`).bind(organizationId,month).all<{status:string;reconciliationStatus:string;cents:number}>(),
 ]);
 let draftCents=0,pendingCents=0,orderedCents=0,inTransitCents=0,receivedUnreconciledCents=0;
 for(const row of drafts.results??[]){if(row.status==="draft")draftCents+=Number(row.cents);else pendingCents+=Number(row.cents)}
 for(const row of orders.results??[]){const amount=Number(row.cents);orderedCents+=amount;if(row.status==="ordered"||row.status==="partially_received")inTransitCents+=amount;else if(row.status==="completed"&&!['matched','approved'].includes(row.reconciliationStatus))receivedUnreconciledCents+=amount}
 const budgetCents=Number(budget?.budgetCents??0),warningBps=Number(budget?.warningBps??8000);
 return {month,budgetCents,warningBps,draftCents,pendingCents,orderedCents,inTransitCents,receivedUnreconciledCents,availableCents:Math.max(0,budgetCents-orderedCents),usageBps:budgetCents?Math.round(orderedCents*10000/budgetCents):0};
}
