import type { PrinterCapabilities, PrinterSnapshot } from "./printer";

export type MaterialSlotSnapshot = {
  unit: number;
  slot: number;
  feedKind?: "ams" | "external";
  toolhead?: "main" | "auxiliary" | "left" | "right" | "unknown";
  material?: string;
  colorHex?: string;
  tagUid?: string;
  remainingPercent?: number;
  active: boolean;
};

export type PrintSessionSnapshot = {
  bindingId: number;
  externalSessionKey: string;
  source: "bambu_studio" | "printer_reprint" | "manual" | "unknown";
  phase: "started" | "printing" | "paused" | "completed" | "failed" | "cancelled";
  currentFile?: string;
  taskId?: string;
  progressPercent?: number;
  currentLayer?: number;
  totalLayers?: number;
  remainingSeconds?: number;
  observedAt: string;
};

export type PrinterEvent =
  | { id: string; type: "printer.snapshot"; occurredAt: string; data: PrinterSnapshot }
  | { id: string; type: "printer.capabilities"; occurredAt: string; data: PrinterCapabilities }
  | { id: string; type: "printer.materials"; occurredAt: string; data: { bindingId: number; slots: MaterialSlotSnapshot[] } }
  | { id: string; type: "print.session"; occurredAt: string; data: PrintSessionSnapshot }
  | { id: string; type: "printer.alert"; occurredAt: string; data: { bindingId: number; code?: string; message: string; severity: "info" | "warning" | "critical" } };

export const PRINTER_EVENT_TYPES: PrinterEvent["type"][] = [
  "printer.snapshot",
  "printer.capabilities",
  "printer.materials",
  "print.session",
  "printer.alert",
];
