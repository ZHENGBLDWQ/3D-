export const PRINTER_COMMAND_TYPES = [
  "refresh",
  "upload",
  "start",
  "pause",
  "resume",
  "cancel",
] as const;

export type PrinterCommandType = (typeof PRINTER_COMMAND_TYPES)[number];
export type PrinterCommandStatus = "pending" | "dispatched" | "acknowledged" | "succeeded" | "failed" | "timed_out" | "cancelled";

export interface PrinterCommand<TPayload = Record<string, unknown>> {
  idempotencyKey: string;
  printerId: number;
  bindingId: number;
  type: PrinterCommandType;
  payload: TPayload;
  requestedBy: string;
  createdAt: string;
  expiresAt?: string;
}

export interface PrinterCommandReceipt {
  idempotencyKey: string;
  status: PrinterCommandStatus;
  acknowledgedAt: string;
  deviceMessage?: string;
  retryable?: boolean;
}
