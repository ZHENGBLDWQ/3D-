import {getD1} from "../../../db";
import {agingBucket,cents,nextInvoiceStatus,type InvoiceStatus} from "../../../receivables/domain";
import {can,getAccessContext,recordAudit,type AccessContext} from "../../access-control";
import {requireApiAccess} from "../../api-auth";

const fail=(error:string,status=400)=>Response.json({error},{status});
const text=(value:unknown,max=120)=>String(value??"").trim().slice(0,max);
const canManage=(context:AccessContext)=>can(context,"finance.read")&&["owner","manager","finance"].includes(context.role);
async function context(){const denied=await requireApiAccess(false,"finance.read");if(denied)return{denied};const value=await getAccessContext();return value?{value}:{denied:fail("请先登录",401)}}

async function synchronizeOverdue(organizationId:number){
  const db=getD1(),now=new Date().toISOString(),today=now.slice(0,10);
  await db.batch([
    db.prepare("UPDATE invoices SET status='overdue',updated_at=? WHERE organization_id=? AND due_date<? AND status IN ('issued','partially_paid')").bind(now,organizationId,today),
    db.prepare(`INSERT INTO receivable_alert_signals(invoice_id,organization_id,signal_active,first_detected_at,last_detected_at)
      SELECT id,organization_id,1,?,? FROM invoices WHERE organization_id=? AND status='overdue'
      ON CONFLICT(invoice_id) DO UPDATE SET signal_active=1,last_detected_at=excluded.last_detected_at,cleared_at=NULL`).bind(now,now,organizationId),
    db.prepare("UPDATE receivable_alert_signals SET signal_active=0,cleared_at=COALESCE(cleared_at,?) WHERE organization_id=? AND signal_active=1 AND invoice_id IN(SELECT id FROM invoices WHERE organization_id=? AND status!='overdue')").bind(now,organizationId,organizationId),
  ]);
}

export async function GET(){
  const auth=await context();if(auth.denied)return auth.denied;const user=auth.value!;
  try{await synchronizeOverdue(user.organizationId);const db=getD1();const [invoices,payments,orders,signals]=await Promise.all([
    db.prepare(`SELECT i.id,i.invoice_no invoiceNo,i.order_id orderId,o.order_no orderNo,i.customer_name customerName,i.currency,i.amount_cents amountCents,i.paid_cents paidCents,(i.amount_cents-i.paid_cents) balanceCents,i.status,i.issued_at issuedAt,i.due_date dueDate,i.created_at createdAt
      FROM invoices i JOIN orders o ON o.id=i.order_id AND o.organization_id=i.organization_id WHERE i.organization_id=? ORDER BY i.due_date,i.id DESC`).bind(user.organizationId).all(),
    db.prepare("SELECT id,invoice_id invoiceId,payment_reference paymentReference,amount_cents amountCents,method,paid_at paidAt,note,recorded_by recordedBy FROM invoice_payments WHERE organization_id=? ORDER BY paid_at DESC,id DESC LIMIT 500").bind(user.organizationId).all(),
    db.prepare(`SELECT o.id,o.order_no orderNo,o.customer,CAST(ROUND(COALESCE(SUM(oi.quantity*oi.unit_price),0)*100) AS INTEGER) amountCents FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id WHERE o.organization_id=? AND NOT EXISTS(SELECT 1 FROM invoices i WHERE i.organization_id=? AND i.order_id=o.id) GROUP BY o.id ORDER BY o.id DESC LIMIT 200`).bind(user.organizationId,user.organizationId).all(),
    db.prepare("SELECT invoice_id invoiceId,signal_active signalActive,first_detected_at firstDetectedAt,last_detected_at lastDetectedAt FROM receivable_alert_signals WHERE organization_id=? AND signal_active=1").bind(user.organizationId).all(),
  ]);const rows=(invoices.results??[]).map(row=>({...row,agingBucket:agingBucket(String((row as {dueDate:string}).dueDate))}));
  const aging=rows.reduce<Record<string,number>>((sum,row)=>{const item=row as {agingBucket:string;balanceCents:number;status:string};if(!["paid","void"].includes(item.status))sum[item.agingBucket]=(sum[item.agingBucket]??0)+Number(item.balanceCents);return sum},{});
  return Response.json({invoices:rows,payments:payments.results??[],orders:orders.results??[],signals:signals.results??[],aging,canManage:canManage(user)});
  }catch(error){return fail(error instanceof Error?error.message:"应收数据读取失败",500)}
}

export async function POST(request:Request){
  const auth=await context();if(auth.denied)return auth.denied;const user=auth.value!;if(!canManage(user))return fail("没有管理应收账款的权限",403);
  try{const body=await request.json() as Record<string,unknown>,action=text(body.action,30),db=getD1();
    if(action==="create"){
      const orderId=Number(body.orderId),dueDate=text(body.dueDate,10);if(!Number.isSafeInteger(orderId)||orderId<=0||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dueDate))return fail("请选择订单并填写有效到期日");
      const order=await db.prepare(`SELECT o.id,o.order_no orderNo,o.customer,CAST(ROUND(COALESCE(SUM(oi.quantity*oi.unit_price),0)*100) AS INTEGER) amountCents FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id WHERE o.id=? AND o.organization_id=? GROUP BY o.id`).bind(orderId,user.organizationId).first<{id:number;orderNo:string;customer:string;amountCents:number}>();
      if(!order)return fail("订单不存在",404);const amount=cents(order.amountCents),invoiceNo=`INV-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
      await db.prepare("INSERT INTO invoices(organization_id,invoice_no,order_id,customer_name,amount_cents,due_date,created_by) VALUES(?,?,?,?,?,?,?)").bind(user.organizationId,invoiceNo,order.id,order.customer,amount,dueDate,user.email).run();
      const invoice=await db.prepare("SELECT id FROM invoices WHERE organization_id=? AND invoice_no=?").bind(user.organizationId,invoiceNo).first<{id:number}>();await recordAudit(user,"invoice.created","invoice",String(invoice?.id??""),{orderId,amountCents:amount,currency:"MYR"});return Response.json({id:invoice?.id,invoiceNo,amountCents:amount},{status:201});
    }
    if(action==="payment"){
      const invoiceId=Number(body.invoiceId),amount=cents(body.amountCents),reference=text(body.paymentReference,100),paidAt=text(body.paidAt,30),method=text(body.method,40)||"bank_transfer";if(!Number.isSafeInteger(invoiceId)||invoiceId<=0||!reference||!paidAt)return fail("回款资料不完整");
      const existing=await db.prepare("SELECT invoice_id invoiceId,amount_cents amountCents FROM invoice_payments WHERE organization_id=? AND payment_reference=?").bind(user.organizationId,reference).first<{invoiceId:number;amountCents:number}>();
      if(existing){if(existing.invoiceId!==invoiceId||existing.amountCents!==amount)return fail("支付引用已用于另一笔回款",409);return Response.json({idempotent:true});}
      const invoice=await db.prepare("SELECT id,status,amount_cents amountCents,paid_cents paidCents FROM invoices WHERE id=? AND organization_id=?").bind(invoiceId,user.organizationId).first<{id:number;status:string;amountCents:number;paidCents:number}>();if(!invoice)return fail("发票不存在",404);if(!["issued","partially_paid","overdue"].includes(invoice.status))return fail("当前发票不能登记回款",409);if(amount>invoice.amountCents-invoice.paidCents)return fail("回款金额超过未收余额",409);
      await db.prepare("INSERT INTO invoice_payments(organization_id,invoice_id,payment_reference,amount_cents,method,paid_at,note,recorded_by) VALUES(?,?,?,?,?,?,?,?)").bind(user.organizationId,invoiceId,reference,amount,method,paidAt,text(body.note,500),user.email).run();await recordAudit(user,"invoice.payment_recorded","invoice",String(invoiceId),{paymentReference:reference,amountCents:amount,currency:"MYR"});return Response.json({idempotent:false});
    }return fail("未知操作");
  }catch(error){const message=error instanceof Error?error.message:"应收操作失败";return fail(message.includes("UNIQUE")?"该订单已生成发票":message,message.includes("INVALID_PAYMENT_OR_OVERPAYMENT")?409:400)}
}

export async function PATCH(request:Request){
  const auth=await context();if(auth.denied)return auth.denied;const user=auth.value!;if(!canManage(user))return fail("没有管理应收账款的权限",403);
  try{const body=await request.json() as Record<string,unknown>,id=Number(body.id),action=text(body.action,20) as "issue"|"void";if(!Number.isSafeInteger(id)||id<=0||!["issue","void"].includes(action))return fail("无效操作");const db=getD1(),invoice=await db.prepare("SELECT id,status,paid_cents paidCents FROM invoices WHERE id=? AND organization_id=?").bind(id,user.organizationId).first<{id:number;status:InvoiceStatus;paidCents:number}>();if(!invoice)return fail("发票不存在",404);if(action==="void"&&invoice.paidCents>0)return fail("已有回款的发票不能作废",409);const next=nextInvoiceStatus(invoice.status,action),now=new Date().toISOString();await db.prepare(`UPDATE invoices SET status=?,issued_at=CASE WHEN ?='issued' THEN COALESCE(issued_at,?) ELSE issued_at END,voided_at=CASE WHEN ?='void' THEN ? ELSE voided_at END,updated_at=? WHERE id=? AND organization_id=? AND status=?`).bind(next,next,now,next,now,now,id,user.organizationId,invoice.status).run();await recordAudit(user,`invoice.${action}`,"invoice",String(id),{fromStatus:invoice.status,toStatus:next});return Response.json({status:next});
  }catch(error){return fail(error instanceof Error?error.message:"发票状态更新失败",409)}
}
