import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {buildCsv,normalizeRange,safeCsvCell,summarize} from "../reporting/report.ts";

test("report range validates order and maximum span",()=>{
  assert.deepEqual(normalizeRange("2026-07-01","2026-07-31"),{from:"2026-07-01",to:"2026-07-31"});
  assert.throws(()=>normalizeRange("2026-08-01","2026-07-31"),/开始日期/);
  assert.throws(()=>normalizeRange("2025-01-01","2026-07-31"),/367 天/);
});

test("summary keeps MYR values in integer cents",()=>{
  const summary=summarize([{date:"2026-07-01",orders:1,revenueCents:10001,completed:2,failed:1,goodUnits:8,failedUnits:2,actualGrams:52.2,materialCostCents:522,otherCostCents:100,productiveMinutes:720}],1);
  assert.equal(summary.totalCostCents,622);assert.equal(summary.profitCents,9379);assert.equal(summary.yieldBasisPoints,8000);assert.equal(summary.utilizationBasisPoints,5000);
});

test("CSV neutralizes spreadsheet formulas and quotes every field",()=>{
  for(const input of ["=CMD()","+1+1","-2+3","@SUM(A1)"," \t=evil"]){const cell=safeCsvCell(input);assert.match(cell,/^"'/);}
  const csv=buildCsv([{date:"=WEBSERVICE(\"https://bad\")",orders:0,revenueCents:0,completed:0,failed:0,goodUnits:0,failedUnits:0,actualGrams:0,materialCostCents:0,otherCostCents:0,productiveMinutes:0}]);
  assert.ok(csv.startsWith("\uFEFF"));assert.match(csv,/'=WEBSERVICE/);assert.doesNotMatch(csv,/\r\n=WEBSERVICE/);
});

test("report API requires finance permission, scopes every query, and audits exports",async()=>{
  const api=await readFile(new URL("../app/api/reports/route.ts",import.meta.url),"utf8"),data=await readFile(new URL("../reporting/data.ts",import.meta.url),"utf8"),migration=await readFile(new URL("../drizzle/0034_reporting_exports.sql",import.meta.url),"utf8");
  assert.match(api,/finance\.read/);assert.match(api,/report_exports/);assert.match(api,/recordAudit/);assert.match(api,/no-store/);
  assert.equal((data.match(/organization_id=\?/g)??[]).length,6);assert.match(data,/printer_bindings WHERE organization_id=\?/);
  assert.match(data,/BETWEEN date\(\?\) AND date\(\?\)/);assert.match(migration,/report_exports_org_created_idx/);
});
