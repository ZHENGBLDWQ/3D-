import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

export const FEATURES = Object.freeze(["model","support","support_interface","purge","wipe_tower","brim","calibration","unknown"]);
export const TOOLHEADS = Object.freeze(["main","auxiliary","left","right","unknown"]);

const featureAliases = [
  [/support[ _-]*(interface|transition)|support material interface/i,"support_interface"],
  [/wipe[ _-]*tower|prime[ _-]*tower/i,"wipe_tower"],
  [/purge|flush|change filament/i,"purge"],
  [/support/i,"support"],
  [/brim|skirt/i,"brim"],
  [/calibrat|prime line|custom/i,"calibration"],
  [/outer wall|inner wall|overhang wall|sparse infill|internal solid infill|top surface|bottom surface|bridge|gap infill|model/i,"model"],
];

export function normalizeFeature(value=""){
  for(const [pattern,feature] of featureAliases)if(pattern.test(value))return feature;
  return "unknown";
}

export function stableFingerprint(data){return createHash("sha256").update(data).digest("hex")}

function extrusionMass(lengthMm,diameterMm,densityGcm3){
  const volumeMm3=lengthMm*Math.PI*(diameterMm/2)**2;
  return volumeMm3/1000*densityGcm3;
}

function numberFrom(line,letter){const match=line.match(new RegExp(`(?:^|\\s)${letter}(-?\\d+(?:\\.\\d+)?)`,`i`));return match?Number(match[1]):null}

export function parseGcode(input,options={}){
  const bytes=Buffer.isBuffer(input)?input:Buffer.from(input);
  const text=bytes.toString("utf8");
  const diameter=Number(options.filamentDiameterMm??1.75), defaultDensity=Number(options.defaultDensityGcm3??1.24);
  const densities=new Map(Object.entries(options.densityByFilament??{}).map(([key,value])=>[Number(key),Number(value)]));
  const toolheadByTool=new Map(Object.entries(options.toolheadByTool??{}).map(([key,value])=>[Number(key),TOOLHEADS.includes(String(value))?String(value):"unknown"]));
  let plate=Number(options.plate??1),layer=-1,feature="unknown",tool=0,toolhead=toolheadByTool.get(0)??"unknown",filament=0,absolute=true,lastE=0;
  const rows=new Map(), layers=[];
  const layerTotals=new Map();
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim(); if(!line)continue;
    let match=line.match(/^;\s*(?:plate(?:_idx)?|plate id)\s*[:=]\s*(\d+)/i);if(match){plate=Number(match[1]);continue}
    match=line.match(/^;\s*(?:layer(?:_num|_change)?|layer)\s*[:=]?\s*(\d+)/i);if(match){layer=Number(match[1]);continue}
    match=line.match(/^;\s*(?:type|feature|line_type)\s*[:=]\s*(.+)$/i);if(match){feature=normalizeFeature(match[1]);continue}
    match=line.match(/^;\s*(?:filament(?:_id| id)?|extruder)\s*[:=]\s*(\d+)/i);if(match){filament=Number(match[1]);continue}
    match=line.match(/^T(\d+)\b/i);if(match){tool=Number(match[1]);filament=tool;toolhead=toolheadByTool.get(tool)??"unknown";continue}
    match=line.match(/^M620\s+S(\d+)(?:A)?/i);if(match){filament=Number(match[1]);continue}
    if(/^M82\b/i.test(line)){absolute=true;continue}if(/^M83\b/i.test(line)){absolute=false;continue}
    if(/^G92\b/i.test(line)){const value=numberFrom(line,"E");if(value!=null)lastE=value;continue}
    if(!/^G[01]\b/i.test(line))continue;
    const e=numberFrom(line,"E");if(e==null)continue;
    const delta=absolute?e-lastE:e;if(absolute)lastE=e;if(delta<=0)continue;
    const density=densities.get(filament)??defaultDensity, grams=extrusionMass(delta,diameter,density);
    const key=`${plate}|${filament}|${toolhead}|${tool}|${feature}`;
    const row=rows.get(key)??{plate,filament,toolhead,toolIndex:tool,feature,extrusionMm:0,estimatedGrams:0};row.extrusionMm+=delta;row.estimatedGrams+=grams;rows.set(key,row);
    const layerKey=`${plate}|${layer}`;const current=layerTotals.get(layerKey)??{plate,layer,gramsByFeature:Object.fromEntries(FEATURES.map(x=>[x,0])),totalGrams:0};current.gramsByFeature[feature]+=grams;current.totalGrams+=grams;layerTotals.set(layerKey,current);
  }
  const sortedLayers=[...layerTotals.values()].sort((a,b)=>a.plate-b.plate||a.layer-b.layer);const cumulative=new Map();
  for(const item of sortedLayers){const previous=cumulative.get(item.plate)??Object.fromEntries(FEATURES.map(x=>[x,0]));const next={...previous};for(const name of FEATURES)next[name]+=item.gramsByFeature[name];cumulative.set(item.plate,next);layers.push({...item,cumulativeGramsByFeature:{...next},cumulativeTotalGrams:Object.values(next).reduce((a,b)=>a+b,0)})}
  const usage=[...rows.values()].sort((a,b)=>a.plate-b.plate||a.filament-b.filament||a.toolIndex-b.toolIndex||a.feature.localeCompare(b.feature)).map(row=>({...row,extrusionMm:Number(row.extrusionMm.toFixed(5)),estimatedGrams:Number(row.estimatedGrams.toFixed(6))}));
  return {format:"gcode",fingerprint:stableFingerprint(bytes),byteLength:bytes.length,plateCount:new Set(usage.map(x=>x.plate)).size,usage,layers};
}

function unzipEntries(buffer){
  if(buffer.length<22)throw new Error("SLICE_ARCHIVE_CENTRAL_DIRECTORY_MISSING");
  const entries=[];let eocd=-1;
  for(let offset=buffer.length-22;offset>=Math.max(0,buffer.length-65557);offset--)if(buffer.readUInt32LE(offset)===0x06054b50){eocd=offset;break}
  if(eocd<0)throw new Error("SLICE_ARCHIVE_CENTRAL_DIRECTORY_MISSING");
  const count=buffer.readUInt16LE(eocd+10),centralOffset=buffer.readUInt32LE(eocd+16);let cursor=centralOffset;
  for(let index=0;index<count;index++){
    if(cursor+46>buffer.length||buffer.readUInt32LE(cursor)!==0x02014b50)throw new Error("SLICE_ARCHIVE_CENTRAL_DIRECTORY_INVALID");
    const method=buffer.readUInt16LE(cursor+10),compressedSize=buffer.readUInt32LE(cursor+20),nameLength=buffer.readUInt16LE(cursor+28),extraLength=buffer.readUInt16LE(cursor+30),commentLength=buffer.readUInt16LE(cursor+32),localOffset=buffer.readUInt32LE(cursor+42),name=buffer.subarray(cursor+46,cursor+46+nameLength).toString("utf8");
    if(localOffset+30>buffer.length||buffer.readUInt32LE(localOffset)!==0x04034b50)throw new Error("SLICE_ARCHIVE_LOCAL_HEADER_INVALID");
    const localNameLength=buffer.readUInt16LE(localOffset+26),localExtraLength=buffer.readUInt16LE(localOffset+28),start=localOffset+30+localNameLength+localExtraLength,end=start+compressedSize;if(end>buffer.length)throw new Error("SLICE_ARCHIVE_TRUNCATED");const compressed=buffer.subarray(start,end);
    if(method===0)entries.push({name,data:compressed});else if(method===8)entries.push({name,data:inflateRawSync(compressed)});else throw new Error(`SLICE_ARCHIVE_COMPRESSION_UNSUPPORTED:${method}`);
    cursor+=46+nameLength+extraLength+commentLength;
  }
  return entries;
}

export function parseSliced3mf(input,options={}){
  const bytes=Buffer.isBuffer(input)?input:Buffer.from(input), entries=unzipEntries(bytes);
  const gcodes=entries.filter(entry=>/\.gcode$/i.test(entry.name));if(!gcodes.length)throw new Error("SLICED_3MF_HAS_NO_GCODE");
  const usage=[],layers=[];
  gcodes.forEach((entry,index)=>{const inferred=Number(entry.name.match(/plate[_-]?(\d+)/i)?.[1]??index+1);const parsed=parseGcode(entry.data,{...options,plate:inferred});usage.push(...parsed.usage);layers.push(...parsed.layers)});
  return {format:"3mf",fingerprint:stableFingerprint(bytes),byteLength:bytes.length,plateCount:new Set(usage.map(x=>x.plate)).size,entries:gcodes.map(x=>x.name),usage,layers};
}

export function parseSliceFile(input,{fileName="slice.gcode",...options}={}){
  return /\.3mf$/i.test(fileName)?parseSliced3mf(input,options):parseGcode(input,options);
}

export function toUsageImport(result,source={}){
  return {protocol:"layertrace.slice-metadata/v1",source:{fileName:source.fileName??"",observedAt:source.observedAt??new Date().toISOString(),watchRoot:source.watchRoot??""},file:{format:result.format,fingerprint:result.fingerprint,byteLength:result.byteLength,plateCount:result.plateCount},usage:result.usage.map(row=>({...row,feature:FEATURES.includes(row.feature)?row.feature:"unknown"})),layers:result.layers};
}
