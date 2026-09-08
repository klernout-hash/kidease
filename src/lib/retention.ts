/**
 * Thin day-7 retention slice: remember a safe resume path and fire one
 * `retention_touch` per session. No email, names, or listing query strings.
 */
import { capturePostHogEvent } from "./posthog.ts";
import { isAuthLoopPath, pathnameOfDest } from "./desks.ts";

export const RETENTION_EVENT = "retention_touch";
export const FIRST_SEEN_KEY = "kidease-first-seen";
export const LAST_SEEN_KEY = "kidease-last-seen";
export const RESUME_PATH_KEY = "kidease-resume-path";
export const SESSION_TOUCH_KEY = "kidease-retention-session";

export type DaysSinceBucket = "0" | "1" | "2-6" | "7-13" | "14-29" | "30+";

export function daysSinceBucket(ms: number): DaysSinceBucket {
  const days = Math.floor(Math.max(0, ms) / 86_400_000);
  if (days <= 0) return "0";
  if (days === 1) return "1";
  if (days < 7) return "2-6";
  if (days < 14) return "7-13";
  if (days < 30) return "14-29";
  return "30+";
}

const RESUME_TABS = new Set(["saved", "alerts", "explore"]);

/** Product paths only — never auth loops, admin, or query PII. */
export function sanitizeResumePath(raw?: string | null): string | null {
  const trimmed = (raw || "").trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.length > 200) return null;
  const path = pathnameOfDest(trimmed);
  if (!path || path === "/" || isAuthLoopPath(path)) return null;
  if (path === "/search") return "/search";
  if (path === "/parent") {
    const q = trimmed.indexOf("?");
    const tab = q === -1 ? "" : new URLSearchParams(trimmed.slice(q + 1)).get("tab") || "";
    if (RESUME_TABS.has(tab)) return `/parent?tab=${tab}`;
    return "/parent";
  }
  if (path.startsWith("/daycare/")) {
    const slug = path.slice("/daycare/".length);
    if (!slug || slug.includes("/") || !/^[a-z0-9-]+$/.test(slug)) return null;
    return `/daycare/${slug}`;
  }
  return null;
}

export function readResumePath(storage?: Pick<Storage, "getItem"> | null): string | null {
  if (!storage) {
    if (typeof window === "undefined") return null;
    storage = window.localStorage;
  }
  try {
    return sanitizeResumePath(storage.getItem(RESUME_PATH_KEY));
  } catch {
    return null;
  }
}

export function rememberResumePath(
  raw: string,
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): string | null {
  const path = sanitizeResumePath(raw);
  if (!path) return null;
  if (!storage) {
    if (typeof window === "undefined") return path;
    storage = window.localStorage;
  }
  try {
    storage.setItem(RESUME_PATH_KEY, path);
  } catch {
    /* quota / private mode */
  }
  return path;
}

export type RetentionClock = {
  firstSeen: number;
  lastSeen: number;
  returning: boolean;
  days_since_last: DaysSinceBucket;
  tenure: DaysSinceBucket;
};

export function touchRetentionClock(
  now = Date.now(),
  storage?: Pick<Storage, "getItem" | "setItem"> | null,
): RetentionClock {
  if (!storage) {
    if (typeof window === "undefined") {
      return { firstSeen: now, lastSeen: 0, returning: false, days_since_last: "0", tenure: "0" };
    }
    storage = window.localStorage;
  }
  let first = Number(storage.getItem(FIRST_SEEN_KEY) || 0);
  const last = Number(storage.getItem(LAST_SEEN_KEY) || 0);
  if (!Number.isFinite(first) || first <= 0) first = now;
  const returning = last > 0 && now - last >= 6 * 60 * 60 * 1000;
  const clock: RetentionClock = {
    firstSeen: first,
    lastSeen: last,
    returning,
    days_since_last: last > 0 ? daysSinceBucket(now - last) : "0",
    tenure: daysSinceBucket(now - first),
  };
  try {
    if (!storage.getItem(FIRST_SEEN_KEY)) storage.setItem(FIRST_SEEN_KEY, String(first));
    storage.setItem(LAST_SEEN_KEY, String(now));
  } catch {
    /* ignore */
  }
  return clock;
}

export function captureRetentionTouch(now = Date.now()): RetentionClock | null {
  if (typeof window === "undefined") return null;
  try {
    if (window.sessionStorage.getItem(SESSION_TOUCH_KEY)) return null;
    window.sessionStorage.setItem(SESSION_TOUCH_KEY, "1");
  } catch {
    /* still fire once this call */
  }
  const clock = touchRetentionClock(now);
  capturePostHogEvent(RETENTION_EVENT, {
    returning: clock.returning,
    days_since_last: clock.days_since_last,
    tenure: clock.tenure,
    has_resume: Boolean(readResumePath()),
  });
  return clock;
}
