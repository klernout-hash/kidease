/**
 * Parent ↔ daycare pipeline helpers: waitlist open/closed, owner tags and order,
 * offer countdowns, tour outcomes, withdrawal notice, and in-app agreement signing.
 * Pure: no database. Node tests load this file directly. No @/ imports.
 */

/** Owner events kept in waitlist_audit (no new table). */
export const WAITLIST_EVENT = {
  closed: "waitlist_closed",
  opened: "waitlist_opened",
  staffOn: "tag_staff_child",
  staffOff: "untag_staff_child",
} as const;

export type WaitlistEventRow = {
  action: string;
  entryId?: string | null;
  createdAt: string;
};

function newestFirst(rows: readonly WaitlistEventRow[]): WaitlistEventRow[] {
  return rows.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** A live listing's waitlist is open unless the owner closed it. */
export function waitlistOpenFromEvents(rows: readonly WaitlistEventRow[]): boolean {
  const latest = newestFirst(rows).find(
    (row) => row.action === WAITLIST_EVENT.closed || row.action === WAITLIST_EVENT.opened,
  );
  return latest?.action !== WAITLIST_EVENT.closed;
}

/** Latest staff-child tag per waitlist entry. */
export function staffChildTags(rows: readonly WaitlistEventRow[]): Set<string> {
  const seen = new Set<string>();
  const on = new Set<string>();
  for (const row of newestFirst(rows)) {
    const id = String(row.entryId || "");
    if (!id || seen.has(id)) continue;
    if (row.action !== WAITLIST_EVENT.staffOn && row.action !== WAITLIST_EVENT.staffOff) continue;
    seen.add(id);
    if (row.action === WAITLIST_EVENT.staffOn) on.add(id);
  }
  return on;
}

export type WaitlistJoinDecision = { ok: true } | { ok: false; reason: "closed" | "not_open" };

/**
 * Who may join a waitlist:
 * - a public listing (claimed live listings included) unless the owner closed it;
 * - a hidden QA test listing only for a flagged test account.
 */
export function waitlistJoinDecision(input: {
  publicListing: boolean;
  hiddenTestListing: boolean;
  viewerIsTestAccount: boolean;
  ownerOpen: boolean;
}): WaitlistJoinDecision {
  const reachable = input.publicListing || (input.hiddenTestListing && input.viewerIsTestAccount);
  if (!reachable) return { ok: false, reason: "not_open" };
  if (!input.ownerOpen) return { ok: false, reason: "closed" };
  return { ok: true };
}

/** Saved order 1..n for the ids the owner sent. Unknown or repeated ids are dropped. */
export function orderFromIds(
  ids: readonly string[],
  allowed: ReadonlySet<string>,
): { id: string; rank: number }[] {
  const out: { id: string; rank: number }[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw || "").trim();
    if (!id || seen.has(id) || !allowed.has(id)) continue;
    seen.add(id);
    out.push({ id, rank: out.length + 1 });
  }
  return out;
}

export type Countdown = { expired: boolean; hours: number; minutes: number; totalMs: number };

export function offerCountdown(expiresAt: string | null | undefined, now: number): Countdown {
  const end = Date.parse(String(expiresAt || ""));
  if (!Number.isFinite(end)) return { expired: true, hours: 0, minutes: 0, totalMs: 0 };
  const left = end - now;
  if (left <= 0) return { expired: true, hours: 0, minutes: 0, totalMs: 0 };
  const totalMinutes = Math.ceil(left / 60_000);
  return {
    expired: false,
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
    totalMs: left,
  };
}

export function countdownLabel(count: Countdown, locale: string): string {
  const fr = locale === "fr";
  if (count.expired) return fr ? "Offre expirée" : "Offer ended";
  const h = count.hours;
  const m = count.minutes;
  if (fr)
    return h > 0
      ? `${h} h ${String(m).padStart(2, "0")} min pour répondre`
      : `${m} min pour répondre`;
  return h > 0 ? `${h} h ${m} min left to answer` : `${m} min left to answer`;
}

export type TourOutcomeCounts = {
  attended: number;
  noShow: number;
  past: number;
  noShowRate: number | null;
};

/** Attended = completed or enrolled. Rate is a whole percent of recorded past tours. */
export function tourOutcomeCounts(
  statuses: readonly (string | null | undefined)[],
): TourOutcomeCounts {
  let attended = 0;
  let noShow = 0;
  for (const raw of statuses) {
    const status = String(raw || "")
      .trim()
      .toLowerCase();
    if (status === "completed" || status === "enrolled") attended += 1;
    else if (status === "no_show") noShow += 1;
  }
  const past = attended + noShow;
  return { attended, noShow, past, noShowRate: past ? Math.round((noShow / past) * 100) : null };
}

/** Owners may mark attended or no-show once the visit time has passed (or has no time). */
export function tourOutcomeOpen(input: {
  status: string;
  startsAt?: string | null;
  now: number;
}): boolean {
  if (input.status !== "accepted" && input.status !== "confirmed") return false;
  const at = Date.parse(String(input.startsAt || ""));
  if (!Number.isFinite(at)) return true;
  return at <= input.now;
}

export const WITHDRAWAL_REASON_MAX = 280;

export function cleanReason(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, WITHDRAWAL_REASON_MAX);
}

/** A parent may cancel notice until the last day has passed. Dates are YYYY-MM-DD. */
export function withdrawalCancelable(lastDay: string, today: string): boolean {
  const last = String(lastDay || "").slice(0, 10);
  const day = String(today || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(last) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return last >= day;
}

function normName(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export type SignatureCheck = { ok: true; name: string } | { ok: false; error: "agree" | "name" };

/** Typed-name signature: the box is ticked and the name matches the person on the agreement. */
export function checkTypedSignature(input: {
  typedName: string;
  expectedName: string;
  agreed: boolean;
}): SignatureCheck {
  if (!input.agreed) return { ok: false, error: "agree" };
  const typed = String(input.typedName || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (typed.length < 2) return { ok: false, error: "name" };
  const expected = normName(String(input.expectedName || ""));
  if (expected && normName(typed) !== expected) return { ok: false, error: "name" };
  return { ok: true, name: typed };
}

export type InAppSignature = { role: "parent" | "director"; name: string; at: string };

function escapeHtml(raw: string): string {
  return raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Signed copy: the agreement body plus a bilingual signature page. */
export function signedAgreementHtml(input: {
  title: string;
  bodyHtml: string;
  signatures: readonly InAppSignature[];
}): string {
  const rows = input.signatures
    .map((sig) => {
      const role = sig.role === "parent" ? "Parent / Parent" : "Centre / Centre";
      const when = new Date(sig.at);
      const stamp = Number.isNaN(when.getTime()) ? sig.at : when.toISOString();
      return `<tr><td>${escapeHtml(role)}</td><td>${escapeHtml(sig.name)}</td><td>${escapeHtml(stamp)}</td></tr>`;
    })
    .join("");
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    `<title>${escapeHtml(input.title)}</title>`,
    "<style>body{font-family:system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem;line-height:1.5}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:.5rem;text-align:left}</style>",
    "</head><body>",
    input.bodyHtml,
    "<h2>Signatures / Signatures</h2>",
    "<p>Signed in KidEase by typing a full name. / Signé dans KidEase en tapant le nom complet.</p>",
    "<table><thead><tr><th>Role / Rôle</th><th>Name / Nom</th><th>Signed (UTC) / Signé (UTC)</th></tr></thead>",
    `<tbody>${rows}</tbody></table>`,
    "</body></html>",
  ].join("\n");
}

/** Earliest asked-for visit time as "YYYY-MM-DDTHH:MM" (local), or null. */
export function earliestPreferredStart(raw: unknown): string | null {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list)) return null;
  const starts = list
    .map((item) => {
      const row = (item || {}) as { date?: unknown; time?: unknown };
      const date = String(row.date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
      const time = /^\d{2}:\d{2}/.test(String(row.time || ""))
        ? String(row.time).slice(0, 5)
        : "00:00";
      return `${date}T${time}`;
    })
    .filter(Boolean)
    .sort();
  return starts[0] || null;
}

/** True once the earliest asked-for visit day has started (or no day was given). */
export function tourVisitPast(raw: unknown, now: number): boolean {
  const start = earliestPreferredStart(raw);
  if (!start) return true;
  return Date.parse(`${start}:00`) <= now;
}
