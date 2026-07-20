import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { printerCommands, printers } from "../../../db/schema";

async function sha256(value:string){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");}

export async function POST(request:Request){
  try{
    const authorization=request.headers.get("authorization")||"";
    const token=authorization.startsWith("Bearer ")?authorization.slice(7):"";
    if(!token)return Response.json({error:"缺少代理令牌"},{status:401});
    const [printer]=await getDb().select().from(printers).where(eq(printers.connectorTokenHash,await sha256(token))).limit(1);
    if(!printer)return Response.json({error:"代理令牌无效"},{status:401});
    const body=await request.json() as {state?:string;nozzleTemp?:number;bedTemp?:number;filename?:string;progress?:number;totalHours?:number;ack?:{id:number;ok:boolean;result?:string}};
    const state=body.state||"在线";
    const mappedStatus=state==="printing"?"打印中":state==="paused"?"已暂停":state==="error"?"故障":printer.status;
    const [row]=await getDb().update(printers).set({connectionState:state,status:mappedStatus,lastSeenAt:new Date().toISOString(),nozzleTemp:Number.isFinite(body.nozzleTemp)?body.nozzleTemp:null,bedTemp:Number.isFinite(body.bedTemp)?body.bedTemp:null,currentFile:body.filename||null,remoteProgress:Number.isFinite(body.progress)?body.progress:null,totalHours:Number.isFinite(body.totalHours)?body.totalHours:printer.totalHours}).where(eq(printers.id,printer.id)).returning();
    if(body.ack?.id){await getDb().update(printerCommands).set({status:body.ack.ok?"已完成":"失败",result:body.ack.result||"",completedAt:new Date().toISOString()}).where(eq(printerCommands.id,body.ack.id));}
    const [command]=await getDb().select().from(printerCommands).where(and(eq(printerCommands.printerId,printer.id),eq(printerCommands.status,"待执行"))).orderBy(asc(printerCommands.createdAt)).limit(1);
    return Response.json({ok:true,printer:{id:row.id,name:row.name},command:command?{id:command.id,name:command.command}:null});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"代理上报失败"},{status:500});}
}
