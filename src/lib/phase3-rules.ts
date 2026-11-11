/**
 * Phase 3 rules and the two Phase 4 items that are allowed.
 * Flags default off. Texts are not sent. Stripe stays in test mode and is not charged.
 * Skipped on purpose: LRN-07 framework alignment, LOC-03 extra languages,
 * and the Phase 4 holds (CRM, bulk email, payroll, sensors, photo sales, handbooks, IAP).
 */

export function badgeAllowed(input: { methodPublished: boolean; meetsRule: boolean }): boolean {
  return input.methodPublished && input.meetsRule;
}

export function inspectionShown(rows: readonly { source: string; date: string | null }[]): number {
  return rows.filter((row) => row.source === "public" && Boolean(row.date)).length;
}

export function provinceReportReady(input: { province: string; rows: number }): boolean {
  return input.province.trim().length === 2 && input.rows > 0;
}

export function formSms(): { deliver: false; reason: "send_disabled" } {
  return { deliver: false, reason: "send_disabled" };
}

export function emergencySms(): { deliver: false; reason: "send_disabled" } {
  return { deliver: false, reason: "send_disabled" };
}

export const TRANSLATION_COPY = {
  en: "Translation is not running. This screen only shows where it would go.",
  fr: "La traduction ne tourne pas. Cet écran montre seulement où elle irait.",
} as const;

export function overtimeMinutes(input: { worked: number; scheduled: number }): number {
  if (input.worked < 0 || input.scheduled < 0) return 0;
  return Math.max(0, input.worked - input.scheduled);
}

export function testModePayment(input: { mode: "test" | "live" }): { charged: false; reason: "live_blocked" | "test_not_charged" } {
  if (input.mode === "live") return { charged: false, reason: "live_blocked" };
  return { charged: false, reason: "test_not_charged" };
}

export function refundFeeCents(amountCents: number): number | null {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return null;
  return Math.round(amountCents * 0.03);
}

export function officialGrantCents(input: { program: boolean; officialCents: number | null }): number | null {
  if (!input.program || input.officialCents == null || input.officialCents < 0) return null;
  return input.officialCents;
}

export function payoutLabel(status: string | null): "paid" | "pending" | "unknown" {
  if (status === "paid" || status === "pending") return status;
  return "unknown";
}

export function muniCount(rows: readonly { city: string }[], city: string): number {
  const want = city.trim().toLowerCase();
  if (!want) return 0;
  return rows.filter((row) => row.city.trim().toLowerCase() === want).length;
}

export const PUBLIC_SCOPES = ["listings:read", "families:read", "attendance:read"] as const;

export function scopeAllows(granted: readonly string[], need: string): boolean {
  if (need.startsWith("health") || need.includes("child-health")) return false;
  return (PUBLIC_SCOPES as readonly string[]).includes(need) && granted.includes(need);
}

export function parentCannotOpenPayouts(role: string | null | undefined): boolean {
  return role !== "owner" && role !== "billing";
}
