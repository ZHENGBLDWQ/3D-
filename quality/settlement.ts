export type SettlementInput={reservationId:number;actualGrams:number;batchId:number;reservedGrams:number};

export function validateOutcome(input:{plannedQuantity:number;successfulQuantity:number;failedQuantity:number;failureReason?:string;settlements:SettlementInput[]}){
  const successful=Math.trunc(Number(input.successfulQuantity)),failed=Math.trunc(Number(input.failedQuantity));
  if(successful<0||failed<0||successful+failed!==input.plannedQuantity)throw new Error("QUALITY_QUANTITY_MISMATCH");
  if(failed>0&&!input.failureReason?.trim())throw new Error("QUALITY_FAILURE_REASON_REQUIRED");
  if(!input.settlements.length)throw new Error("QUALITY_SETTLEMENT_REQUIRED");
  const seen=new Set<number>();
  for(const row of input.settlements){
    if(!Number.isInteger(row.reservationId)||row.reservationId<1||!Number.isFinite(row.actualGrams)||row.actualGrams<0)throw new Error("QUALITY_SETTLEMENT_INVALID");
    if(seen.has(row.reservationId))throw new Error("QUALITY_SETTLEMENT_DUPLICATE_RESERVATION");
    seen.add(row.reservationId);
  }
  return {successful,failed,result:failed===0?"passed":successful===0?"failed":"partial" as const};
}
