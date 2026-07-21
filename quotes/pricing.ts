export type PricingInput={quantity:number;unitCostCents:number;targetMarginBasisPoints:number;unitPriceCents?:number};

export function suggestedUnitPriceCents(unitCostCents:number,targetMarginBasisPoints:number){
  const cost=Math.max(0,Math.round(unitCostCents));
  const margin=Math.trunc(targetMarginBasisPoints);
  if(margin<0||margin>=10000)throw new Error("QUOTE_MARGIN_INVALID");
  return Math.ceil(cost*10000/(10000-margin));
}

export function priceLine(input:PricingInput){
  const quantity=Math.trunc(input.quantity);
  if(quantity<1)throw new Error("QUOTE_QUANTITY_INVALID");
  const unitCostCents=Math.max(0,Math.round(input.unitCostCents));
  const suggested=suggestedUnitPriceCents(unitCostCents,input.targetMarginBasisPoints);
  const unitPriceCents=input.unitPriceCents===undefined?suggested:Math.max(0,Math.round(input.unitPriceCents));
  return {quantity,unitCostCents,suggestedUnitPriceCents:suggested,unitPriceCents,costCents:unitCostCents*quantity,subtotalCents:unitPriceCents*quantity};
}
