export type MaterialNeed = { material: string; grams: number; color?: string };
export type AmsSlot = { material: string; remainingGrams?: number; remainingPercent?: number; color?: string };
export type SchedulingJob = { id: number; jobNo: string; requiredModel?: string; nozzleDiameter?: number; fileFormat?: string; estimatedMinutes: number; quantity: number; priority: number; dueAt?: string; materials: MaterialNeed[] };
export type SchedulingPrinter = { id: number; name: string; model: string; nozzleDiameter: number; status: string; connectionState: string; supportedFiles: string[]; availableAt: string; amsSlots: AmsSlot[] };
export type ScheduleConflict = { code: string; level: "warning" | "block"; message: string };
export type PrinterRecommendation = { printerId: number; printerName: string; score: number; eligible: boolean; plannedStartAt: string; plannedEndAt: string; reasons: string[]; conflicts: ScheduleConflict[] };

const norm = (value?: string) => (value ?? "").trim().toLowerCase().replace(/bambu\s*lab|bambu|\s|-/g, "");
const online = new Set(["online", "connected", "idle", "printing", "paused", "preparing"]);

export function scorePrinter(job: SchedulingJob, printer: SchedulingPrinter, now = new Date()): PrinterRecommendation {
  const reasons: string[] = [], conflicts: ScheduleConflict[] = [];
  let score = 0, eligible = true;
  if (job.requiredModel && norm(job.requiredModel) !== norm(printer.model)) { eligible = false; conflicts.push({ code: "MODEL_INCOMPATIBLE", level: "block", message: `切片机型 ${job.requiredModel} 与 ${printer.model} 不兼容` }); }
  else { score += 35; reasons.push("机型完全匹配"); }
  if (job.nozzleDiameter && Math.abs(job.nozzleDiameter - printer.nozzleDiameter) > 0.01) { eligible = false; conflicts.push({ code: "NOZZLE_INCOMPATIBLE", level: "block", message: `需要 ${job.nozzleDiameter}mm 喷嘴，设备为 ${printer.nozzleDiameter}mm` }); }
  else { score += 15; reasons.push("喷嘴规格匹配"); }
  if (job.fileFormat && !printer.supportedFiles.map(norm).includes(norm(job.fileFormat))) { eligible = false; conflicts.push({ code: "FILE_INCOMPATIBLE", level: "block", message: `设备不支持 ${job.fileFormat} 文件` }); }
  else { score += 10; reasons.push("生产文件格式兼容"); }
  if (!online.has(norm(printer.connectionState)) || ["offline", "error", "maintenance"].includes(norm(printer.status))) { eligible = false; conflicts.push({ code: "PRINTER_OFFLINE", level: "block", message: "设备离线或不可生产，需要重新排产" }); }
  else { score += 15; reasons.push("设备在线可调度"); }

  for (const need of job.materials) {
    const slots = printer.amsSlots.filter(slot => norm(slot.material) === norm(need.material));
    if (!slots.length) { eligible = false; conflicts.push({ code: "MATERIAL_MISSING", level: "block", message: `AMS 未装载 ${need.material}` }); continue; }
    const known = slots.reduce((sum, slot) => sum + (slot.remainingGrams ?? 0), 0);
    if (known > 0 && known < need.grams) { eligible = false; conflicts.push({ code: "MATERIAL_SHORTAGE", level: "block", message: `${need.material} 预计短缺 ${(need.grams - known).toFixed(1)}g` }); }
    else if (known === 0) conflicts.push({ code: "MATERIAL_REMAINING_UNKNOWN", level: "warning", message: `${need.material} 已装载，但余量克重未知` });
    else { score += 15 / Math.max(1, job.materials.length); reasons.push(`${need.material} 余量满足需求`); }
  }

  const start = new Date(Math.max(now.getTime(), Date.parse(printer.availableAt) || now.getTime()));
  const end = new Date(start.getTime() + Math.max(1, job.estimatedMinutes) * Math.max(1, job.quantity) * 60_000);
  const queueMinutes = Math.max(0, (start.getTime() - now.getTime()) / 60_000);
  score += Math.max(0, 10 - Math.min(10, queueMinutes / 60));
  reasons.push(queueMinutes < 1 ? "可立即开始" : `预计 ${Math.ceil(queueMinutes)} 分钟后空闲`);
  score += Math.max(0, 6 - Math.max(1, Math.min(5, job.priority)));
  if (job.priority <= 2) reasons.push("高优先级任务获得加权");
  if (job.dueAt) {
    const due = Date.parse(job.dueAt);
    if (Number.isFinite(due) && end.getTime() > due) conflicts.push({ code: "DEADLINE_RISK", level: "warning", message: `预计完成时间超过交期 ${Math.ceil((end.getTime() - due) / 3_600_000)} 小时` });
    else if (Number.isFinite(due)) { score += 5; reasons.push("预计可在交期前完成"); }
  }
  return { printerId: printer.id, printerName: printer.name, score: Math.round(score * 10) / 10, eligible, plannedStartAt: start.toISOString(), plannedEndAt: end.toISOString(), reasons, conflicts };
}

export function rankPrinters(job: SchedulingJob, printers: SchedulingPrinter[], now = new Date()) {
  const candidates = printers.map(printer => scorePrinter(job, printer, now)).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
  return { jobId: job.id, jobNo: job.jobNo, recommended: candidates.find(candidate => candidate.eligible) ?? null, candidates, conflicts: candidates.every(candidate => !candidate.eligible) ? [{ code: "NO_COMPATIBLE_PRINTER", level: "block" as const, message: "没有兼容且可用的打印机" }] : [] };
}
