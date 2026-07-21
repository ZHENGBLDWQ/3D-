import type { PreflightInput, PreflightMaterialRequirement, PreflightMaterialSlot } from "../shared/contracts/preflight";
import type { SlicingRequest, SlicingResult } from "../shared/contracts/slicing";

type Statement = {
  bind: (...values: unknown[]) => Statement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<{ results?: T[] }>;
};
export type PreflightDatabase = { prepare: (sql: string) => Statement };
export type LivePreflightSelection = { slicingJobId: number; printerId: number; orderId: number };
export type LivePreflightContext = {
  organizationId: number;
  printerScope: number[];
  canDispatch: boolean;
  canOverride: boolean;
};

export class LivePreflightError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type SliceRow = { id: number; status: string; request_json: string; result_json: string | null };
type PrinterRow = {
  id: number; model: string; nozzle_diameter: number; status: string; connection_state: string;
  last_seen_at: string | null; capabilities: string;
};
type OrderRow = { id: number; status: string };
type SlotRow = { ams_unit: number; tray_index: number; material: string; last_seen_at: string };
type AllocationRow = { ams_unit: number | null; tray_index: number | null; material: string; remaining_grams: number };

const object = (value: string, label: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {}
  throw new LivePreflightError(`${label}数据损坏`, 409);
};
const text = (value: unknown, fallback = "") => typeof value === "string" && value.trim() ? value.trim() : fallback;
const number = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const slotName = (slot: number) => `A${Math.max(1, Math.trunc(slot))}`;

export async function assembleLivePreflightInput(
  db: PreflightDatabase,
  selection: LivePreflightSelection,
  context: LivePreflightContext,
  now = new Date(),
): Promise<PreflightInput> {
  if (![selection.slicingJobId, selection.printerId, selection.orderId].every(Number.isInteger)) {
    throw new LivePreflightError("切片任务、打印机和订单不能为空", 400);
  }
  if (context.printerScope.length && !context.printerScope.includes(selection.printerId)) {
    throw new LivePreflightError("当前账号无权操作该打印机", 403);
  }
  const [slice, printer, order] = await Promise.all([
    db.prepare("SELECT id,status,request_json,result_json FROM slicing_jobs WHERE id=? AND organization_id=?")
      .bind(selection.slicingJobId, context.organizationId).first<SliceRow>(),
    db.prepare(`SELECT p.id,p.model,p.nozzle_diameter,p.status,p.connection_state,p.last_seen_at,b.capabilities
      FROM printers p JOIN printer_bindings b ON b.printer_id=p.id
      WHERE p.id=? AND b.organization_id=? AND b.status='bound'`)
      .bind(selection.printerId, context.organizationId).first<PrinterRow>(),
    db.prepare("SELECT id,status FROM orders WHERE id=? AND organization_id=?")
      .bind(selection.orderId, context.organizationId).first<OrderRow>(),
  ]);
  if (!slice) throw new LivePreflightError("切片任务不存在或不属于当前组织", 404);
  if (!printer) throw new LivePreflightError("打印机未绑定、不可用或不属于当前组织", 404);
  if (!order) throw new LivePreflightError("订单不存在或不属于当前组织", 404);
  if (slice.status !== "succeeded" || !slice.result_json) throw new LivePreflightError("切片任务尚无可用结果", 409);

  const request = object(slice.request_json, "切片请求") as unknown as SlicingRequest;
  const result = object(slice.result_json, "切片结果") as unknown as SlicingResult;
  if (result.status !== "succeeded" || !result.output?.objectKey || !result.output.sha256) {
    throw new LivePreflightError("切片结果不完整，不能执行预检", 409);
  }
  const printerConfig = request.profiles?.printer?.config ?? {};
  const capabilities = object(printer.capabilities || "{}", "设备能力");
  const requestedFilaments = request.profiles?.filaments ?? [];
  const usage = result.output.filamentUsage?.length
    ? result.output.filamentUsage
    : [{ slot: 1, material: text(requestedFilaments[0]?.config?.material, "UNKNOWN"), grams: number(result.output.totalFilamentGrams) }];
  const requirements: PreflightMaterialRequirement[] = usage.map((item) => ({
    slot: slotName(item.slot),
    material: text(item.material, text(requestedFilaments[Math.max(0, item.slot - 1)]?.config?.material, "UNKNOWN")),
    slicedGrams: number(item.grams),
    safetyPercent: 8,
    minimumReserveGrams: 15,
  }));
  if (!requirements.length || requirements.some((item) => item.slicedGrams <= 0 || item.material === "UNKNOWN")) {
    throw new LivePreflightError("切片结果缺少可靠的分槽耗材用量", 409);
  }

  const [slotsResult, allocationsResult] = await Promise.all([
    db.prepare("SELECT ams_unit,tray_index,material,last_seen_at FROM bambu_ams_slots WHERE printer_id=? ORDER BY ams_unit,tray_index")
      .bind(printer.id).all<SlotRow>(),
    db.prepare(`SELECT a.ams_unit,a.tray_index,b.material,a.remaining_grams
      FROM inventory_printer_allocations a JOIN material_batches b ON b.id=a.batch_id
      WHERE a.printer_id=? AND a.status='使用中'`)
      .bind(printer.id).all<AllocationRow>(),
  ]);
  const allocations = allocationsResult.results ?? [];
  const materialSlots: PreflightMaterialSlot[] = (slotsResult.results ?? []).map((slot) => {
    const allocation = allocations.find((item) => item.ams_unit === slot.ams_unit && item.tray_index === slot.tray_index);
    return {
      slot: slotName(slot.tray_index + 1), material: text(allocation?.material, slot.material),
      ...(allocation ? { remainingGrams: allocation.remaining_grams } : {}), observedAt: slot.last_seen_at,
    };
  });
  const buildPlate = text(capabilities.buildPlate, text(printerConfig.buildPlate, "Textured PEI"));
  const connection = printer.connection_state.toLowerCase();
  const online = !["offline", "disconnected", "未连接"].includes(connection) && Boolean(printer.last_seen_at);
  const fault = /故障|error|fault/i.test(printer.status) ? printer.status : undefined;
  const invalidOrderStatuses = ["cancelled", "canceled", "已取消", "已关闭"];
  return {
    file: {
      complete: true, sliced: true,
      printerModel: text(printerConfig.model, request.profiles.printer.name),
      nozzleMm: number(printerConfig.nozzleDiameter, 0.4), buildPlate,
    },
    printer: {
      id: printer.id, model: printer.model, nozzleMm: printer.nozzle_diameter, buildPlate, online,
      ...(fault ? { fault } : {}), ...(printer.last_seen_at ? { observedAt: printer.last_seen_at } : {}),
    },
    materialRequirements: requirements,
    materialSlots,
    order: { valid: !invalidOrderStatuses.includes(order.status.toLowerCase()), ...(invalidOrderStatuses.includes(order.status.toLowerCase()) ? { reason: `订单状态为${order.status}` } : {}) },
    permission: { canDispatch: context.canDispatch, canOverride: context.canOverride },
    freshnessMinutes: 5,
    now: now.toISOString(),
  };
}
