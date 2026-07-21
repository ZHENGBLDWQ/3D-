import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { rankPrinters, scorePrinter } from "../scheduling/score.ts";

const now = new Date("2026-07-21T08:00:00.000Z");
const printer = (id, model, patch = {}) => ({ id, name: `${model}-${id}`, model, nozzleDiameter: .4, status: "idle", connectionState: "connected", supportedFiles: ["3mf", "gcode"], availableAt: now.toISOString(), amsSlots: [{ material: "PLA", remainingGrams: 500 }], ...patch });
const job = (model, patch = {}) => ({ id: 10, jobNo: "JOB-010", requiredModel: model, nozzleDiameter: .4, fileFormat: "3mf", estimatedMinutes: 120, quantity: 1, priority: 2, dueAt: "2026-07-21T14:00:00.000Z", materials: [{ material: "PLA", grams: 120 }], ...patch });

for (const model of ["A1", "X2D", "P2S"]) test(`${model} is recommended only to its compatible Bambu model`, () => {
  const result = rankPrinters(job(model), [printer(1, "A1"), printer(2, "X2D"), printer(3, "P2S")], now);
  assert.equal(result.recommended?.printerName, `${model}-${model === "A1" ? 1 : model === "X2D" ? 2 : 3}`);
  assert.equal(result.candidates.filter(item => item.eligible).length, 1);
});

test("queue time and deadline produce an explainable deadline conflict", () => {
  const result = scorePrinter(job("A1", { dueAt: "2026-07-21T10:00:00.000Z" }), printer(1, "A1", { availableAt: "2026-07-21T09:30:00.000Z" }), now);
  assert.ok(result.conflicts.some(item => item.code === "DEADLINE_RISK"));
  assert.ok(result.reasons.some(item => item.includes("90 分钟后空闲")));
});

test("offline best match is excluded and workload is replanned to another matching printer", () => {
  const result = rankPrinters(job("A1"), [printer(1, "A1", { connectionState: "offline" }), printer(2, "A1")], now);
  assert.equal(result.recommended?.printerId, 2);
  assert.ok(result.candidates.find(item => item.printerId === 1)?.conflicts.some(item => item.code === "PRINTER_OFFLINE"));
});

test("no compatible device returns a top-level blocking conflict", () => {
  const result = rankPrinters(job("X2D"), [printer(1, "A1"), printer(2, "P2S")], now);
  assert.equal(result.recommended, null);
  assert.equal(result.conflicts[0].code, "NO_COMPATIBLE_PRINTER");
});

test("AMS shortage makes an otherwise compatible printer ineligible", () => {
  const result = scorePrinter(job("A1"), printer(1, "A1", { amsSlots: [{ material: "PLA", remainingGrams: 80 }] }), now);
  assert.equal(result.eligible, false);
  assert.ok(result.conflicts.some(item => item.code === "MATERIAL_SHORTAGE"));
});

test("scheduling migration and API preserve recommend-only execution", async () => {
  const migration = await readFile(new URL("../drizzle/0027_intelligent_scheduling.sql", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/scheduling/route.ts", import.meta.url), "utf8");
  for (const table of ["production_plans", "production_plan_items", "printer_schedules", "schedule_conflicts", "schedule_revisions"]) assert.ok(migration.includes(`CREATE TABLE \`${table}\``));
  assert.match(route, /recommend_only/);
  assert.match(route, /dispatched: false/);
  assert.doesNotMatch(route, /printer_commands\s*\(/);
});
