import { can, getAccessContext, recordAudit } from "../../access-control";
import { requireApiAccess } from "../../api-auth";
import { getD1 } from "../../../db";
import { evaluatePreflight } from "../../../preflight/evaluate";
import { assembleLivePreflightInput, LivePreflightError } from "../../../preflight/live-input";
import type { PreflightInput } from "../../../shared/contracts/preflight";

type Access = NonNullable<Awaited<ReturnType<typeof getAccessContext>>>;

async function persist(input: PreflightInput, context: Access) {
  const result = evaluatePreflight(input), d1 = getD1();
  const run = await d1.prepare("INSERT INTO preflight_runs(organization_id,run_id,printer_id,level,dispatch_allowed,override_allowed,input,evaluated_at,created_by) VALUES(?,?,?,?,?,?,?,?,?) RETURNING id")
    .bind(context.organizationId, result.runId, input.printer.id, result.level, result.dispatchAllowed ? 1 : 0, result.overrideAllowed ? 1 : 0, JSON.stringify(input), result.evaluatedAt, context.email)
    .first<{ id: number }>();
  if (!run) throw new Error("无法保存预检结果");
  for (const item of result.checks) {
    await d1.prepare("INSERT INTO preflight_checks(run_id,code,category,level,message,details,resolution_actions) VALUES(?,?,?,?,?,?,?)")
      .bind(run.id, item.code, item.category, item.level, item.message, JSON.stringify(item.details ?? {}), JSON.stringify(item.resolutionActions ?? [])).run();
  }
  return { result, databaseId: run.id };
}

export async function GET() {
  const denied = await requireApiAccess();
  if (denied) return denied;
  const context = await getAccessContext();
  if (!context) return Response.json({ error: "请先登录" }, { status: 401 });
  const d1 = getD1();
  const [runs, slicingJobs, printerRows, orders] = await Promise.all([
    d1.prepare("SELECT run_id,printer_id,level,dispatch_allowed,override_allowed,evaluated_at,created_by FROM preflight_runs WHERE organization_id=? ORDER BY id DESC LIMIT 30").bind(context.organizationId).all(),
    d1.prepare("SELECT id,job_key,status,completed_at,result_json FROM slicing_jobs WHERE organization_id=? AND status='succeeded' AND result_json IS NOT NULL ORDER BY completed_at DESC LIMIT 100").bind(context.organizationId).all<Record<string, unknown>>(),
    d1.prepare(`SELECT p.id,p.name,p.model,p.status,p.connection_state,p.last_seen_at
      FROM printers p JOIN printer_bindings b ON b.printer_id=p.id
      WHERE b.organization_id=? AND b.status='bound' ORDER BY p.name`).bind(context.organizationId).all<Record<string, unknown>>(),
    d1.prepare("SELECT id,order_no,customer,status,due_at FROM orders WHERE organization_id=? ORDER BY created_at DESC LIMIT 200").bind(context.organizationId).all(),
  ]);
  const scope = new Set(context.printerScope);
  const printers = (printerRows.results ?? []).filter((row: Record<string, unknown>) => !scope.size || scope.has(Number(row.id)));
  return Response.json({ runs: runs.results ?? [], slicingJobs: slicingJobs.results ?? [], printers, orders: orders.results ?? [], mode: "live" });
}

export async function POST(request: Request) {
  const denied = await requireApiAccess(true);
  if (denied) return denied;
  const context = await getAccessContext();
  if (!context) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const body = await request.json() as {
      slicingJobId?: number; printerId?: number; orderId?: number; input?: PreflightInput;
      dispatch?: boolean; overrideReason?: string;
    };
    const runtimeMode = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV;
    const isDevelopmentFixture = runtimeMode !== "production" && body.input?.printer?.id;
    const input = isDevelopmentFixture
      ? { ...body.input!, permission: { canDispatch: can(context, "printers.control"), canOverride: context.role === "owner" || context.role === "manager" } }
      : await assembleLivePreflightInput(getD1(), {
          slicingJobId: Number(body.slicingJobId), printerId: Number(body.printerId), orderId: Number(body.orderId),
        }, {
          organizationId: context.organizationId, printerScope: context.printerScope,
          canDispatch: can(context, "printers.control"), canOverride: context.role === "owner" || context.role === "manager",
        });
    const { result, databaseId } = await persist(input, context);
    const reason = body.overrideReason?.trim().slice(0, 500) ?? "";
    const overridden = Boolean(body.dispatch && result.level === "warning" && result.overrideAllowed && reason.length >= 6);
    const allowed = result.dispatchAllowed || overridden, d1 = getD1();
    if (overridden) await d1.prepare("INSERT INTO preflight_overrides(run_id,actor_email,reason) VALUES(?,?,?)").bind(databaseId, context.email, reason).run();
    if (body.dispatch) await d1.prepare("INSERT INTO dispatch_attempts(run_id,printer_id,allowed,reason,actor_email) VALUES(?,?,?,?,?)").bind(databaseId, input.printer.id, allowed ? 1 : 0, overridden ? reason : allowed ? "preflight_passed" : "preflight_rejected", context.email).run();
    await recordAudit(context, body.dispatch ? "dispatch.preflight" : "preflight.run", "printer", String(input.printer.id), { runId: result.runId, level: result.level, allowed, overridden, slicingJobId: body.slicingJobId, orderId: body.orderId });
    if (body.dispatch && !allowed) return Response.json({ error: result.level === "warning" && result.overrideAllowed ? "存在风险，需要填写不少于6个字符的授权原因" : "后端预检未通过，已阻止下发", result }, { status: 409 });
    return Response.json({ result: { ...result, dispatchAllowed: allowed }, overridden });
  } catch (error) {
    const status = error instanceof LivePreflightError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "预检失败" }, { status });
  }
}
