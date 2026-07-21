import { getD1 } from "../../../db";
import { getAccessContext } from "../../access-control";

export async function GET(){
  const user=await getAccessContext();if(!user)return Response.json({error:"未登录"},{status:401});
  const d1=getD1(),scope=user.printerScope;
  const allowed=(alias:string)=>scope.length?` AND ${alias}.id IN (${scope.map(()=>"?").join(",")})`:"";
  const bind=(statement:ReturnType<typeof d1.prepare>)=>scope.length?statement.bind(user.organizationId,...scope):statement.bind(user.organizationId);
  const [printers,sessions,feeds]=await Promise.all([
    bind(d1.prepare(`SELECT p.id,p.name,p.model,p.status,p.connection_state connectionState,p.last_seen_at lastSeenAt,p.current_file currentFile,p.remote_progress progress,p.nozzle_temp nozzleTemp,p.bed_temp bedTemp FROM printers p JOIN printer_bindings b ON b.printer_id=p.id WHERE b.organization_id=?${allowed("p")} ORDER BY p.name`)).all(),
    bind(d1.prepare(`SELECT s.id,s.printer_id printerId,p.name printerName,s.external_session_key sessionKey,s.filename,s.status,s.started_at startedAt,s.completed_at completedAt,s.last_observed_at lastObservedAt,s.telemetry_snapshot telemetry FROM print_sessions s JOIN printers p ON p.id=s.printer_id WHERE s.organization_id=?${scope.length?` AND s.printer_id IN (${scope.map(()=>"?").join(",")})`:""} ORDER BY s.last_observed_at DESC LIMIT 100`)).all(),
    bind(d1.prepare(`SELECT f.id,f.printer_id printerId,p.name printerName,f.feed_kind feedKind,f.ams_unit amsUnit,f.slot_index slotIndex,f.toolhead,f.label,b.id bindingId,sp.spool_code spoolCode,sp.remaining_net_grams remainingGrams,c.material,c.color_name colorName,c.color_hex colorHex,b.detected_snapshot detectedSnapshot FROM printer_feed_positions f JOIN printers p ON p.id=f.printer_id LEFT JOIN spool_bindings b ON b.feed_position_id=f.id AND b.status='active' LEFT JOIN material_spools sp ON sp.id=b.spool_id LEFT JOIN material_catalog_items c ON c.id=sp.catalog_item_id WHERE f.organization_id=?${scope.length?` AND f.printer_id IN (${scope.map(()=>"?").join(",")})`:""} AND f.active=1 ORDER BY p.name,f.toolhead,f.ams_unit,f.slot_index`)).all(),
  ]);
  return Response.json({mode:"monitor_only",printers:printers.results,sessions:sessions.results,feeds:feeds.results});
}
