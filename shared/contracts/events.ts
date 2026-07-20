import type { PrinterCapabilities, PrinterSnapshot } from "./printer";

export type MaterialSlotSnapshot = {
  unit: number;
  slot: number;
  material?: string;
  colorHex?: string;
  remainingPercent?: number;
  active: boolean;
};

export type PrinterEvent =
  | { id: string; type: "printer.snapshot"; occurredAt: string; data: PrinterSnapshot }
  | { id: string; type: "printer.capabilities"; occurredAt: string; data: PrinterCapabilities }
  | { id: string; type: "printer.materials"; occurredAt: string; data: { bindingId: number; slots: MaterialSlotSnapshot[] } }
  | { id: string; type: "printer.alert"; occurredAt: string; data: { bindingId: number; code?: string; message: string; severity: "info" | "warning" | "critical" } };

export const PRINTER_EVENT_TYPES: PrinterEvent["type"][] = [
  "printer.snapshot",
  "printer.capabilities",
  "printer.materials",
  "printer.alert",
];
