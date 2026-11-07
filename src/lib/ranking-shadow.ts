/**
 * Shadow ranking only. Nothing here changes search order, badges, or fees.
 */

export const RANKING_SHADOW = { live: false, weightsEnabled: false } as const;

export type ShadowKind =
  | "provider-cancel-confirmed"
  | "parent-withdrawal"
  | "enquiry"
  | "tour"
  | "emergency"
  | "safety"
  | "disputed";

export type ShadowEvent = {
  kind: ShadowKind;
  evidence: boolean;
  disputed: boolean;
};

export function countsTowardShadowRate(event: ShadowEvent): boolean {
  if (event.disputed) return false;
  if (!event.evidence) return false;
  return event.kind === "provider-cancel-confirmed";
}

export function shadowCommitmentRate(input: { events: ShadowEvent[]; confirmedCommitments: number }): {
  apply: false;
  frozen: true;
  rate: number | null;
  reason: "low-volume" | "shadow-only";
} {
  const eligible = input.events.filter(countsTowardShadowRate).length;
  if (input.confirmedCommitments < 8) {
    return { apply: false, frozen: true, rate: null, reason: "low-volume" };
  }
  return {
    apply: false,
    frozen: true,
    rate: eligible / input.confirmedCommitments,
    reason: "shadow-only",
  };
}
