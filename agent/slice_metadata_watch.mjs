import { SliceInboxWatcher } from "../slice-metadata/watch.mjs";

export function createSliceMetadataAdapter({inbox,onMetadata,onError,settleMs}){
  return new SliceInboxWatcher({root:inbox,settleMs,onImport:onMetadata,onError});
}

// The host Agent owns scheduling and transport. This adapter only reads files
// and emits immutable metadata payloads; it never moves files or controls a printer.
export async function pollSliceMetadata(adapter){return adapter.scan()}
