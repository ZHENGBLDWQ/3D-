import test from "node:test";
import assert from "node:assert/strict";
import { assembleLivePreflightInput, LivePreflightError } from "../preflight/live-input.ts";
import { evaluatePreflight } from "../preflight/evaluate.ts";

const now = new Date("2026-07-21T10:00:00.000Z");
const base = () => ({
  slice: { id: 7, organization_id: 1, status: "succeeded", request_json: JSON.stringify({ profiles: { printer: { name: "A1", config: { model: "A1", nozzleDiameter: .4, buildPlate: "Textured PEI" } }, filaments: [{ config: { material: "PLA" } }] } }), result_json: JSON.stringify({ status: "succeeded", output: { objectKey: "sliced/a.3mf", sha256: "abc", filamentUsage: [{ slot: 1, material: "PLA", grams: 100 }] } }) },
  printer: { id: 2, organization_id: 1, model: "A1", nozzle_diameter: .4, status: "空闲", connection_state: "online", last_seen_at: "2026-07-21T09:59:00.000Z", capabilities: JSON.stringify({ buildPlate: "Textured PEI" }) },
  order: { id: 3, organization_id: 1, status: "生产中" },
  slots: [{ ams_unit: 0, tray_index: 0, material: "PLA", last_seen_at: "2026-07-21T09:59:00.000Z" }],
  allocations: [{ ams_unit: 0, tray_index: 0, material: "PLA", remaining_grams: 180 }],
});

function database(data) { return { prepare(sql) { let values = []; return { bind(...next) { values = next; return this; }, async first() { if (sql.includes("FROM slicing_jobs")) return data.slice.organization_id === values[1] && data.slice.id === values[0] ? data.slice : null; if (sql.includes("FROM printers")) return data.printer.organization_id === values[1] && data.printer.id === values[0] ? data.printer : null; if (sql.includes("FROM orders")) return data.order.organization_id === values[1] && data.order.id === values[0] ? data.order : null; return null; }, async all() { if (sql.includes("bambu_ams_slots")) return { results: data.slots }; if (sql.includes("inventory_printer_allocations")) return { results: data.allocations }; return { results: [] }; } }; } }; }
const context = { organizationId: 1, printerScope: [2], canDispatch: true, canOverride: true };
const selection = { slicingJobId: 7, printerId: 2, orderId: 3 };

test("live preflight rejects a slicing job from another organization", async () => { const data = base(); data.slice.organization_id = 9; await assert.rejects(() => assembleLivePreflightInput(database(data), selection, context, now), error => error instanceof LivePreflightError && error.status === 404); });
test("live preflight rejects a printer outside the operator scope", async () => { await assert.rejects(() => assembleLivePreflightInput(database(base()), { ...selection, printerId: 8 }, context, now), error => error instanceof LivePreflightError && error.status === 403); });
test("live preflight rejects a missing slicing result", async () => { const data = base(); data.slice.result_json = null; await assert.rejects(() => assembleLivePreflightInput(database(data), selection, context, now), error => error instanceof LivePreflightError && error.status === 409); });
test("live preflight blocks when the allocated AMS inventory is insufficient", async () => { const data = base(); data.allocations[0].remaining_grams = 100; const input = await assembleLivePreflightInput(database(data), selection, context, now); const result = evaluatePreflight(input); assert.equal(result.level, "block"); assert.ok(result.checks.some(item => item.code === "MATERIAL_INSUFFICIENT")); });
test("live preflight passes with fresh matching device and sufficient allocation", async () => { const input = await assembleLivePreflightInput(database(base()), selection, context, now); const result = evaluatePreflight(input); assert.equal(result.level, "pass"); assert.equal(result.dispatchAllowed, true); });
