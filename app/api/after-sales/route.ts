import {can,getAccessContext,recordAudit} from "../../access-control";
import {requireApiAccess} from "../../api-auth";
import {getD1} from "../../../db";
import {canTransition,normalizeRefundCents,slaState} from "../../../after-sales/workflow";

const error=(message:string,status=400)=>Response.json({error:message},{status});
const id=(value:unknown)=>{const result=Number(value);return Number.isInteger(result)&&result>0?result:0};
const text=(value:unknown,max=1000)=>String(value??"").trim().slice(0,max);

export async function GET(){
  const denied=await requireApiAccess();if(denied)return denied;
  const context=await getAccessContext();if(!context)return error("请先登录",401);
  const db=getD1();
  const [cases,events,reworks,customers,orders,items]=await Promise.all([
    db.prepare(`SELECT c.id,c.case_no caseNo,c.customer_id customerId,cu.name customerName,c.order_id orderId,o.order_no orderNo,c.shipment_id shipmentId,c.item_id itemId,i.name itemName,c.status,c.priority,c.subject,c.description,c.responsibility,c.root_cause rootCause,c.disposition,c.refund_cents refundCents,c.sla_due_at slaDueAt,c.resolved_at resolvedAt,c.closed_at closedAt,c.created_at createdAt
      FROM customer_cases c JOIN customers cu ON cu.id=c.customer_id AND cu.organization_id=c.organization_id LEFT JOIN orders o ON o.id=c.order_id AND o.organization_id=c.organization_id LEFT JOIN print_items i ON i.id=c.item_id
      WHERE c.organization_id=? ORDER BY CASE WHEN c.status IN ('resolved','closed') THEN 1 ELSE 0 END,c.sla_due_at,c.id DESC LIMIT 200`).bind(context.organizationId).all<Record<string,unknown>>(),
    db.prepare("SELECT id,case_id caseId,event_type eventType,from_status fromStatus,to_status toStatus,note,detail,actor_email actorEmail,created_at createdAt FROM case_events WHERE organization_id=? ORDER BY id DESC LIMIT 300").bind(context.organizationId).all(),
    db.prepare(`SELECT r.id,r.case_id caseId,r.quantity,r.reason,r.job_id jobId,r.created_at createdAt,j.job_no jobNo,j.status jobStatus FROM rework_orders r LEFT JOIN print_jobs j ON j.id=r.job_id AND j.organization_id=r.organization_id WHERE r.organization_id=? ORDER BY r.id DESC`).bind(context.organizationId).all(),
    db.prepare("SELECT id,name FROM customers WHERE organization_id=? AND status='active' ORDER BY name").bind(context.organizationId).all(),
    db.prepare("SELECT id,order_no orderNo,customer FROM orders WHERE organization_id=? ORDER BY id DESC LIMIT 300").bind(context.organizationId).all(),
    db.prepare("SELECT id,sku,name FROM print_items ORDER BY name").all(),
  ]);
  const now=new Date();
  return Response.json({
    canEdit:can(context,"write"),
    cases:(cases.results??[]).map(row=>({...row,slaState:slaState(String(row.status),String(row.slaDueAt),now)})),
    events:events.results??[],reworks:reworks.results??[],customers:customers.results??[],orders:orders.results??[],items:items.results??[],
  });
}

export async function POST(request:Request){
  const denied=await requireApiAccess(true);if(denied)return denied;
  const context=await getAccessContext();if(!context)return error("请先登录",401);
  if(!can(context,"write"))return error("没有售后管理权限",403);
  const body=await request.json() as Record<string,unknown>,action=text(body.action,30),db=getD1();
  try{
    if(action==="case"){
      const customerId=id(body.customerId),orderId=id(body.orderId)||null,itemId=id(body.itemId)||null,shipmentId=id(body.shipmentId)||null;
      const customer=await db.prepare("SELECT id FROM customers WHERE id=? AND organization_id=? AND status='active'").bind(customerId,context.organizationId).first();
      if(!customer)return error("客户不存在或不属于当前组织",404);
      if(orderId&&!(await db.prepare("SELECT id FROM orders WHERE id=? AND organization_id=?").bind(orderId,context.organizationId).first()))return error("订单不存在或不属于当前组织",404);
      const subject=text(body.subject,240),description=text(body.description,3000);if(!subject)return error("问题主题不能为空");
      const hours=Math.trunc(Number(body.slaHours??48));if(!Number.isInteger(hours)||hours<1||hours>8760)return error("SLA 时限应为 1 至 8760 小时");
      const caseNo=text(body.caseNo,80)||`CASE-${Date.now()}`,dueAt=new Date(Date.now()+hours*3600000).toISOString();
      await db.prepare(`INSERT INTO customer_cases(organization_id,case_no,customer_id,order_id,shipment_id,item_id,priority,subject,description,sla_due_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(context.organizationId,caseNo,customerId,orderId,shipmentId,itemId,text(body.priority,20)||"normal",subject,description,dueAt,context.email).run();
      const created=await db.prepare("SELECT id FROM customer_cases WHERE organization_id=? AND case_no=?").bind(context.organizationId,caseNo).first<{id:number}>();
      if(!created)throw new Error("CASE_CREATE_FAILED");
      await db.prepare("INSERT INTO case_events(organization_id,case_id,event_type,to_status,note,actor_email) VALUES(?,?,'created','opened',?,?)").bind(context.organizationId,created.id,description,context.email).run();
      await recordAudit(context,"after_sales.case_created","customer_case",String(created.id),{caseNo,slaDueAt:dueAt});
      return Response.json({id:created.id},{status:201});
    }
    if(action==="rework"){
      const caseId=id(body.caseId),quantity=Math.trunc(Number(body.quantity)),reason=text(body.reason,1000),key=text(body.idempotencyKey,120);
      if(!caseId||!Number.isInteger(quantity)||quantity<1||!reason||!key)return error("返工数量、原因和幂等键不能为空");
      const existing=await db.prepare("SELECT id,job_id jobId FROM rework_orders WHERE organization_id=? AND idempotency_key=?").bind(context.organizationId,key).first<{id:number;jobId:number|null}>();
      if(existing?.jobId)return Response.json({reworkId:existing.id,jobId:existing.jobId,idempotent:true});
      const supportCase=await db.prepare("SELECT id,status,order_id orderId,item_id itemId FROM customer_cases WHERE id=? AND organization_id=?").bind(caseId,context.organizationId).first<{id:number;status:string;orderId:number|null;itemId:number|null}>();
      if(!supportCase)return error("售后问题不存在或不属于当前组织",404);if(!supportCase.itemId)return error("创建返工前必须关联产品",409);if(supportCase.status==="closed")return error("已关闭问题需要先重新打开",409);
      const claimToken=crypto.randomUUID();
      await db.batch([
        db.prepare("INSERT OR IGNORE INTO rework_orders(organization_id,case_id,order_id,item_id,quantity,reason,idempotency_key,claim_token,created_by) VALUES(?,?,?,?,?,?,?,?,?)").bind(context.organizationId,caseId,supportCase.orderId,supportCase.itemId,quantity,reason,key,claimToken,context.email),
        db.prepare(`INSERT INTO print_jobs(organization_id,job_no,item_id,order_id,printer_name,status,progress,quantity,priority,material_deducted)
          SELECT organization_id,'RW-'||id,item_id,order_id,'','排队',0,quantity,2,0 FROM rework_orders WHERE organization_id=? AND claim_token=? AND job_id IS NULL`).bind(context.organizationId,claimToken),
        db.prepare("UPDATE rework_orders SET job_id=(SELECT id FROM print_jobs WHERE job_no='RW-'||rework_orders.id AND organization_id=rework_orders.organization_id) WHERE organization_id=? AND claim_token=? AND job_id IS NULL").bind(context.organizationId,claimToken),
      ]);
      const created=await db.prepare("SELECT id,job_id jobId FROM rework_orders WHERE organization_id=? AND idempotency_key=?").bind(context.organizationId,key).first<{id:number;jobId:number|null}>();
      if(!created?.jobId)throw new Error("REWORK_CREATE_FAILED");
      await db.prepare("INSERT INTO case_events(organization_id,case_id,event_type,note,detail,actor_email) VALUES(?,?,'rework_created',?,?,?)").bind(context.organizationId,caseId,reason,JSON.stringify({reworkId:created.id,jobId:created.jobId}),context.email).run();
      await recordAudit(context,"after_sales.rework_created","customer_case",String(caseId),{reworkId:created.id,jobId:created.jobId});
      return Response.json({reworkId:created.id,jobId:created.jobId,idempotent:false},{status:201});
    }
    return error("不支持的操作");
  }catch(cause){const message=cause instanceof Error?cause.message:"售后操作失败";if(message.includes("UNIQUE constraint failed"))return error("编号或幂等键已存在",409);return error(message,400)}
}

export async function PATCH(request:Request){
  const denied=await requireApiAccess(true);if(denied)return denied;
  const context=await getAccessContext();if(!context)return error("请先登录",401);if(!can(context,"write"))return error("没有售后管理权限",403);
  const body=await request.json() as Record<string,unknown>,caseId=id(body.caseId),next=text(body.status,30),db=getD1();
  const current=await db.prepare("SELECT id,status FROM customer_cases WHERE id=? AND organization_id=?").bind(caseId,context.organizationId).first<{id:number;status:string}>();
  if(!current)return error("售后问题不存在或不属于当前组织",404);if(!canTransition(current.status,next))return error("不允许的售后状态转换",409);
  let refundCents:number;try{refundCents=normalizeRefundCents(body.refundCents)}catch{return error("退款金额必须是非负整数 cents")}
  const responsibility=text(body.responsibility,300),rootCause=text(body.rootCause,1000),disposition=text(body.disposition,1000),note=text(body.note,2000),now=new Date().toISOString();
  await db.batch([
    db.prepare(`UPDATE customer_cases SET status=?,responsibility=?,root_cause=?,disposition=?,refund_cents=?,resolved_at=CASE WHEN ?='resolved' THEN ? WHEN ?='reopened' THEN NULL ELSE resolved_at END,closed_at=CASE WHEN ?='closed' THEN ? WHEN ?='reopened' THEN NULL ELSE closed_at END,updated_at=? WHERE id=? AND organization_id=? AND status=?`).bind(next,responsibility,rootCause,disposition,refundCents,next,now,next,next,now,next,now,caseId,context.organizationId,current.status),
    db.prepare("INSERT INTO case_events(organization_id,case_id,event_type,from_status,to_status,note,detail,actor_email) VALUES(?,?,'status_changed',?,?,?,?,?)").bind(context.organizationId,caseId,current.status,next,note,JSON.stringify({responsibility,rootCause,disposition,refundCents}),context.email),
  ]);
  await recordAudit(context,"after_sales.status_changed","customer_case",String(caseId),{from:current.status,to:next,refundCents});
  return Response.json({id:caseId,status:next});
}
