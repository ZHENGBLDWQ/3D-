export const PURPOSES=["model","support","support_interface","purge","wipe_tower","brim","calibration","unknown"] as const;
export const TOOLHEADS=["main","auxiliary","left","right","unknown"] as const;
export type SliceUsage={plate:number;filament:number;toolhead:string;feature:string;estimatedGrams:number};
export type SliceLayer={plate:number;layer:number;cumulativeGramsByFeature:Record<string,number>};

export function validateSlicePayload(input:unknown){
 const p=input as Record<string,any>;if(!p||p.protocol!=="layertrace.slice-metadata/v1")throw new Error("SLICE_PROTOCOL_UNSUPPORTED");
 if(!/^[a-f0-9]{64}$/i.test(String(p.file?.fingerprint||"")))throw new Error("SLICE_FINGERPRINT_INVALID");
 if(!["3mf","gcode"].includes(String(p.file?.format||"")))throw new Error("SLICE_FORMAT_INVALID");
 if(!Array.isArray(p.usage)||!p.usage.length||p.usage.length>500)throw new Error("SLICE_USAGE_INVALID");
 if(!Array.isArray(p.layers)||p.layers.length>5000||JSON.stringify(p).length>1500000)throw new Error("SLICE_LAYERS_INVALID");
 const usage:SliceUsage[]=p.usage.map((row:Record<string,unknown>)=>{const plate=Number(row.plate),filament=Number(row.filament),estimatedGrams=Number(row.estimatedGrams),feature=String(row.feature),toolhead=String(row.toolhead);if(!Number.isInteger(plate)||plate<0||!Number.isInteger(filament)||filament<0||!Number.isFinite(estimatedGrams)||estimatedGrams<0||!PURPOSES.includes(feature as any)||!TOOLHEADS.includes(toolhead as any))throw new Error("SLICE_USAGE_ROW_INVALID");return{plate,filament,estimatedGrams,feature,toolhead}});
 return{protocol:p.protocol,source:{fileName:String(p.source?.fileName||"").slice(0,240),observedAt:String(p.source?.observedAt||new Date().toISOString())},file:{format:String(p.file.format),fingerprint:String(p.file.fingerprint).toLowerCase(),byteLength:Number(p.file.byteLength||0),plateCount:Number(p.file.plateCount||0)},usage,layers:p.layers as SliceLayer[]};
}

export function settledGramsForRow(row:SliceUsage,layers:SliceLayer[],lastLayerByPlate:Record<string,number>,completed:boolean){
 if(completed)return row.estimatedGrams;
 const last=Number(lastLayerByPlate[String(row.plate)]);if(!Number.isFinite(last))return 0;
 const candidates=layers.filter(layer=>Number(layer.plate)===row.plate&&Number(layer.layer)<=last).sort((a,b)=>b.layer-a.layer);
 const cumulative=Math.max(0,Number(candidates[0]?.cumulativeGramsByFeature?.[row.feature]||0));
 const total=Math.max(0,row.estimatedGrams);const plateFeatureTotal=Math.max(0,layers.filter(x=>Number(x.plate)===row.plate).reduce((max,x)=>Math.max(max,Number(x.cumulativeGramsByFeature?.[row.feature]||0)),0));
 return total===0||plateFeatureTotal===0?0:Math.min(total,total*cumulative/plateFeatureTotal);
}

export function materialCostCents(grams:number,centsPerKg:number){return Math.max(0,Math.round(Math.max(0,grams)*Math.max(0,centsPerKg)/1000))}
