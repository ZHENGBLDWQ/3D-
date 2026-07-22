export type RequestStatus="draft"|"pending"|"approved"|"ordered"|"cancelled";
export type PurchaseStatus="approved"|"ordered"|"partially_received"|"completed"|"cancelled";
const requestTransitions:Record<RequestStatus,RequestStatus[]>={draft:["pending","cancelled"],pending:["approved","cancelled"],approved:["ordered","cancelled"],ordered:[],cancelled:[]};
const purchaseTransitions:Record<PurchaseStatus,PurchaseStatus[]>={approved:["ordered","cancelled"],ordered:["partially_received","completed","cancelled"],partially_received:["partially_received","completed","cancelled"],completed:[],cancelled:[]};
export function canTransitionRequest(from:RequestStatus,to:RequestStatus){return requestTransitions[from]?.includes(to)??false}
export function canTransitionPurchase(from:PurchaseStatus,to:PurchaseStatus){return purchaseTransitions[from]?.includes(to)??false}
export function receiptStatus(items:Array<{orderedGrams:number;receivedGrams:number;incomingGrams:number}>):PurchaseStatus{
  const complete=items.every(row=>row.receivedGrams+row.incomingGrams>=row.orderedGrams-0.0001);
  return complete?"completed":"partially_received";
}
export function suggestedReplenishment(remaining:number,lowStock:number,incoming=0){return Math.max(0,Math.ceil((Math.max(lowStock*3,1000)-remaining-incoming)/100)*100)}
export function suggestedSpoolReplenishment(onHand:number,reorderPoint:number,targetStock:number,incoming=0){return onHand<=reorderPoint?Math.max(0,Math.ceil(targetStock-onHand-incoming)):0}
export function supplierOfferCost(spools:number,unitCents:number,taxRateBps:number,freightCents:number){const subtotal=Math.max(0,Math.round(spools*unitCents)),tax=Math.max(0,Math.round(subtotal*taxRateBps/10000)),freight=Math.max(0,Math.round(freightCents)),total=subtotal+tax+freight;return {subtotalCents:subtotal,taxCents:tax,freightCents:freight,landedTotalCents:total,landedCentsPerSpool:spools>0?Math.ceil(total/spools):0}}
export function supplierInvoiceVariance(approvedTotalCents:number,actualSubtotalCents:number,actualTaxCents:number,actualFreightCents:number){const approved=Math.max(0,Math.round(approvedTotalCents)),subtotal=Math.max(0,Math.round(actualSubtotalCents)),tax=Math.max(0,Math.round(actualTaxCents)),freight=Math.max(0,Math.round(actualFreightCents)),actualTotalCents=subtotal+tax+freight,varianceCents=actualTotalCents-approved;return {approvedTotalCents:approved,actualSubtotalCents:subtotal,actualTaxCents:tax,actualFreightCents:freight,actualTotalCents,varianceCents,status:varianceCents===0?"matched" as const:"pending_review" as const}}
