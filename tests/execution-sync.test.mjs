import assert from "node:assert/strict";
import test from "node:test";
import { classifyExecutionEvent } from "../execution/state.ts";

test("execution mapping applies supported device states",()=>{
  assert.equal(classifyExecutionEvent({status:"queued",lastEventAt:null},"printing","2026-01-01T00:00:01Z"),"apply:printing");
  assert.equal(classifyExecutionEvent({status:"printing",lastEventAt:null},"completed","2026-01-01T00:00:02Z"),"apply:completed");
  assert.equal(classifyExecutionEvent({status:"printing",lastEventAt:null},"error","2026-01-01T00:00:02Z"),"apply:failed");
});
test("duplicate and out-of-order events cannot move execution backwards",()=>{
  assert.equal(classifyExecutionEvent({status:"printing",lastEventAt:"2026-01-01T00:00:02Z"},"paused","2026-01-01T00:00:02Z"),"out_of_order_ignored");
  assert.equal(classifyExecutionEvent({status:"printing",lastEventAt:"2026-01-01T00:00:02Z"},"paused","2026-01-01T00:00:01Z"),"out_of_order_ignored");
  assert.equal(classifyExecutionEvent({status:"completed",lastEventAt:"2026-01-01T00:00:02Z"},"printing","2026-01-01T00:00:03Z"),"terminal_ignored");
});
test("events without a correctly bound organization workflow cannot mutate one",()=>{
  assert.equal(classifyExecutionEvent(null,"printing","2026-01-01T00:00:01Z"),"no_active_workflow");
  assert.equal(classifyExecutionEvent({status:"queued",lastEventAt:null},"offline","2026-01-01T00:00:01Z"),"offline_observed");
});
