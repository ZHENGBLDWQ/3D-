import {can,getAccessContext,recordAudit} from "../../access-control";
import {requireApiAccess} from "../../api-auth";
import {getD1} from "../../../db";
import {effectiveMaintenanceStatus} from "../../../maintenance/status";

const fail=(error:string,status:number)=>Response.json({error},{status});
const cleanItems=(value:unknown)=>Array.isArray(value)?value.map(String).map(v=>v.trim()).filter(Boolean).slice(0,30):[];
const allowedPrinter=(scope:number[],printerId:number)=>scope.length===0||scope.includes(printerId);

async function ownedPrinter(organizationId:number,printerId:number){
  return getD1().prepare(`SELECT p.id,p.name,p.total_hours totalHours,p.maintenance_due_at maintenanceDueAt
    FROM printers p JOIN printer_bindings pb ON pb.printer_id=p.id
    WHERE p.id=? AND pb.organization_id=?`).bind(printerId,organizationId).first<{id:number;name:string;totalHours:number;maintenanceDueAt:string|null}>();
}

export async function GET(){
  const denied=await requireApiAccess();if(denied)return denied;
  const context=await getAccessContext();if(!context)return fail("请先登录",401);
  const db=getD1(),scope=context.printerScope;
  const scopeSql=scope.length?` AND p.id IN (${scope.map(()=>"?").join(",")})`:"";
  const bindings=[context.organizationId,...scope];
  const [printers,plans,records]=await Promise.all([
    db.prepare(`SELECT p.id,p.name,p.model,p.total_hours totalHours,p.maintenance_due_at maintenanceDueAt,
      MAX(w.completed_at) lastExecutionAt
      FROM printers p JOIN printer_bindings pb ON pb.printer_id=p.id
      LEFT JOIN dispatch_workflows w ON w.printer_id=p.id AND w.organization_id=pb.organization_id
      WHERE pb.organization_id=?${scopeSql} GROUP BY p.id ORDER BY p.name`).bind(...bindings).all(),
    db.prepare(`SELECT mp.*,p.name printerName,p.total_hours totalHours,
      (SELECT MAX(w.completed_at) FROM dispatch_workflows w WHERE w.organization_id=mp.organization_id AND w.printer_id=mp.printer_id) lastExecutionAt
      FROM maintenance_plans mp JOIN printers p ON p.id=mp.printer_id
      WHERE mp.organization_id=?${scope.length?` AND mp.printer_id IN (${scope.map(()=>"?").join(",")})`:""}
      ORDER BY CASE mp.status WHEN 'overdue' THEN 0 WHEN 'due' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,mp.due_at,mp.id DESC`).bind(...bindings).all(),
    db.prepare(`SELECT mr.*,p.name printerName,mp.title FROM maintenance_records mr
      JOIN maintenance_plans mp ON mp.id=mr.plan_id AND mp.organization_id=mr.organization_id
      JOIN printers p ON p.id=mr.printer_id WHERE mr.organization_id=?${scope.length?` AND mr.printer_id IN (${scope.map(()=>"?").join(",")})`:""}
      ORDER BY mr.completed_at DESC LIMIT 100`).bind(...bindings).all(),
  ]);
  const normalized=(plans.results??[]).map(row=>({...row,effectiveStatus:effectiveMaintenanceStatus({status:String(row.status),dueAt:row.due_at?String(row.due_at):null,dueHours:row.due_hours==null?null:Number(row.due_hours),totalHours:Number(row.totalHours)||0})}));
  const fleet=(printers.results??[]).map(row=>({...row,maintenanceStatus:effectiveMaintenanceStatus({status:"scheduled",dueAt:row.maintenanceDueAt?String(row.maintenanceDueAt):null,totalHours:Number(row.totalHours)||0})}));
  return Response.json({canManage:can(context,"printers.control"),printers:fleet,plans:normalized,records:records.results??[]});
}

export async function POST(request:Request){
  const denied=await requireApiAccess(true,"printers.control");if(denied)return denied;
  const context=await getAccessContext();if(!context)return fail("请先登录",401);
  try{
    const body=await request.json() as {printerId?:number;title?:string;dueAt?:string;dueHours?:number;items?:unknown;notes?:string};
    const printerId=Number(body.printerId),title=String(body.title??"").trim().slice(0,120),items=cleanItems(body.items);
    if(!Number.isInteger(printerId)||!title)return fail("请选择打印机并填写保养计划名称",400);
    if(!allowedPrinter(context.printerScope,printerId))return fail("无权管理该打印机",403);
    const printer=await ownedPrinter(context.organizationId,printerId);if(!printer)return fail("打印机不存在或不属于当前组织",404);
    const rawDueHours=body.dueHours as unknown;
    const dueAt=body.dueAt?new Date(body.dueAt).toISOString():null,dueHours=rawDueHours==null||rawDueHours===""?null:Number(rawDueHours);
    if(dueHours!=null&&(!Number.isFinite(dueHours)||dueHours<printer.totalHours))return fail("计划工时不能小于设备当前累计工时",400);
    if(!dueAt&&dueHours==null)return fail("请至少设置到期日期或到期工时",400);
    const row=await getD1().prepare("INSERT INTO maintenance_plans(organization_id,printer_id,title,due_at,due_hours,items,notes,created_by) VALUES(?,?,?,?,?,?,?,?) RETURNING id").bind(context.organizationId,printerId,title,dueAt,dueHours,JSON.stringify(items),String(body.notes??"").trim().slice(0,1000),context.email).first<{id:number}>();
    await recordAudit(context,"maintenance.plan.created","maintenance_plan",String(row?.id??""),{printerId,dueAt,dueHours});
    return Response.json({id:row?.id},{status:201});
  }catch(error){return fail(error instanceof Error?error.message:"创建保养计划失败",400)}
}

export async function PATCH(request:Request){
  const denied=await requireApiAccess(true,"printers.control");if(denied)return denied;
  const context=await getAccessContext();if(!context)return fail("请先登录",401);
  try{
    const body=await request.json() as {planId?:number;action?:"start"|"cancel"|"complete";items?:unknown;costCents?:number;downtimeMinutes?:number;notes?:string;nextDueAt?:string};
    const planId=Number(body.planId),db=getD1();
    const plan=await db.prepare(`SELECT mp.id,mp.printer_id printerId,mp.status,p.total_hours totalHours FROM maintenance_plans mp
      JOIN printers p ON p.id=mp.printer_id JOIN printer_bindings pb ON pb.printer_id=p.id AND pb.organization_id=mp.organization_id
      WHERE mp.id=? AND mp.organization_id=?`).bind(planId,context.organizationId).first<{id:number;printerId:number;status:string;totalHours:number}>();
    if(!plan)return fail("保养计划不存在或不属于当前组织",404);
    if(!allowedPrinter(context.printerScope,plan.printerId))return fail("无权管理该打印机",403);
    const now=new Date().toISOString();
    if(body.action==="start"){
      if(!["scheduled","due","overdue"].includes(plan.status))return fail("当前状态不能开始保养",409);
      await db.prepare("UPDATE maintenance_plans SET status='in_progress',started_at=?,updated_at=? WHERE id=? AND organization_id=?").bind(now,now,plan.id,context.organizationId).run();
    }else if(body.action==="cancel"){
      if(["completed","cancelled"].includes(plan.status))return fail("当前状态不能取消",409);
      await db.prepare("UPDATE maintenance_plans SET status='cancelled',updated_at=? WHERE id=? AND organization_id=?").bind(now,plan.id,context.organizationId).run();
    }else if(body.action==="complete"){
      if(plan.status!=="in_progress")return fail("请先开始保养，再登记完成",409);
      const cost=Math.trunc(Number(body.costCents)||0),downtime=Math.trunc(Number(body.downtimeMinutes)||0),items=cleanItems(body.items);
      if(cost<0||downtime<0||!items.length)return fail("请填写保养项目，费用和停机时间不能为负数",400);
      const nextDueAt=body.nextDueAt?new Date(body.nextDueAt).toISOString():null;
      await db.batch([
        db.prepare("INSERT INTO maintenance_records(organization_id,plan_id,printer_id,items,cost_cents,downtime_minutes,operator_email,meter_hours,notes,completed_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(context.organizationId,plan.id,plan.printerId,JSON.stringify(items),cost,downtime,context.email,plan.totalHours,String(body.notes??"").trim().slice(0,1000),now),
        db.prepare("UPDATE maintenance_plans SET status='completed',completed_at=?,updated_at=? WHERE id=? AND organization_id=?").bind(now,now,plan.id,context.organizationId),
        db.prepare("UPDATE printers SET maintenance_due_at=COALESCE(?,maintenance_due_at),updated_at=? WHERE id=?").bind(nextDueAt,now,plan.printerId),
      ]);
    }else return fail("不支持的保养操作",400);
    await recordAudit(context,`maintenance.plan.${body.action}`,"maintenance_plan",String(plan.id),{printerId:plan.printerId});
    return Response.json({id:plan.id,status:body.action});
  }catch(error){
    const message=error instanceof Error?error.message:"更新保养计划失败";
    if(message.includes("UNIQUE constraint failed"))return fail("该计划已经完成并登记，不能重复提交",409);
    return fail(message,400);
  }
}
