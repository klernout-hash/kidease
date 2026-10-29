/** Parent multi-apply rules. Pure so the guards can be tested without a database. */

export const MULTI_APPLY_MAX = 5;
export const MULTI_APPLY_DUPLICATE_DAYS = 30;
export const MULTI_APPLY_DAILY_MAX = 15;

export type MultiSkipReason = "not_accepting" | "duplicate" | "cap" | "missing";

export type MultiApplyCentre = {
  id: string;
  live: boolean;
  phone?: string | null;
  website?: string | null;
};

export type MultiApplyPlan = {
  sendIds: string[];
  skipped: Array<{ daycareId: string; reason: MultiSkipReason }>;
  error?: "consent" | "rate" | "empty" | "too_many" | "details";
};

export function safeExternalUrl(value: string | null | undefined): string | null {
  const raw = (value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function centreAcceptsOnlineRequests(centre: { live?: boolean | null }): boolean {
  return centre.live === true;
}

export function childKey(name: string, birthdate: string): string {
  return `${name.trim().toLowerCase().replace(/\s+/g, " ")}|${birthdate.trim()}`;
}

export function withinDuplicateWindow(sentAt: string | Date, now = new Date()): boolean {
  const then = new Date(sentAt).getTime();
  if (!Number.isFinite(then)) return false;
  const ageMs = now.getTime() - then;
  return ageMs >= 0 && ageMs < MULTI_APPLY_DUPLICATE_DAYS * 24 * 60 * 60 * 1000;
}

export function planMultiApply(input: {
  daycareIds: string[];
  centres: readonly MultiApplyCentre[];
  shareConsent: boolean;
  childName: string;
  birthdate: string;
  startDate: string;
  recentRequestCount: number;
  recentChildCentres: readonly { daycareId: string; childKey: string; sentAt: string | Date }[];
  now?: Date;
}): MultiApplyPlan {
  if (!input.shareConsent) return { sendIds: [], skipped: [], error: "consent" };
  const name = input.childName.trim();
  const birth = input.birthdate.trim();
  const start = input.startDate.trim();
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(birth) || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return { sendIds: [], skipped: [], error: "details" };
  }
  const ids = [...new Set(input.daycareIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return { sendIds: [], skipped: [], error: "empty" };
  if (ids.length > MULTI_APPLY_MAX) return { sendIds: [], skipped: [], error: "too_many" };
  if (input.recentRequestCount >= MULTI_APPLY_DAILY_MAX) {
    return { sendIds: [], skipped: [], error: "rate" };
  }
  const byId = new Map(input.centres.map((centre) => [centre.id, centre]));
  const key = childKey(name, birth);
  const now = input.now ?? new Date();
  const sendIds: string[] = [];
  const skipped: MultiApplyPlan["skipped"] = [];
  for (const id of ids) {
    const centre = byId.get(id);
    if (!centre) {
      skipped.push({ daycareId: id, reason: "missing" });
      continue;
    }
    if (!centreAcceptsOnlineRequests(centre)) {
      skipped.push({ daycareId: id, reason: "not_accepting" });
      continue;
    }
    const dup = input.recentChildCentres.some(
      (row) => row.daycareId === id && row.childKey === key && withinDuplicateWindow(row.sentAt, now),
    );
    if (dup) {
      skipped.push({ daycareId: id, reason: "duplicate" });
      continue;
    }
    if (input.recentRequestCount + sendIds.length >= MULTI_APPLY_DAILY_MAX) {
      skipped.push({ daycareId: id, reason: "cap" });
      continue;
    }
    sendIds.push(id);
  }
  if (!sendIds.length && !skipped.length) return { sendIds, skipped, error: "empty" };
  return { sendIds, skipped };
}
