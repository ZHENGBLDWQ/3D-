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
