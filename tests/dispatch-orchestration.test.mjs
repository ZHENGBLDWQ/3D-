import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {
  buildReservationRequests,
  decideDispatch,
  dispatchIdempotencyKey,
  nextReservationStatus,
} from "../dispatch/orchestration.ts";

const root=new URL("../",import.meta.url);
const read=path=>readFile(new URL(path,root),"utf8");

test("dispatch decisions reject unsafe runs and require an administrator override",()=>{
  assert.equal(decideDispatch({level:"block",overrideAllowed:false,role:"owner"}).allowed,false);
  assert.equal(decideDispatch({level:"unknown",overrideAllowed:false,role:"owner"}).allowed,false);
  assert.equal(decideDispatch({level:"warning",overrideAllowed:true,role:"operator",overrideReason:"accepted risk"}).allowed,false);
  assert.equal(decideDispatch({level:"warning",overrideAllowed:true,role:"manager",overrideReason:"accepted risk"}).overridden,true);
  assert.equal(decideDispatch({level:"pass",overrideAllowed:false,role:"operator"}).allowed,true);
});

test("reservation planning includes purge, safety and minimum reserve",()=>{
  const rows=buildReservationRequests({
    file:{complete:true,sliced:true,printerModel:"A1",nozzleMm:.4,buildPlate:"pei"},
    printer:{id:1,model:"A1",nozzleMm:.4,buildPlate:"pei",online:true},
    materialRequirements:[{slot:"A1",material:"PLA",slicedGrams:100,purgeGrams:10,safetyPercent:10,minimumReserveGrams:5}],
    materialSlots:[{slot:"A1",material:"PLA",remainingGrams:200}],order:{valid:true},permission:{canDispatch:true},
  });
  assert.deepEqual(rows,[{slot:"A1",material:"PLA",grams:126}]);
});

test("duplicate requests share the same workflow and command key",()=>{
  const first=dispatchIdempotencyKey(7,22,93),second=dispatchIdempotencyKey(7,22,93);
  assert.equal(first,second);
  assert.notEqual(first,dispatchIdempotencyKey(8,22,93));
});

test("reservation lifecycle releases capacity on cancel and fail",()=>{
  assert.equal(nextReservationStatus("start"),"allocated");
  assert.equal(nextReservationStatus("issue"),"issued");
  assert.equal(nextReservationStatus("cancel"),"released");
  assert.equal(nextReservationStatus("fail"),"released");
});

test("migration and API enforce atomic idempotency, stock and organization boundaries",async()=>{
  const [migration,api,ensure]=await Promise.all([
    read("drizzle/0028_dispatch_orchestration.sql"),read("app/api/dispatch/route.ts"),read("db/ensure-schema.ts"),
  ]);
  assert.match(migration,/UNIQUE \(`workflow_key`\)/);
  assert.match(migration,/UNIQUE \(`workflow_id`,`batch_id`,`slot`\)/);
  assert.match(migration,/material_reservations_prevent_overbooking/);
  assert.match(migration,/MATERIAL_RESERVATION_INSUFFICIENT/);
  assert.match(api,/db\.batch\(statements\)/);
  assert.match(api,/printer_commands\(printer_id,binding_id,idempotency_key/);
  assert.match(api,/pb\.organization_id=\?/);
  assert.match(api,/preflight_runs WHERE organization_id=\?/);
  assert.match(api,/eligibleReservationStates/);
  assert.match(ensure,/id:28,sql:migration0028/);
});
