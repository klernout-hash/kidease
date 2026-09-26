/**
 * Pure rules for daycare add-ons. Amounts stay in DAYCARE_ADDONS.
 * A purchase names one centre. The effect applies only there.
 */

export function resolveAddonCentre(centreIds: readonly string[], requested: string | null | undefined): string | null {
  const ids = [...new Set(centreIds.map((id) => String(id || "").trim()).filter(Boolean))];
  const want = String(requested || "").trim();
  if (want) return ids.includes(want) ? want : null;
  if (ids.length === 1) return ids[0] ?? null;
  return null;
}

/** Pro pins every centre on that plan. The add-on pins only the centre that was bought. */
export function featuredPinForCentre(input: {
  pro: boolean;
  addonActive: boolean;
  purchasedCentreId?: string | null;
  centreId: string;
}): boolean {
  if (input.pro) return true;
  if (!input.addonActive) return false;
  const purchased = String(input.purchasedCentreId || "").trim();
  if (!purchased) return true;
  return purchased === input.centreId;
}

export type OpenJobCredit = { paymentId: string; centreId?: string | null };

/** Prefer a credit bought for this centre. A legacy row with no centre can be used anywhere. */
export function pickUnspentJobCredit(credits: readonly OpenJobCredit[], centreId: string): OpenJobCredit | null {
  const want = String(centreId || "").trim();
  if (!want) return null;
  const open = credits.filter((row) => String(row.paymentId || "").trim());
  const exact = open.find((row) => String(row.centreId || "").trim() === want);
  if (exact) return exact;
  return open.find((row) => !String(row.centreId || "").trim()) ?? null;
}

export function jobPostSpend(input: {
  credits: number;
  purchasedCentreId?: string | null;
  centreId: string;
  role: string;
}): { ok: true } | { ok: false; reason: "role" | "credits" | "centre" } {
  if (String(input.role || "").trim().length < 2) return { ok: false, reason: "role" };
  if (!Number.isFinite(input.credits) || input.credits < 1) return { ok: false, reason: "credits" };
  const purchased = String(input.purchasedCentreId || "").trim();
  if (purchased && purchased !== input.centreId) return { ok: false, reason: "centre" };
  return { ok: true };
}

export function adminAddonLine(input: {
  featured: boolean;
  claimUntil?: string | null;
  claimPending?: boolean;
  jobCredits?: number;
  jobPosts?: number;
  now?: number;
}): string | null {
  const parts: string[] = [];
  if (input.featured) parts.push("Featured city");
  const until = input.claimUntil ? Date.parse(input.claimUntil) : NaN;
  const now = input.now ?? Date.now();
  if (Number.isFinite(until) && until > now) {
    parts.push(`Claim boost until ${input.claimUntil!.slice(0, 10)}`);
  } else if (input.claimPending) {
    parts.push("Claim boost waiting on the claim");
  }
  const credits = Math.max(0, Math.floor(Number(input.jobCredits) || 0));
  if (credits > 0) parts.push(`${credits} job credit${credits === 1 ? "" : "s"}`);
  const posts = Math.max(0, Math.floor(Number(input.jobPosts) || 0));
  if (posts > 0) parts.push(`${posts} staff opening${posts === 1 ? "" : "s"}`);
  if (!parts.length) return null;
  return `Add-ons: ${parts.join(" · ")}`;
}
