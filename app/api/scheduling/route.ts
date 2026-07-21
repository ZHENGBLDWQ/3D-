import { getD1 } from "../../../db";
import { getAccessContext, recordAudit } from "../../access-control";
import { requireApiAccess } from "../../api-auth";
import { rankPrinters, type SchedulingJob, type SchedulingPrinter } from "../../../scheduling/score";

type Row = Record<string, unknown>;
const rows = async (sql: string, values: unknown[] = []) => (await getD1().prepare(sql).bind(...values).all<Row>()).results ?? [];
const text = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function json<T>(value: unknown, fallback: T): T { try { return JSON.parse(text(value)) as T; } catch { return fallback; } }

async function loadScheduling(organizationId: number) {
  const now = new Date();
  const [printerRows, slotRows, queueRows, jobRows, materialRows, sliceRows, planRows] = await Promise.all([
    rows(`SELECT p.*,pb.capabilities FROM printers p JOIN printer_bindings pb ON pb.printer_id=p.id WHERE pb.organization_id=? AND pb.status IN ('bound','online','active') ORDER BY p.name`, [organizationId]),
    rows(`SELECT s.* FROM bambu_ams_slots s JOIN printer_bindings pb ON pb.printer_id=s.printer_id WHERE pb.organization_id=?`, [organizationId]),
    rows(`SELECT p.id printer_id,MAX(COALESCE(j.expected_complete_at,j.planned_start_at,j.created_at)) available_at FROM printers p JOIN printer_bindings pb ON pb.printer_id=p.id LEFT JOIN print_jobs j ON j.printer_id=p.id AND j.status NOT IN ('已完成','已取消','completed','cancelled') WHERE pb.organization_id=? GROUP BY p.id`, [organizationId]),
    rows(`SELECT j.id,j.job_no,j.quantity,j.priority,j.printer_id,j.file_id,j.item_id,j.order_id,i.estimated_minutes,o.due_at,f.kind file_kind,f.filename,f.printer_profile FROM print_jobs j LEFT JOIN print_items i ON i.id=j.item_id LEFT JOIN orders o ON o.id=j.order_id LEFT JOIN print_files f ON f.id=j.file_id WHERE j.status IN ('排队','待打印','queued','pending') AND (j.printer_id IS NULL OR j.printer_id IN (SELECT printer_id FROM printer_bindings WHERE organization_id=?)) ORDER BY j.priority,j.created_at`, [organizationId]),
    rows(`SELECT im.item_id,mb.material,SUM(im.grams_per_item*(1+im.waste_percent/100.0)) grams FROM item_materials im JOIN material_batches mb ON mb.id=im.batch_id GROUP BY im.item_id,mb.material`),
    rows(`SELECT input_file_id,result_json,request_json,completed_at FROM slicing_jobs WHERE organization_id=? AND status='succeeded' ORDER BY completed_at DESC`, [organizationId]),
    rows(`SELECT pp.id,pp.plan_no,pp.status,pp.confirmed_at,pp.created_at,COUNT(ppi.id) item_count FROM production_plans pp LEFT JOIN production_plan_items ppi ON ppi.plan_id=pp.id WHERE pp.organization_id=? GROUP BY pp.id ORDER BY pp.id DESC LIMIT 20`, [organizationId]),
  ]);
  const available = new Map(queueRows.map(row => [number(row.printer_id), text(row.available_at) || now.toISOString()]));
  const slots = new Map<number, SchedulingPrinter["amsSlots"]>();
  for (const row of slotRows) {
    const printerId = number(row.printer_id), list = slots.get(printerId) ?? [];
    list.push({ material: text(row.material), color: text(row.color_hex), remainingPercent: number(row.remaining_percent), remainingGrams: row.remaining_percent == null ? undefined : number(row.remaining_percent) * 10 });
    slots.set(printerId, list);
  }
  const printers: SchedulingPrinter[] = printerRows.map(row => {
    const capabilities = json<{ supportedFiles?: string[] }>(row.capabilities, {});
    return { id: number(row.id), name: text(row.name), model: text(row.model), nozzleDiameter: number(row.nozzle_diameter, .4), status: text(row.status), connectionState: text(row.connection_state), supportedFiles: capabilities.supportedFiles?.length ? capabilities.supportedFiles : ["3mf", "gcode"], availableAt: available.get(number(row.id)) ?? now.toISOString(), amsSlots: slots.get(number(row.id)) ?? [] };
  });
  const requirements = new Map<number, Array<{ material: string; grams: number }>>();
  for (const row of materialRows) { const itemId = number(row.item_id), list = requirements.get(itemId) ?? []; list.push({ material: text(row.material), grams: number(row.grams) }); requirements.set(itemId, list); }
  const sliceByFile = new Map(sliceRows.map(row => [number(row.input_file_id), row]));
  const jobs: SchedulingJob[] = jobRows.map(row => {
    const slice = sliceByFile.get(number(row.file_id));
    const result = json<{ output?: { estimatedSeconds?: number } }>(slice?.result_json, {}), request = json<{ profiles?: { printer?: { name?: string; config?: { nozzleDiameter?: number } } } }>(slice?.request_json, {});
    const quantity = Math.max(1, number(row.quantity, 1));
    return { id: number(row.id), jobNo: text(row.job_no), requiredModel: request.profiles?.printer?.name || text(row.printer_profile) || undefined, nozzleDiameter: request.profiles?.printer?.config?.nozzleDiameter, fileFormat: text(row.file_kind).toLowerCase().includes("3mf") || text(row.filename).toLowerCase().endsWith(".3mf") ? "3mf" : text(row.file_kind).toLowerCase().includes("g") ? "gcode" : undefined, estimatedMinutes: result.output?.estimatedSeconds ? Math.ceil(result.output.estimatedSeconds / 60) : Math.max(1, number(row.estimated_minutes, 60)), quantity, priority: Math.max(1, number(row.priority, 3)), dueAt: text(row.due_at) || undefined, materials: (requirements.get(number(row.item_id)) ?? []).map(item => ({ ...item, grams: item.grams * quantity })) };
  });
  return { generatedAt: now.toISOString(), mode: "recommend_only" as const, printers, jobs, recommendations: jobs.map(job => rankPrinters(job, printers, now)), slicingOutputs: sliceRows.length, plans: planRows };
}

export async function GET() {
  const denied = await requireApiAccess(); if (denied) return denied;
  const context = await getAccessContext(); if (!context) return Response.json({ error: "请先登录" }, { status: 401 });
  return Response.json(await loadScheduling(context.organizationId));
}

export async function POST(request: Request) {
  const denied = await requireApiAccess(true); if (denied) return denied;
  const context = await getAccessContext(); if (!context) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!["owner", "manager", "orders"].includes(context.role)) return Response.json({ error: "当前角色不能确认排产" }, { status: 403 });
  try {
    const body = await request.json() as { jobId?: number; printerId?: number };
    const data = await loadScheduling(context.organizationId), recommendation = data.recommendations.find(item => item.jobId === Number(body.jobId)), selected = recommendation?.candidates.find(item => item.printerId === Number(body.printerId) && item.eligible);
    if (!recommendation || !selected) return Response.json({ error: "推荐已失效，请刷新后重新选择兼容设备" }, { status: 409 });
    const d1 = getD1(), planNo = `PLAN-${Date.now().toString(36).toUpperCase()}`;
    const plan = await d1.prepare("INSERT INTO production_plans(organization_id,plan_no,status,mode,created_by,confirmed_by,confirmed_at) VALUES(?,?,'confirmed','recommend_only',?,?,CURRENT_TIMESTAMP) RETURNING id").bind(context.organizationId, planNo, context.email, context.email).first<{ id: number }>();
    if (!plan) throw new Error("无法创建生产计划");
    const item = await d1.prepare("INSERT INTO production_plan_items(plan_id,print_job_id,printer_id,score,recommendation_reasons,conflicts,planned_start_at,planned_end_at,status) VALUES(?,?,?,?,?,?,?,?,'confirmed') RETURNING id").bind(plan.id, recommendation.jobId, selected.printerId, selected.score, JSON.stringify(selected.reasons), JSON.stringify(selected.conflicts), selected.plannedStartAt, selected.plannedEndAt).first<{ id: number }>();
    if (!item) throw new Error("无法保存计划项目");
    await d1.batch([
      d1.prepare("INSERT INTO printer_schedules(organization_id,plan_item_id,printer_id,starts_at,ends_at,status) VALUES(?,?,?,?,?,'reserved')").bind(context.organizationId, item.id, selected.printerId, selected.plannedStartAt, selected.plannedEndAt),
      d1.prepare("INSERT INTO schedule_revisions(plan_id,revision_no,snapshot,reason,created_by) VALUES(?,1,?,'人工确认首版推荐',?)").bind(plan.id, JSON.stringify({ recommendation, selected }), context.email),
    ]);
    for (const conflict of selected.conflicts) await d1.prepare("INSERT INTO schedule_conflicts(plan_item_id,code,level,message) VALUES(?,?,?,?)").bind(item.id, conflict.code, conflict.level, conflict.message).run();
    await recordAudit(context, "schedule.confirm", "production_plan", String(plan.id), { planNo, jobId: recommendation.jobId, printerId: selected.printerId, mode: "recommend_only" });
    return Response.json({ planId: plan.id, planNo, dispatched: false });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "确认排产失败" }, { status: 500 }); }
}
