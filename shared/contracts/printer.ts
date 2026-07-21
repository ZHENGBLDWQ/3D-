export const PRINTER_STATUSES = [
  "unknown",
  "offline",
  "idle",
  "preparing",
  "printing",
  "paused",
  "completed",
  "error",
  "maintenance",
] as const;

export type PrinterStatus = (typeof PRINTER_STATUSES)[number];

export type PrinterCapability =
  | "discovery"
  | "liveStatus"
  | "uploadFile"
  | "remoteStart"
  | "pause"
  | "resume"
  | "cancel"
  | "camera"
  | "ams"
  | "externalSpool";

export interface PrinterCapabilities {
  supported: PrinterCapability[];
  supportedFiles: string[];
  materialSystem: "ams" | "single" | "unknown";
  buildVolumeMm?: { width: number; depth: number; height: number };
  nozzleDiametersMm?: number[];
}

export interface PrinterSnapshot {
  printerId: number;
  bindingId: number;
  status: PrinterStatus;
  progressPercent?: number;
  remainingSeconds?: number;
  currentFile?: string;
  nozzleTemperatureC?: number;
  nozzleTargetTemperatureC?: number;
  bedTemperatureC?: number;
  bedTargetTemperatureC?: number;
  currentLayer?: number;
  totalLayers?: number;
  taskId?: string;
  sessionKey?: string;
  errorCode?: string;
  observedAt: string;
}
