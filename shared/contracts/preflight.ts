export const PREFLIGHT_LEVELS = ["pass", "warning", "block", "unknown"] as const;
export type PreflightLevel = (typeof PREFLIGHT_LEVELS)[number];

export interface PreflightCheck {
  code: string;
  category: "file" | "printer" | "material" | "production" | "permission";
  level: PreflightLevel;
  message: string;
  details?: Record<string, unknown>;
  resolutionActions?: string[];
}

export interface PreflightResult {
  runId: string;
  level: PreflightLevel;
  dispatchAllowed: boolean;
  overrideAllowed: boolean;
  checks: PreflightCheck[];
  evaluatedAt: string;
  dataFreshAt?: string;
}

export interface PreflightMaterialRequirement {
  slot: string;
  material: string;
  slicedGrams: number;
  purgeGrams?: number;
  safetyPercent?: number;
  minimumReserveGrams?: number;
}

export interface PreflightMaterialSlot {
  slot: string;
  material: string;
  remainingGrams?: number;
  observedAt?: string;
}

export interface PreflightInput {
  runId?: string;
  file: { complete: boolean; sliced: boolean; printerModel: string; nozzleMm: number; buildPlate: string };
  printer: { id: number; model: string; nozzleMm: number; buildPlate: string; online: boolean; fault?: string; observedAt?: string };
  materialRequirements: PreflightMaterialRequirement[];
  materialSlots: PreflightMaterialSlot[];
  order: { valid: boolean; reason?: string };
  permission: { canDispatch: boolean; canOverride?: boolean };
  freshnessMinutes?: number;
  now?: string;
}
