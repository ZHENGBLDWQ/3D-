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
