import {getD1} from "../../../db";
import {can,getAccessContext,recordAudit} from "../../access-control";
import {requireApiAccess} from "../../api-auth";
import {priceLine} from "../../../quotes/pricing";

const error=(message:string,status=400)=>Response.json({error:message},{status});
const text=(value:unknown,max=500)=>String(value??"").trim().slice(0,max);
const positiveId=(value:unknown)=>{const id=Number(value);return Number.isInteger(id)&&id>0?id:0};

export async function GET(){
  const denied=await requireApiAccess();if(denied)return denied;
  const context=await getAccessContext();if(!context)return error("请先登录",401);
  const db=getD1();
  const [customers,quotes,items,products]=await Promise.all([
    db.prepare(`SELECT c.id,c.customer_no customerNo,c.name,c.status,c.tax_id taxId,c.billing_address billingAddress,
      COALESCE((SELECT json_group_array(json_object('id',cc.id,'name',cc.name,'email',cc.email,'phone',cc.phone,'title',cc.title,'isPrimary',cc.is_primary)) FROM customer_contacts cc WHERE cc.customer_id=c.id AND cc.organization_id=c.organization_id),'[]') contacts
      FROM customers c WHERE c.organization_id=? ORDER BY c.name`).bind(context.organizationId).all(),
    db.prepare(`SELECT q.id,q.quote_no quoteNo,q.status,q.current_version currentVersion,q.valid_until validUntil,q.accepted_order_id acceptedOrderId,q.accepted_at acceptedAt,c.name customerName,v.id versionId,v.target_margin_basis_points targetMarginBasisPoints,v.subtotal_cents subtotalCents,v.cost_cents costCents,v.notes
      FROM quotes q JOIN customers c ON c.id=q.customer_id AND c.organization_id=q.organization_id JOIN quote_versions v ON v.quote_id=q.id AND v.version_no=q.current_version AND v.organization_id=q.organization_id
      WHERE q.organization_id=? ORDER BY q.created_at DESC LIMIT 200`).bind(context.organizationId).all(),
    db.prepare(`SELECT qi.id,qi.quote_version_id quoteVersionId,qi.item_id itemId,p.sku,p.name,qi.description,qi.quantity,qi.unit_cost_cents unitCostCents,qi.suggested_unit_price_cents suggestedUnitPriceCents,qi.unit_price_cents unitPriceCents
      FROM quote_items qi JOIN print_items p ON p.id=qi.item_id WHERE qi.organization_id=? ORDER BY qi.id`).bind(context.organizationId).all(),
    db.prepare(`SELECT p.id,p.sku,p.name,ROUND(COALESCE(SUM(im.grams_per_item*(1+im.waste_percent/100.0)*b.cost_per_kg/10.0),0)) unitCostCents FROM print_items p LEFT JOIN item_materials im ON im.item_id=p.id LEFT JOIN material_batches b ON b.id=im.batch_id GROUP BY p.id ORDER BY p.name`).all(),
  ]);
  return Response.json({customers:customers.results??[],quotes:quotes.results??[],items:items.results??[],products:products.results??[]});
}

export async function POST(request:Request){
  const denied=await requireApiAccess(true);if(denied)return denied;
  const context=await getAccessContext();if(!context)return error("请先登录",401);
  if(!can(context,"write"))return error("没有客户与报价写入权限",403);
  const body=await request.json() as Record<string,unknown>,action=text(body.action,30),db=getD1();
  try{
    if(action==="customer"){
      const name=text(body.name,200);if(!name)return error("客户名称不能为空");
      const customerNo=text(body.customerNo,80)||`CUS-${Date.now()}`;
      await db.prepare("INSERT INTO customers(organization_id,customer_no,name,tax_id,billing_address,notes,created_by) VALUES(?,?,?,?,?,?,?)").bind(context.organizationId,customerNo,name,text(body.taxId,100),text(body.billingAddress,1000),text(body.notes,2000),context.email).run();
      const customer=await db.prepare("SELECT id FROM customers WHERE organization_id=? AND customer_no=?").bind(context.organizationId,customerNo).first<{id:number}>();
      const contact=body.contact as Record<string,unknown>|undefined;
      if(customer&&contact&&text(contact.name,120))await db.prepare("INSERT INTO customer_contacts(organization_id,customer_id,name,email,phone,title,is_primary) VALUES(?,?,?,?,?,?,1)").bind(context.organizationId,customer.id,text(contact.name,120),text(contact.email,200),text(contact.phone,80),text(contact.title,100)).run();
      await recordAudit(context,"customer.created","customer",String(customer?.id??""),{customerNo});return Response.json({id:customer?.id},{status:201});
    }
    if(action==="quote"){
      const customerId=positiveId(body.customerId),contactId=positiveId(body.contactId)||null,margin=Math.trunc(Number(body.targetMarginBasisPoints??3000));
      const customer=await db.prepare("SELECT id FROM customers WHERE id=? AND organization_id=? AND status='active'").bind(customerId,context.organizationId).first();if(!customer)return error("客户不存在或不属于当前组织",404);
      if(contactId&&!(await db.prepare("SELECT id FROM customer_contacts WHERE id=? AND customer_id=? AND organization_id=?").bind(contactId,customerId,context.organizationId).first()))return error("联系人不属于所选客户",400);
      const rawItems=Array.isArray(body.items)?body.items as Record<string,unknown>[]:[];if(!rawItems.length)return error("报价至少需要一个明细");
      const priced=[];const usedItems=new Set<number>();for(const raw of rawItems){const itemId=positiveId(raw.itemId);if(usedItems.has(itemId))return error("同一产品请合并为一条报价明细");usedItems.add(itemId);const product=await db.prepare(`SELECT p.id,p.name,COALESCE(SUM(im.grams_per_item*(1+im.waste_percent/100.0)*b.cost_per_kg/10.0),0) materialCostCents FROM print_items p LEFT JOIN item_materials im ON im.item_id=p.id LEFT JOIN material_batches b ON b.id=im.batch_id WHERE p.id=? GROUP BY p.id`).bind(itemId).first<{id:number;name:string;materialCostCents:number}>();if(!product)return error("报价产品不存在",404);priced.push({itemId,description:text(raw.description,500)||product.name,...priceLine({quantity:Number(raw.quantity),unitCostCents:Number(raw.unitCostCents??product.materialCostCents),targetMarginBasisPoints:margin,unitPriceCents:raw.unitPriceCents===undefined?undefined:Number(raw.unitPriceCents)})});}
      const quoteNo=text(body.quoteNo,80)||`QT-${Date.now()}`,validUntil=text(body.validUntil,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(validUntil))return error("请输入有效期");
      const cost=priced.reduce((sum,row)=>sum+row.costCents,0),subtotal=priced.reduce((sum,row)=>sum+row.subtotalCents,0);
      await db.batch([db.prepare("INSERT INTO quotes(organization_id,quote_no,customer_id,contact_id,valid_until,created_by) VALUES(?,?,?,?,?,?)").bind(context.organizationId,quoteNo,customerId,contactId,validUntil,context.email),db.prepare("INSERT INTO quote_versions(organization_id,quote_id,version_no,target_margin_basis_points,subtotal_cents,cost_cents,notes,created_by) SELECT ?,id,1,?,?,?,?,? FROM quotes WHERE organization_id=? AND quote_no=?").bind(context.organizationId,margin,subtotal,cost,text(body.notes,2000),context.email,context.organizationId,quoteNo)]);
      const version=await db.prepare("SELECT v.id,q.id quoteId FROM quote_versions v JOIN quotes q ON q.id=v.quote_id WHERE q.organization_id=? AND q.quote_no=? AND v.version_no=1").bind(context.organizationId,quoteNo).first<{id:number;quoteId:number}>();if(!version)throw new Error("QUOTE_CREATE_FAILED");
      await db.batch(priced.map(row=>db.prepare("INSERT INTO quote_items(organization_id,quote_version_id,item_id,description,quantity,unit_cost_cents,suggested_unit_price_cents,unit_price_cents) VALUES(?,?,?,?,?,?,?,?)").bind(context.organizationId,version.id,row.itemId,row.description,row.quantity,row.unitCostCents,row.suggestedUnitPriceCents,row.unitPriceCents)));
      await recordAudit(context,"quote.created","quote",String(version.quoteId),{quoteNo,subtotalCents:subtotal,costCents:cost});return Response.json({id:version.quoteId},{status:201});
    }
    if(action==="accept"){
      const quoteId=positiveId(body.quoteId),quote=await db.prepare(`SELECT q.id,q.quote_no quoteNo,q.status,q.valid_until validUntil,q.accepted_order_id acceptedOrderId,c.name customerName,v.id versionId FROM quotes q JOIN customers c ON c.id=q.customer_id AND c.organization_id=q.organization_id JOIN quote_versions v ON v.quote_id=q.id AND v.version_no=q.current_version WHERE q.id=? AND q.organization_id=?`).bind(quoteId,context.organizationId).first<{id:number;quoteNo:string;status:string;validUntil:string;acceptedOrderId:number|null;customerName:string;versionId:number}>();
      if(!quote)return error("报价不存在或不属于当前组织",404);if(quote.acceptedOrderId)return Response.json({orderId:quote.acceptedOrderId,idempotent:true});if(!["draft","sent"].includes(quote.status))return error("当前报价状态不能接受",409);if(quote.validUntil<new Date().toISOString().slice(0,10))return error("报价已过有效期",409);
      const orderNo=`ORD-${quote.quoteNo}`,claimToken=crypto.randomUUID();
      await db.batch([db.prepare("INSERT OR IGNORE INTO quote_order_conversions(quote_id,organization_id,claim_token) SELECT id,organization_id,? FROM quotes WHERE id=? AND organization_id=? AND accepted_order_id IS NULL").bind(claimToken,quote.id,context.organizationId),db.prepare("INSERT OR IGNORE INTO orders(organization_id,order_no,customer,status) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM quote_order_conversions WHERE quote_id=? AND organization_id=? AND claim_token=?)").bind(context.organizationId,orderNo,quote.customerName,"待确认",quote.id,context.organizationId,claimToken),db.prepare(`INSERT INTO order_items(order_id,item_id,quantity,unit_price) SELECT o.id,qi.item_id,qi.quantity,qi.unit_price_cents/100.0 FROM orders o JOIN quote_items qi ON qi.quote_version_id=? AND qi.organization_id=? WHERE o.organization_id=? AND o.order_no=? AND EXISTS(SELECT 1 FROM quote_order_conversions WHERE quote_id=? AND organization_id=? AND claim_token=?)`).bind(quote.versionId,context.organizationId,context.organizationId,orderNo,quote.id,context.organizationId,claimToken),db.prepare("UPDATE quote_order_conversions SET order_id=(SELECT id FROM orders WHERE organization_id=? AND order_no=?) WHERE quote_id=? AND organization_id=? AND claim_token=?").bind(context.organizationId,orderNo,quote.id,context.organizationId,claimToken),db.prepare("UPDATE quotes SET status='accepted',accepted_order_id=(SELECT order_id FROM quote_order_conversions WHERE quote_id=? AND organization_id=? AND claim_token=?),accepted_at=COALESCE(accepted_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND accepted_order_id IS NULL").bind(quote.id,context.organizationId,claimToken,quote.id,context.organizationId)]);
      const accepted=await db.prepare("SELECT accepted_order_id orderId FROM quotes WHERE id=? AND organization_id=?").bind(quote.id,context.organizationId).first<{orderId:number}>();if(!accepted?.orderId)throw new Error("QUOTE_ACCEPT_FAILED");await recordAudit(context,"quote.accepted","quote",String(quote.id),{orderId:accepted.orderId});return Response.json({orderId:accepted.orderId,idempotent:false});
    }
    return error("不支持的操作");
  }catch(cause){const message=cause instanceof Error?cause.message:"报价操作失败";if(message.includes("UNIQUE constraint failed"))return error("编号已存在",409);const known:Record<string,string>={QUOTE_MARGIN_INVALID:"目标毛利率必须小于 100%",QUOTE_QUANTITY_INVALID:"数量必须大于零"};return error(known[message]??message,400);}
}

export async function PATCH(request:Request){
  const denied=await requireApiAccess(true);if(denied)return denied;
  const context=await getAccessContext();if(!context)return error("请先登录",401);
  if(!can(context,"write"))return error("没有报价管理权限",403);
  const body=await request.json() as Record<string,unknown>,quoteId=positiveId(body.quoteId),next=text(body.status,20),db=getD1();
  const quote=await db.prepare("SELECT id,status,accepted_order_id acceptedOrderId FROM quotes WHERE id=? AND organization_id=?").bind(quoteId,context.organizationId).first<{id:number;status:string;acceptedOrderId:number|null}>();
  if(!quote)return error("报价不存在或不属于当前组织",404);
  const transitions:Record<string,string[]>={draft:["sent","rejected"],sent:["rejected"]};
  if(quote.acceptedOrderId||!transitions[quote.status]?.includes(next))return error("不允许的报价状态转换",409);
  await db.prepare("UPDATE quotes SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND status=?").bind(next,quote.id,context.organizationId,quote.status).run();
  await recordAudit(context,"quote.status_changed","quote",String(quote.id),{from:quote.status,to:next});
  return Response.json({id:quote.id,status:next});
}
