import { getD1 } from "../../../db";
import type { PrinterEvent } from "../../../shared/contracts/events";

type Binding = { organizationId: number; printerId: number };

export async function projectMonitorEvent(event: PrinterEvent, binding: Binding) {
  const d1 = getD1();
  if (event.type === "print.session") {
    const data = event.data;
    const status = data.phase === "started" ? "printing" : data.phase;
    const terminal = ["completed", "failed", "cancelled"].includes(status);
    await d1.prepare(`INSERT INTO print_sessions(organization_id,printer_id,source,external_session_key,filename,status,started_at,completed_at,last_observed_at,telemetry_snapshot)
      VALUES(?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(organization_id,external_session_key) DO UPDATE SET filename=excluded.filename,status=excluded.status,completed_at=COALESCE(excluded.completed_at,print_sessions.completed_at),last_observed_at=excluded.last_observed_at,telemetry_snapshot=excluded.telemetry_snapshot,updated_at=CURRENT_TIMESTAMP`)
      .bind(binding.organizationId,binding.printerId,data.source,data.externalSessionKey,data.currentFile||"",status,data.phase==="started"?event.occurredAt:null,terminal?event.occurredAt:null,event.occurredAt,JSON.stringify(data)).run();
    return;
  }
  if (event.type === "printer.snapshot" && event.data.sessionKey) {
    await d1.prepare("UPDATE print_sessions SET last_observed_at=?,telemetry_snapshot=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND external_session_key=?")
      .bind(event.occurredAt,JSON.stringify(event.data),binding.organizationId,event.data.sessionKey).run();
    return;
  }
  if (event.type !== "printer.materials") return;
  for (const slot of event.data.slots) {
    const feedKind=slot.feedKind||"ams",toolhead=slot.toolhead||"main";
    await d1.prepare(`INSERT INTO printer_feed_positions(organization_id,printer_id,feed_kind,ams_unit,slot_index,toolhead,label)
      SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM printer_feed_positions WHERE organization_id=? AND printer_id=? AND feed_kind=? AND COALESCE(ams_unit,-1)=COALESCE(?,-1) AND COALESCE(slot_index,-1)=COALESCE(?,-1) AND toolhead=?)`)
      .bind(binding.organizationId,binding.printerId,feedKind,slot.unit,slot.slot,toolhead,feedKind==="ams"?`AMS ${slot.unit+1}-${slot.slot+1}`:`${toolhead} 外置料盘`,binding.organizationId,binding.printerId,feedKind,slot.unit,slot.slot,toolhead).run();
    const position=await d1.prepare("SELECT id FROM printer_feed_positions WHERE organization_id=? AND printer_id=? AND feed_kind=? AND COALESCE(ams_unit,-1)=COALESCE(?,-1) AND COALESCE(slot_index,-1)=COALESCE(?,-1) AND toolhead=? LIMIT 1")
      .bind(binding.organizationId,binding.printerId,feedKind,slot.unit,slot.slot,toolhead).first<{id:number}>();
    if(position)await d1.prepare("UPDATE spool_bindings SET detected_snapshot=? WHERE organization_id=? AND feed_position_id=? AND status='active'")
      .bind(JSON.stringify({...slot,observedAt:event.occurredAt}),binding.organizationId,position.id).run();
  }
}
