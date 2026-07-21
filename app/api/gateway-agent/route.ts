import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../../db";
import { bambuAmsSlots, gatewayDiscoveries, gatewayTokens, localGateways, printerBindings, printerCommands, printerEvents, printers } from "../../../db/schema";
import { PRINTER_EVENT_TYPES, type PrinterEvent } from "../../../shared/contracts/events";
import { synchronizeExecutionEvent } from "../../../execution/sync";
import { projectMonitorEvent } from "./monitor-projection";

async function digest(value:string){const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,"0")).join("")}
async function authorize(request:Request){const value=request.headers.get("authorization")||"";if(!value.startsWith("Bearer "))return null;const token=value.slice(7);if(!token.startsWith("ltgw_")||token.length>180)return null;const db=getDb();const [row]=await db.select({token:gatewayTokens,gateway:localGateways}).from(gatewayTokens).innerJoin(localGateways,eq(gatewayTokens.gatewayId,localGateways.id)).where(and(eq(gatewayTokens.tokenHash,await digest(token)),isNull(gatewayTokens.revokedAt))).limit(1);if(row)await db.update(gatewayTokens).set({lastUsedAt:new Date().toISOString()}).where(eq(gatewayTokens.id,row.token.id));return row?.gateway||null}
const denied=()=>Response.json({error:"无效或已撤销的网关令牌"},{status:401});
function publicData(value:unknown):unknown{if(Array.isArray(value))return value.map(publicData);if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([key])=>!/(access.?code|password|secret|token|credential)/i.test(key)).map(([key,item])=>[key,publicData(item)]));return value}

export async function GET(request:Request){const gateway=await authorize(request);if(!gateway)return denied();return Response.json({mode:"monitor_only",commands:[]})}

export async function POST(request:Request){
  const gateway=await authorize(request);if(!gateway)return denied();
  const body=await request.json() as {type?:string;heartbeat?:Record<string,unknown>;devices?:Array<Record<string,unknown>>;events?:PrinterEvent[];receipts?:Array<{idempotencyKey:string;status:string;acknowledgedAt:string;deviceMessage?:string;retryable?:boolean}>};
  const db=getDb(),now=new Date().toISOString();
  if(body.type==="heartbeat"){
    const heartbeat=body.heartbeat||{};
    await db.update(localGateways).set({status:String(heartbeat.status||"online"),version:String(heartbeat.version||gateway.version),metadata:JSON.stringify(publicData({...heartbeat.diagnostics,mode:"monitor_only"})),lastSeenAt:now,updatedAt:now}).where(eq(localGateways.id,gateway.id));
    return Response.json({ok:true,mode:"monitor_only",serverTime:now});
  }
  if(body.type==="discovery"){
    for(const raw of body.devices||[]){const deviceId=String(raw.deviceId||"").slice(0,160),serial=String(raw.serial||"").slice(0,160);if(!deviceId||!serial)continue;const values={gatewayId:gateway.id,deviceId,deviceSerial:serial,deviceName:String(raw.name||"Bambu Lab").slice(0,120),deviceModel:String(raw.model||"").slice(0,80),host:String(raw.host||"").slice(0,80),source:"bambu_ssdp",lastSeenAt:String(raw.lastSeenAt||now)};const [existing]=await db.select().from(gatewayDiscoveries).where(and(eq(gatewayDiscoveries.gatewayId,gateway.id),eq(gatewayDiscoveries.deviceId,deviceId))).limit(1);if(existing)await db.update(gatewayDiscoveries).set(values).where(eq(gatewayDiscoveries.id,existing.id));else await db.insert(gatewayDiscoveries).values(values)}
    return Response.json({ok:true});
  }
  if(body.type==="events"){
    const bindings=await db.select().from(printerBindings).where(eq(printerBindings.gatewayId,gateway.id));
    const byId=new Map(bindings.map(item=>[item.id,item]));
    for(const event of body.events||[]){
      if(!PRINTER_EVENT_TYPES.includes(event.type))continue;
      const bindingId="bindingId" in event.data?Number(event.data.bindingId):0,binding=byId.get(bindingId);if(!binding)continue;
      let saved:{id:number}|undefined,isNew=true;
      try{[saved]=await db.insert(printerEvents).values({bindingId,printerId:binding.printerId,eventId:String(event.id).slice(0,160),eventType:event.type,payload:JSON.stringify(publicData(event.data)),occurredAt:event.occurredAt}).returning({id:printerEvents.id})}
      catch{isNew=false;[saved]=await db.select({id:printerEvents.id}).from(printerEvents).where(and(eq(printerEvents.eventId,event.id),eq(printerEvents.bindingId,bindingId))).limit(1)}
      if(!saved)continue;
      if(isNew)await projectMonitorEvent(event,binding);
      await db.update(printerBindings).set({status:"online",lastSeenAt:now,updatedAt:now}).where(eq(printerBindings.id,bindingId));
      if(event.type==="printer.snapshot"){
        const data=event.data;
        await db.update(printers).set({status:data.status,connectionState:data.status==="offline"?"offline":"online",lastSeenAt:data.observedAt,nozzleTemp:data.nozzleTemperatureC,bedTemp:data.bedTemperatureC,currentFile:data.currentFile,remoteProgress:data.progressPercent}).where(eq(printers.id,binding.printerId));
        if(["printing","paused","completed","error","offline"].includes(data.status))await synchronizeExecutionEvent({organizationId:binding.organizationId,bindingId,printerId:binding.printerId,printerEventId:saved.id,eventId:event.id,status:data.status as "printing"|"paused"|"completed"|"error"|"offline",occurredAt:event.occurredAt,details:{progressPercent:data.progressPercent,errorCode:data.errorCode,currentFile:data.currentFile}});
      }
      if(event.type==="printer.materials")for(const slot of event.data.slots){const [old]=await db.select().from(bambuAmsSlots).where(and(eq(bambuAmsSlots.printerId,binding.printerId),eq(bambuAmsSlots.amsUnit,slot.unit),eq(bambuAmsSlots.trayIndex,slot.slot))).limit(1);const values={printerId:binding.printerId,amsUnit:slot.unit,trayIndex:slot.slot,material:slot.material||"",colorHex:slot.colorHex||"",remainingPercent:slot.remainingPercent,tagUid:slot.tagUid||"",active:slot.active,lastSeenAt:event.occurredAt};if(old)await db.update(bambuAmsSlots).set(values).where(eq(bambuAmsSlots.id,old.id));else await db.insert(bambuAmsSlots).values(values)}
    }
    return Response.json({ok:true,acceptedEventIds:(body.events||[]).map(event=>event.id)});
  }
  // Compatibility only: old gateways may replay receipts, but this monitor path never returns commands.
  if(body.type==="receipts"){
    for(const receipt of body.receipts||[]){if(!receipt.idempotencyKey)continue;const [command]=await db.select().from(printerCommands).where(eq(printerCommands.idempotencyKey,receipt.idempotencyKey)).limit(1);if(!command||!command.bindingId)continue;const binding=await db.select().from(printerBindings).where(and(eq(printerBindings.id,command.bindingId),eq(printerBindings.gatewayId,gateway.id))).limit(1);if(!binding.length)continue;await db.update(printerCommands).set({status:receipt.status,result:String(receipt.deviceMessage||"").slice(0,500),retryable:Boolean(receipt.retryable),acknowledgedAt:receipt.acknowledgedAt,completedAt:["succeeded","failed","timed_out","cancelled"].includes(receipt.status)?receipt.acknowledgedAt:null}).where(eq(printerCommands.id,command.id))}
    return Response.json({ok:true,mode:"compatibility_receipts_only"});
  }
  return Response.json({error:"不支持的上报类型"},{status:400});
}
