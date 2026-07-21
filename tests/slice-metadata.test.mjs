import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,readFile,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { FEATURES,normalizeFeature,parseGcode,parseSliced3mf,stableFingerprint,toUsageImport } from "../slice-metadata/index.mjs";
import { SliceInboxWatcher } from "../slice-metadata/watch.mjs";

const fixture=new URL("./fixtures/slice-metadata/features.gcode",import.meta.url);

function zip(entries){let offset=0;const locals=[],centrals=[];for(const [name,data] of entries){const body=Buffer.from(data),compressed=deflateRawSync(body),file=Buffer.from(name),local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(body.length,22);local.writeUInt16LE(file.length,26);const part=Buffer.concat([local,file,compressed]);locals.push(part);const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(body.length,24);central.writeUInt16LE(file.length,28);central.writeUInt32LE(offset,42);centrals.push(Buffer.concat([central,file]));offset+=part.length}const directory=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,directory,end])}

test("normalizes every supported material feature and preserves unknown",()=>{
 const inputs={model:"Outer wall",support:"Support material",support_interface:"Support material interface",purge:"Flush",wipe_tower:"Wipe tower",brim:"Skirt",calibration:"Prime line",unknown:"Future slicer role"};
 for(const feature of FEATURES)assert.equal(normalizeFeature(inputs[feature]),feature);
});

test("parses plate, filament, toolhead, feature and cumulative layer usage",async()=>{
 const data=await readFile(fixture),result=parseGcode(data,{densityByFilament:{3:1.05},toolheadByTool:{0:"main",1:"auxiliary"}});
 assert.equal(result.fingerprint,stableFingerprint(data));assert.equal(result.plateCount,1);assert.equal(result.usage.every(row=>row.plate===2),true);
 assert.deepEqual(new Set(result.usage.map(row=>row.feature)),new Set(FEATURES));
 const calibration=result.usage.find(row=>row.feature==="calibration");assert.equal(calibration.filament,3);assert.equal(calibration.toolhead,"auxiliary");assert.equal(calibration.toolIndex,1);
 assert.equal(result.layers.length,2);assert.ok(result.layers[1].cumulativeTotalGrams>result.layers[0].cumulativeTotalGrams);
 assert.equal(result.layers[1].cumulativeGramsByFeature.unknown>0,true);
});

test("parses sliced 3mf gcode entries and retains archive fingerprint",async()=>{
 const gcode=await readFile(fixture),archive=zip([["Metadata/plate_2.gcode",gcode]]),result=parseSliced3mf(archive);
 assert.equal(result.format,"3mf");assert.equal(result.entries[0],"Metadata/plate_2.gcode");assert.equal(result.fingerprint,stableFingerprint(archive));assert.ok(result.usage.length>=8);
 const payload=toUsageImport(result,{fileName:"job.3mf",observedAt:"2026-07-21T00:00:00.000Z"});assert.equal(payload.protocol,"layertrace.slice-metadata/v1");assert.equal(payload.usage.some(row=>!FEATURES.includes(row.feature)),false);
});

test("rejects unsliced 3mf instead of inventing usage",()=>{assert.throws(()=>parseSliced3mf(zip([["3D/3dmodel.model","<model/>"]])),/SLICED_3MF_HAS_NO_GCODE/)});

test("watcher waits for stable files and emits each unchanged fingerprint once",async()=>{
 const root=await mkdtemp(join(tmpdir(),"layertrace-slice-")),imports=[];await writeFile(join(root,"job.gcode"),await readFile(fixture));
 const watcher=new SliceInboxWatcher({root,settleMs:0,onImport:payload=>imports.push(payload)});
 assert.equal((await watcher.scan()).length,0);assert.equal((await watcher.scan()).length,1);assert.equal((await watcher.scan()).length,0);assert.equal(imports.length,1);
 await writeFile(join(root,"job.gcode"),`${await readFile(fixture,"utf8")}\n; changed`);assert.equal((await watcher.scan()).length,0);assert.equal((await watcher.scan()).length,1);
});
