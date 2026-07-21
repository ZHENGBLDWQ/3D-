import { getD1, getFilesBucket } from "../../../../db";
import type { SlicingOutputMetadata, SlicingResult } from "../../../../shared/contracts/slicing";

type GatewayContext = { id: number; organizationId: number };
async function tokenHash(token: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)); return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join(""); }
async function authenticate(request: Request): Promise<GatewayContext | Response> {
  const gatewayKey = request.headers.get("x-layertrace-gateway")?.trim() ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  if (!gatewayKey || !authorization.startsWith("Bearer ")) return Response.json({ error: "Gateway credentials are required" }, { status: 401 });
  const hash = await tokenHash(authorization.slice(7).trim());
  const gateway = await getD1().prepare("SELECT g.id,g.organization_id organizationId FROM local_gateways g JOIN gateway_tokens t ON t.gateway_id=g.id WHERE g.gateway_id=? AND t.token_hash=? AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at>CURRENT_TIMESTAMP)").bind(gatewayKey, hash).first<GatewayContext>();
  if (!gateway) return Response.json({ error: "Gateway credentials are invalid" }, { status: 401 });
  await getD1().prepare("UPDATE gateway_tokens SET last_used_at=CURRENT_TIMESTAMP WHERE token_hash=?").bind(hash).run();
  return gateway;
}
const isResponse = (value: GatewayContext | Response): value is Response => value instanceof Response;

export async function GET(request: Request) {
  const gateway = await authenticate(request); if (isResponse(gateway)) return gateway;
  const url = new URL(request.url), action = url.searchParams.get("action") ?? "claim", jobKey = url.searchParams.get("jobKey") ?? "";
  const d1 = getD1();
  if (action === "input") {
    const file = await d1.prepare("SELECT f.object_key,f.filename,f.content_type,f.size_bytes,f.sha256 FROM slicing_jobs j JOIN model_files f ON f.id=j.input_file_id WHERE j.job_key=? AND j.gateway_id=? AND j.organization_id=?").bind(jobKey, gateway.id, gateway.organizationId).first<{ object_key: string; filename: string; content_type: string; size_bytes: number; sha256: string }>();
    if (!file) return Response.json({ error: "Slicing input not found" }, { status: 404 });
    const object = await getFilesBucket().get(file.object_key); if (!object) return Response.json({ error: "R2 input is missing" }, { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": file.content_type, "Content-Length": String(file.size_bytes), "X-Content-SHA256": file.sha256, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}` } });
  }
  if (action === "status") {
    const job = await d1.prepare("SELECT job_key,status,cancel_requested_at FROM slicing_jobs WHERE job_key=? AND gateway_id=? AND organization_id=?").bind(jobKey, gateway.id, gateway.organizationId).first();
    return job ? Response.json(job) : Response.json({ error: "Slicing job not found" }, { status: 404 });
  }
  const candidate = await d1.prepare("SELECT id,job_key,request_json FROM slicing_jobs WHERE gateway_id=? AND organization_id=? AND status='queued' ORDER BY created_at LIMIT 1").bind(gateway.id, gateway.organizationId).first<{ id: number; job_key: string; request_json: string }>();
  if (!candidate) return new Response(null, { status: 204 });
  const claimed = await d1.prepare("UPDATE slicing_jobs SET status='claimed',claimed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='queued'").bind(candidate.id).run();
  if (!claimed.meta.changes) return new Response(null, { status: 204 });
  return Response.json({ jobKey: candidate.job_key, request: JSON.parse(candidate.request_json) });
}

export async function PATCH(request: Request) {
  const gateway = await authenticate(request); if (isResponse(gateway)) return gateway;
  const body = await request.json() as Partial<SlicingResult> & { status?: string };
  const jobKey = String(body.jobKey ?? ""), status = String(body.status ?? "");
  if (!/^slice_[0-9a-f-]{36}$/i.test(jobKey) || !["running", "failed", "cancelled", "timed_out"].includes(status)) return Response.json({ error: "Invalid job update" }, { status: 400 });
  const current = await getD1().prepare("SELECT status FROM slicing_jobs WHERE job_key=? AND gateway_id=? AND organization_id=?").bind(jobKey, gateway.id, gateway.organizationId).first<{ status: string }>();
  if (!current) return Response.json({ error: "Slicing job not found" }, { status: 404 });
  const allowed = status === "running" ? ["claimed"] : ["claimed", "running", "cancel_requested"];
  if (!allowed.includes(current.status)) return Response.json({ error: `Invalid transition ${current.status} -> ${status}` }, { status: 409 });
  await getD1().prepare("UPDATE slicing_jobs SET status=?,result_json=?,error_code=?,error_message=?,started_at=CASE WHEN ?='running' THEN COALESCE(started_at,CURRENT_TIMESTAMP) ELSE started_at END,completed_at=CASE WHEN ?!='running' THEN CURRENT_TIMESTAMP ELSE completed_at END,updated_at=CURRENT_TIMESTAMP WHERE job_key=? AND gateway_id=?").bind(status, JSON.stringify(body), body.error?.code ?? null, body.error?.message?.slice(0, 1000) ?? null, status, status, jobKey, gateway.id).run();
  return Response.json({ jobKey, status });
}

export async function PUT(request: Request) {
  const gateway = await authenticate(request); if (isResponse(gateway)) return gateway;
  const jobKey = new URL(request.url).searchParams.get("jobKey") ?? "";
  const job = await getD1().prepare("SELECT request_json,status FROM slicing_jobs WHERE job_key=? AND gateway_id=? AND organization_id=?").bind(jobKey, gateway.id, gateway.organizationId).first<{ request_json: string; status: string }>();
  if (!job || !["running", "claimed"].includes(job.status)) return Response.json({ error: "Active slicing job not found" }, { status: 404 });
  const requestPayload = JSON.parse(job.request_json) as { output: { objectKey: string } };
  const bytes = await request.arrayBuffer(); if (!bytes.byteLength || bytes.byteLength > 250 * 1024 * 1024) return Response.json({ error: "Output must be between 1 byte and 250 MB" }, { status: 413 });
  const hash = await tokenHashBytes(bytes), filename = `${jobKey}.3mf`;
  await getFilesBucket().put(requestPayload.output.objectKey, bytes, { httpMetadata: { contentType: "model/3mf" }, customMetadata: { sha256: hash, jobKey } });
  const metadata: SlicingOutputMetadata = { filename, objectKey: requestPayload.output.objectKey, sha256: hash, sizeBytes: bytes.byteLength, slicerName: "Bambu Studio", slicerVersion: request.headers.get("x-slicer-version")?.slice(0, 160) || "unknown", generatedAt: new Date().toISOString() };
  await getD1().prepare("UPDATE slicing_jobs SET status='succeeded',result_json=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE job_key=? AND gateway_id=?").bind(JSON.stringify({ protocolVersion: 1, jobKey, status: "succeeded", output: metadata }), jobKey, gateway.id).run();
  return Response.json({ jobKey, status: "succeeded", output: metadata });
}
async function tokenHashBytes(bytes: ArrayBuffer) { const digest = await crypto.subtle.digest("SHA-256", bytes); return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join(""); }
