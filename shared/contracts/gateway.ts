export type GatewayStatus = "registering" | "online" | "degraded" | "offline" | "revoked";

export interface GatewayHeartbeat {
  gatewayId: string;
  sequence: number;
  status: Exclude<GatewayStatus, "registering" | "revoked">;
  version: string;
  sentAt: string;
  discoveredDevices: number;
  connectedDevices: number;
  queuedEvents: number;
  queuedCommands: number;
  diagnostics?: Record<string, string | number | boolean | null>;
}

export interface GatewayRegistration {
  gatewayId: string;
  name: string;
  version: string;
  platform: string;
  publicKey?: string;
}
