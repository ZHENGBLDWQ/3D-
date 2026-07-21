export const CASE_STATUSES=["opened","triaged","in_progress","resolved","closed","reopened"] as const;
export type CaseStatus=typeof CASE_STATUSES[number];

const transitions:Record<CaseStatus,CaseStatus[]>={
  opened:["triaged","in_progress","resolved","closed"],
  triaged:["in_progress","resolved","closed"],
  in_progress:["resolved","closed"],
  resolved:["closed","reopened"],
  closed:["reopened"],
  reopened:["triaged","in_progress","resolved","closed"],
};

export function canTransition(from:string,to:string){
  return CASE_STATUSES.includes(from as CaseStatus)&&transitions[from as CaseStatus].includes(to as CaseStatus);
}

export function slaState(status:string,dueAt:string|null,now=new Date()){
  if(["resolved","closed"].includes(status)||!dueAt)return "stopped";
  return Date.parse(dueAt)<now.getTime()?"breached":"on_track";
}

export function normalizeRefundCents(value:unknown){
  const cents=Number(value??0);
  if(!Number.isSafeInteger(cents)||cents<0)throw new Error("REFUND_CENTS_INVALID");
  return cents;
}
