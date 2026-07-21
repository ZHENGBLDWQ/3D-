import type { PreflightInput, PreflightLevel } from "../shared/contracts/preflight";

export type DispatchRole = "owner" | "manager" | "orders" | "operator" | "warehouse" | "finance" | "viewer";
export type DispatchDecision = { allowed: boolean; reason: string; overridden: boolean };

export function decideDispatch(input: {
  level: PreflightLevel;
  overrideAllowed: boolean;
  role: DispatchRole;
  overrideReason?: string;
}): DispatchDecision {
  if (input.level === "block" || input.level === "unknown") {
    return { allowed: false, reason: `preflight_${input.level}`, overridden: false };
  }
  if (input.level === "pass") return { allowed: true, reason: "preflight_passed", overridden: false };
  const administrator = input.role === "owner" || input.role === "manager";
  const reason = input.overrideReason?.trim() ?? "";
  if (!input.overrideAllowed || !administrator || reason.length < 6) {
    return { allowed: false, reason: "administrator_override_required", overridden: false };
  }
  return { allowed: true, reason, overridden: true };
}

export type MaterialReservationRequest = {
  slot: string;
  material: string;
  grams: number;
};

export function buildReservationRequests(input: PreflightInput): MaterialReservationRequest[] {
  return input.materialRequirements.map(requirement => ({
    slot: requirement.slot.trim(),
    material: requirement.material.trim(),
    grams: Number(((Math.max(0,requirement.slicedGrams)+Math.max(0,requirement.purgeGrams??0))*(1+Math.max(0,requirement.safetyPercent??8)/100)+Math.max(0,requirement.minimumReserveGrams??15)).toFixed(2)),
  }));
}

export function dispatchIdempotencyKey(organizationId: number, preflightRunId: number, jobId: number) {
  return `dispatch:${organizationId}:${preflightRunId}:${jobId}`;
}

export function nextReservationStatus(action: "start" | "issue" | "cancel" | "fail") {
  if (action === "start") return "allocated" as const;
  if (action === "issue") return "issued" as const;
  return "released" as const;
}
