import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { printers } from "../../../db/schema";
import { requireApiAccess } from "../../api-auth";

async function sha256(value:string){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");}

export async function GET(){const denied=await requireApiAccess();if(denied)return denied;try{const rows=await getDb().select().from(printers).orderBy(desc(printers.createdAt));return Response.json({printers:rows});}catch(error){return Response.json({error:error instanceof Error?error.message:"读取设备失败"},{status:500});}}

export async function POST(request:Request){
  const denied=await requireApiAccess(true);if(denied)return denied;
  try{const p=await request.json() as Record<string,unknown>;if(!p.name)return Response.json({error:"设备名称必填"},{status:400});const [row]=await getDb().insert(printers).values({name:String(p.name),model:String(p.model||""),technology:String(p.technology||"FDM"),location:String(p.location||""),nozzleDiameter:Number(p.nozzleDiameter||0.4),buildVolume:String(p.buildVolume||""),status:String(p.status||"空闲"),totalHours:Number(p.totalHours||0),maintenanceDueAt:p.maintenanceDueAt?String(p.maintenanceDueAt):null,notes:String(p.notes||"")}).returning();return Response.json({row},{status:201});}catch(error){const message=error instanceof Error?error.message:"保存失败";return Response.json({error:message.includes("UNIQUE")?"设备名称已存在":message},{status:500});}
}

export async function PATCH(request:Request){
  const denied=await requireApiAccess(true);if(denied)return denied;
  try{const p=await request.json() as {id?:number;status?:string;totalHours?:number;maintenanceDueAt?:string|null;action?:string;connectorType?:string};if(!p.id)return Response.json({error:"缺少设备标识"},{status:400});if(p.action==="rotateToken"){const token=`lt_${crypto.randomUUID().replaceAll("-","")}_${crypto.randomUUID().replaceAll("-","")}`;const [row]=await getDb().update(printers).set({connectorType:p.connectorType||"moonraker",connectorTokenHash:await sha256(token),connectionState:"等待代理连接"}).where(eq(printers.id,p.id)).returning();return Response.json({row,token});}const [row]=await getDb().update(printers).set({status:p.status,totalHours:p.totalHours,maintenanceDueAt:p.maintenanceDueAt}).where(eq(printers.id,p.id)).returning();return Response.json({row});}catch(error){return Response.json({error:error instanceof Error?error.message:"更新失败"},{status:500});}
}

export async function DELETE(request:Request){const denied=await requireApiAccess(true);if(denied)return denied;try{const id=Number(new URL(request.url).searchParams.get("id"));if(!id)return Response.json({error:"缺少设备标识"},{status:400});await getDb().delete(printers).where(eq(printers.id,id));return Response.json({ok:true});}catch(error){return Response.json({error:error instanceof Error?error.message:"删除失败"},{status:500});}}
