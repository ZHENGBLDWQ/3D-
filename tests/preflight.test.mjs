import test from "node:test";
import assert from "node:assert/strict";
import {evaluatePreflight,requiredMaterialGrams} from "../preflight/evaluate.ts";

const input=(model="A1")=>({now:"2026-07-21T10:00:00.000Z",file:{complete:true,sliced:true,printerModel:model,nozzleMm:.4,buildPlate:"Textured PEI"},printer:{id:1,model,nozzleMm:.4,buildPlate:"Textured PEI",online:true,observedAt:"2026-07-21T09:59:00.000Z"},materialRequirements:[{slot:"A1",material:"PLA",slicedGrams:100,purgeGrams:10,safetyPercent:10,minimumReserveGrams:15}],materialSlots:[{slot:"A1",material:"PLA",remainingGrams:200}],order:{valid:true},permission:{canDispatch:true,canOverride:true}});

test("material requirement includes sliced, purge, safety and reserve",()=>assert.equal(requiredMaterialGrams(input().materialRequirements[0]),136));
for(const model of ["A1","X2D","P2S"])test(`${model} fixture passes complete preflight`,()=>{const result=evaluatePreflight(input(model));assert.equal(result.level,"pass");assert.equal(result.dispatchAllowed,true)});
test("insufficient AMS slot hard blocks dispatch",()=>{const value=input();value.materialSlots[0].remainingGrams=120;const result=evaluatePreflight(value);assert.equal(result.level,"block");assert.equal(result.dispatchAllowed,false);assert.ok(result.checks.some(check=>check.code==="MATERIAL_INSUFFICIENT"&&check.details.shortageGrams===16))});
test("stale telemetry warns and requires override",()=>{const value=input();value.printer.observedAt="2026-07-21T09:30:00.000Z";const result=evaluatePreflight(value);assert.equal(result.level,"warning");assert.equal(result.dispatchAllowed,false);assert.equal(result.overrideAllowed,true)});
test("unknown material amount cannot dispatch",()=>{const value=input();delete value.materialSlots[0].remainingGrams;const result=evaluatePreflight(value);assert.equal(result.level,"unknown");assert.equal(result.dispatchAllowed,false)});
