/**
 * Shared hold for Phase 1 alerts. Outbound is always off.
 * Enable-time cutoff, one send, quiet hours, and CASL are decided here.
 * scripts/phase1-search.test.mjs and the other Phase 1 tests load this file.
 */

export type HoldReason = "flag_off" | "enable_time_unset" | "pre_enable" | "duplicate" | "quiet" | "casl" | "held";

export function holdAlert(input: {
  flagOn: boolean;
  enabledAt: string | null;
  occurredAt: string;
  alreadySent: boolean;
  quiet: boolean;
  needsCasl: boolean;
  caslOk: boolean;
}): { deliver: false; reason: HoldReason } {
  if (!input.flagOn) return { deliver: false, reason: "flag_off" };
  const enabled = input.enabledAt ? Date.parse(input.enabledAt) : NaN;
  if (!Number.isFinite(enabled)) return { deliver: false, reason: "enable_time_unset" };
  const occurred = Date.parse(input.occurredAt);
  if (!Number.isFinite(occurred) || occurred < enabled) return { deliver: false, reason: "pre_enable" };
  if (input.alreadySent) return { deliver: false, reason: "duplicate" };
  if (input.quiet) return { deliver: false, reason: "quiet" };
  if (input.needsCasl && !input.caslOk) return { deliver: false, reason: "casl" };
  return { deliver: false, reason: "held" };
}
