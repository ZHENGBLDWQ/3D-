import {getD1} from "../../../db";
import {can,getAccessContext,recordAudit,ROLES,type Role} from "../../access-control";
import {hashPassword} from "../../session-auth";

const fail=(status:number,error:string)=>Response.json({error},{status});
async function manager(){const context=await getAccessContext();if(!context)return{error:fail(401,"请先登录")};if(!can(context,"team.manage"))return{error:fail(403,"只有企业管理员可以管理员工")};return{context}}

export async function GET(){
  const access=await manager();if(access.error)return access.error;const context=access.context!;
  const [members,logs]=await Promise.all([
    getD1().prepare("SELECT id,email,display_name AS displayName,role,status,printer_scope AS printerScope,last_login_at AS lastLoginAt,created_at AS createdAt FROM organization_members WHERE organization_id=? ORDER BY created_at DESC").bind(context.organizationId).all(),
    getD1().prepare("SELECT id,actor_email AS actorEmail,action,resource,resource_id AS resourceId,created_at AS createdAt FROM audit_logs WHERE organization_id=? ORDER BY id DESC LIMIT 100").bind(context.organizationId).all(),
  ]);
  return Response.json({members:members.results,logs:logs.results,current:context,roles:ROLES});
}

export async function POST(request:Request){
  const access=await manager();if(access.error)return access.error;const context=access.context!;
  const body=await request.json() as {email?:string;displayName?:string;role?:Role;password?:string};
  const email=String(body.email||"").trim().toLowerCase(),password=String(body.password||"");
  if(!email.includes("@"))return fail(400,"请输入有效邮箱");
  if(password.length<10)return fail(400,"初始密码至少需要 10 位");
  if(!ROLES.includes(body.role as Role)||body.role==="owner")return fail(400,"不能通过邀请创建超级管理员");
  try{
    const passwordHash=await hashPassword(password);
    await getD1().prepare("INSERT INTO organization_members(organization_id,email,display_name,role,status,printer_scope,invited_by,password_hash) VALUES(?,?,?,?,?,'[]',?,?)")
      .bind(context.organizationId,email,String(body.displayName||""),body.role,"active",context.email,passwordHash).run();
    await recordAudit(context,"member.created","member",email,{role:body.role});
    return Response.json({ok:true},{status:201});
  }catch{return fail(409,"该邮箱已经加入系统")}
}

export async function PATCH(request:Request){
  const access=await manager();if(access.error)return access.error;const context=access.context!;
  const body=await request.json() as {id?:number;role?:Role;status?:string;password?:string};
  if(!body.id)return fail(400,"缺少员工编号");
  const db=getD1(),target=await db.prepare("SELECT role,email FROM organization_members WHERE id=? AND organization_id=?").bind(body.id,context.organizationId).first<{role:Role;email:string}>();
  if(!target)return fail(404,"员工不存在");if(target.role==="owner")return fail(400,"不能修改超级管理员");
  if(body.password!==undefined){
    if(body.password.length<10)return fail(400,"新密码至少需要 10 位");
    await db.prepare("UPDATE organization_members SET password_hash=?,status='active' WHERE id=? AND organization_id=?").bind(await hashPassword(body.password),body.id,context.organizationId).run();
    await recordAudit(context,"member.password_reset","member",String(body.id));
    return Response.json({ok:true});
  }
  const role=ROLES.includes(body.role as Role)&&body.role!=="owner"?body.role:target.role,status=["active","disabled"].includes(body.status||"")?body.status:"active";
  await db.prepare("UPDATE organization_members SET role=?,status=? WHERE id=? AND organization_id=?").bind(role,status,body.id,context.organizationId).run();
  await recordAudit(context,"member.updated","member",String(body.id),{role,status});return Response.json({ok:true});
}
