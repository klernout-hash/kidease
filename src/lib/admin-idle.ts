/**
 * Admin idle-window policy. Cookie presence is a fast path; last-seen and
 * session.createdAt keep a freshly signed-in Admin desk alive when Safari
 * drops or never returns the short-lived idle cookie.
 */
import { ADMIN_IDLE_TTL_MS } from "./reauth.ts";

/** Allow createdAt slightly in the future (Safari / Neon clock skew). */
export const ADMIN_IDLE_CLOCK_SKEW_MS = 2 * 60 * 1000;

export type AdminIdleFreshnessInput = {
  idleCookiePresent: boolean;
  sessionCreatedAtMs?: number | null;
  lastSeenAtMs?: number | null;
  nowMs?: number;
  ttlMs?: number;
};

export function isWithinAdminIdleTtl(
  atMs: number | null | undefined,
  nowMs = Date.now(),
  ttlMs = ADMIN_IDLE_TTL_MS,
): boolean {
  if (atMs == null || !Number.isFinite(atMs) || atMs <= 0) return false;
  const age = nowMs - atMs;
  if (age < 0) return age > -ADMIN_IDLE_CLOCK_SKEW_MS;
  return age < ttlMs;
}

/**
 * Sliding 30-minute Admin idle. Cookie presence wins. Otherwise a last-seen
 * stamp for this session, or a brand-new session.createdAt, may mint/refresh.
 */
export function isAdminIdleWindowFresh(input: AdminIdleFreshnessInput): boolean {
  if (input.idleCookiePresent) return true;
  const nowMs = input.nowMs ?? Date.now();
  const ttlMs = input.ttlMs ?? ADMIN_IDLE_TTL_MS;
  return (
    isWithinAdminIdleTtl(input.lastSeenAtMs, nowMs, ttlMs) ||
    isWithinAdminIdleTtl(input.sessionCreatedAtMs, nowMs, ttlMs)
  );
}

export function parseTimestampMs(raw: unknown): number {
  if (raw instanceof Date) {
    const ms = raw.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const ms = new Date(raw).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}
