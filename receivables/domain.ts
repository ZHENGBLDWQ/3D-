export type InvoiceStatus="draft"|"issued"|"partially_paid"|"paid"|"void"|"overdue";
export function cents(value:unknown){const n=Number(value);if(!Number.isSafeInteger(n)||n<=0)throw new Error("金额必须是大于零的整数 cents");return n}
export function nextInvoiceStatus(current:InvoiceStatus,action:"issue"|"void"){
  if(action==="issue"&&current==="draft")return "issued" as const;
  if(action==="void"&&["draft","issued","overdue"].includes(current))return "void" as const;
  throw new Error("当前发票状态不允许此操作");
}
export function agingBucket(dueDate:string,today=new Date()){
  const due=new Date(`${dueDate}T00:00:00Z`);const now=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()));
  const days=Math.floor((now.getTime()-due.getTime())/86400000);if(days<=0)return "未到期";if(days<=30)return "1-30天";if(days<=60)return "31-60天";if(days<=90)return "61-90天";return "90天以上";
}
