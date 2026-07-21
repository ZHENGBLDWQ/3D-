import { readdir,readFile,stat } from "node:fs/promises";
import { resolve } from "node:path";
import { parseSliceFile,toUsageImport } from "./index.mjs";

export class SliceInboxWatcher{
  constructor({root,settleMs=1500,onImport,onError=()=>{}}){if(!root)throw new Error("SLICE_WATCH_ROOT_REQUIRED");if(typeof onImport!=="function")throw new Error("SLICE_IMPORT_HANDLER_REQUIRED");this.root=resolve(root);this.settleMs=settleMs;this.onImport=onImport;this.onError=onError;this.seen=new Map()}
  async scan(){
    const names=(await readdir(this.root)).filter(name=>/\.(?:gcode|3mf)$/i.test(name)).sort();const now=Date.now(),imports=[];
    for(const name of names){const path=resolve(this.root,name);try{const info=await stat(path),signature=`${info.size}:${info.mtimeMs}`,known=this.seen.get(path);if(known?.fingerprint&&known.signature===signature)continue;if(!known||known.signature!==signature){this.seen.set(path,{signature,stableSince:now});continue}if(now-known.stableSince<this.settleMs)continue;const bytes=await readFile(path),result=parseSliceFile(bytes,{fileName:name}),payload=toUsageImport(result,{fileName:name,observedAt:new Date(info.mtimeMs).toISOString(),watchRoot:this.root});this.seen.set(path,{signature,stableSince:known.stableSince,fingerprint:result.fingerprint});await this.onImport(payload);imports.push(payload)}catch(error){await this.onError(error,{path,name})}}
    return imports;
  }
}
