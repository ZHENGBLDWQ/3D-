import { getAccessContext, recordAudit } from "../../access-control";
import { requireApiAccess } from "../../api-auth";
import { getD1, getFilesBucket } from "../../../db";
import type { SlicerProfileSnapshot, SlicingRequest } from "../../../shared/contracts/slicing";

const printerProfiles: Record<string, SlicerProfileSnapshot> = {
  a1: { id: "bambu-a1-04", name: "Bambu Lab A1 0.4 nozzle", version: "1", config: { model: "A1", nozzleDiameter: 0.4 } },
  x2d: { id: "bambu-x2d-04", name: "Bambu Lab X2D 0.4 nozzle", version: "1", config: { model: "X2D", nozzleDiameter: 0.4 } },
  p2s: { id: "bambu-p2s-04", name: "Bambu Lab P2S 0.4 nozzle", version: "1", config: { model: "P2S", nozzleDiameter: 0.4 } },
};
const processProfiles: Record<string, SlicerProfileSnapshot> = {
  standard: { id: "process-standard-020", name: "0.20mm Standard", version: "1", config: { layerHeight: 0.2, infillPercent: 15 } },
  quality: { id: "process-quality-012", name: "0.12mm Quality", version: "1", config: { layerHeight: 0.12, infillPercent: 15 } },
};
const filamentProfiles: Record<string, SlicerProfileSnapshot> = {
  pla: { id: "filament-generic-pla", name: "Generic PLA", version: "1", config: { material: "PLA", density: 1.24 } },
  petg: { id: "filament-generic-petg", name: "Generic PETG", version: "1", config: { material: "PETG", density: 1.27 } },
};
type AssetRow = { id: number; filename: string; format: string; sha256: string; object_key: string; size_bytes: number };
const cleanKey = (value: unknown) => String(value ?? "").trim().toLowerCase();

export async function GET() {
  const denied = await requireApiAccess();
  if (denied) return denied;
  const context = await getAccessContext();
  if (!context) return Response.json({ error: "请先登录" }, { status: 401 });
  const d1 = getD1();
  const [jobs, files, gateways] = await Promise.all([
    d1.prepare("SELECT id,job_key,status,input_file_id,gateway_id,request_json,result_json,error_code,error_message,timeout_seconds,created_at,started_at,completed_at FROM slicing_jobs WHERE organization_id=? ORDER BY created_at DESC LIMIT 100").bind(context.organizationId).all(),
    d1.prepare("SELECT id,filename,format,sha256,size_bytes FROM model_files WHERE organization_id=? AND asset_layer IN ('original','project') AND format IN ('stl','3mf') ORDER BY created_at DESC LIMIT 250").bind(context.organizationId).all(),
    d1.prepare("SELECT id,name,status,last_seen_at FROM local_gateways WHERE organization_id=? ORDER BY name").bind(context.organizationId).all(),
  ]);
  return Response.json({ jobs: jobs.results ?? [], files: files.results ?? [], gateways: gateways.results ?? [], presets: { printers: printerProfiles, processes: processProfiles, filaments: filamentProfiles } });
}

export async function POST(request: Request) {
  const denied = await requireApiAccess(true);
  if (denied) return denied;
  const context = await getAccessContext();
  if (!context) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const fileId = Number(body.fileId), gatewayId = Number(body.gatewayId);
    const printer = printerProfiles[cleanKey(body.printerProfile)], process = processProfiles[cleanKey(body.processProfile)], filament = filamentProfiles[cleanKey(body.filamentProfile)];
    const timeoutSeconds = Math.min(7200, Math.max(60, Math.trunc(Number(body.timeoutSeconds) || 1800)));
    const plateIndex = body.plateIndex === "" || body.plateIndex == null ? undefined : Math.max(1, Math.trunc(Number(body.plateIndex)));
    if (!Number.isInteger(fileId) || !Number.isInteger(gatewayId) || !printer || !process || !filament) return Response.json({ error: "模型、网关或切片模板无效" }, { status: 400 });
    const d1 = getD1();
    const [file, gateway] = await Promise.all([
      d1.prepare("SELECT id,filename,format,sha256,object_key,size_bytes FROM model_files WHERE id=? AND organization_id=? AND format IN ('stl','3mf')").bind(fileId, context.organizationId).first<AssetRow>(),
      d1.prepare("SELECT id FROM local_gateways WHERE id=? AND organization_id=?").bind(gatewayId, context.organizationId).first<{ id: number }>(),
    ]);
    if (!file) return Response.json({ error: "输入模型不存在或不属于当前组织" }, { status: 404 });
    if (!gateway) return Response.json({ error: "本地网关不存在或不属于当前组织" }, { status: 404 });
    if (!(await getFilesBucket().head(file.object_key))) return Response.json({ error: "模型文件内容在R2中不存在" }, { status: 409 });
    const jobKey = `slice_${crypto.randomUUID()}`;
    const requestPayload: SlicingRequest = {
      protocolVersion: 1, jobKey,
      input: { fileId: file.id, filename: file.filename, format: file.format as "stl" | "3mf", sha256: file.sha256 },
      output: { format: "3mf", objectKey: `slicing/${context.organizationId}/${jobKey}/output.3mf` },
      ...(plateIndex ? { plateIndex } : {}), timeoutSeconds,
      profiles: { printer: structuredClone(printer), process: structuredClone(process), filaments: [structuredClone(filament)] },
    };
    await d1.prepare("INSERT INTO slicing_jobs(organization_id,job_key,input_file_id,gateway_id,status,request_json,timeout_seconds,created_by) VALUES(?,?,?,?,?,?,?,?)").bind(context.organizationId, jobKey, file.id, gateway.id, "queued", JSON.stringify(requestPayload), timeoutSeconds, context.email).run();
    await recordAudit(context, "slicing.enqueue", "slicing_job", jobKey, { fileId, gatewayId, printerProfile: printer.id, processProfile: process.id, filamentProfile: filament.id });
    return Response.json({ jobKey, status: "queued" }, { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法创建切片任务" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const denied = await requireApiAccess(true);
  if (denied) return denied;
  const context = await getAccessContext();
  if (!context) return Response.json({ error: "请先登录" }, { status: 401 });
  const jobKey = new URL(request.url).searchParams.get("jobKey")?.trim() ?? "";
  if (!/^slice_[0-9a-f-]{36}$/i.test(jobKey)) return Response.json({ error: "任务编号无效" }, { status: 400 });
  const d1 = getD1();
  const job = await d1.prepare("SELECT status FROM slicing_jobs WHERE job_key=? AND organization_id=?").bind(jobKey, context.organizationId).first<{ status: string }>();
  if (!job) return Response.json({ error: "任务不存在" }, { status: 404 });
  if (["succeeded", "failed", "cancelled", "timed_out"].includes(job.status)) return Response.json({ error: "任务已结束，不能取消" }, { status: 409 });
  const nextStatus = job.status === "queued" ? "cancelled" : "cancel_requested";
  await d1.prepare("UPDATE slicing_jobs SET status=?,cancel_requested_at=CURRENT_TIMESTAMP,completed_at=CASE WHEN ?='cancelled' THEN CURRENT_TIMESTAMP ELSE completed_at END,updated_at=CURRENT_TIMESTAMP WHERE job_key=? AND organization_id=?").bind(nextStatus, nextStatus, jobKey, context.organizationId).run();
  await recordAudit(context, "slicing.cancel", "slicing_job", jobKey, { previousStatus: job.status });
  return Response.json({ jobKey, status: nextStatus });
}
