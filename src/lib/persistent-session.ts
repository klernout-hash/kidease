/**
 * Persistent sign-in policy. Pure helpers only — no database and no secrets.
 *
 * FEATURE_PERSISTENT_SESSIONS defaults off. Auth reads the env var only.
 * A PostHog remote value cannot turn this on.
 */
import { envFlagOn, type EnvMap } from "./flags.ts";

export const PERSISTENT_SESSIONS_FLAG = "FEATURE_PERSISTENT_SESSIONS";

/** Website "keep me signed in" cookie lifetime. */
export const WEB_REMEMBER_SEC = 30 * 24 * 60 * 60;
export const WEB_REMEMBER_MS = WEB_REMEMBER_SEC * 1000;

/**
 * Unticked website sign-in. The cookie is a session cookie (gone when the
 * browser closes). This is the extra idle stop if the browser restores it.
 */
export const WEB_IDLE_MS = 12 * 60 * 60 * 1000;

/**
 * Phone and tablet shells. No idle timer. A refresh on open extends this.
 * Browsers refuse a cookie longer than 400 days, so the cap matches that.
 */
export const NATIVE_ABSOLUTE_SEC = 400 * 24 * 60 * 60;
export const NATIVE_ABSOLUTE_MS = NATIVE_ABSOLUTE_SEC * 1000;

/** A retry of the same refresh (lost response, second tab) is not theft. */
export const REFRESH_REUSE_GRACE_MS = 2 * 60 * 1000;

const SKIP_ENROLL_ROLES = new Set(["admin", "support", "government"]);

export function persistentSessionsEnabled(env?: EnvMap): boolean {
  const source = env ?? (typeof process !== "undefined" ? process.env : {});
  return envFlagOn(source[PERSISTENT_SESSIONS_FLAG]);
}

/** Parent and daycare staff. Admin, support, and government desks stay as they are. */
export function enrollAllowed(role: string | null | undefined): boolean {
  const value = String(role || "")
    .trim()
    .toLowerCase();
  if (!value) return true;
  return !SKIP_ENROLL_ROLES.has(value);
}

export function requestIsAppShell(input: {
  userAgent?: string | null;
  cookie?: string | null;
  clientShell?: boolean;
}): boolean {
  const ua = String(input.userAgent || "");
  if (ua.includes("KidEaseNative") || ua.includes("KidEaseStoreMicrosoft")) return true;
  if (/(?:^|;\s*)ke_store=microsoft(?:;|$)/.test(String(input.cookie || ""))) return true;
  return input.clientShell === true;
}

export function showKeepMeSignedIn(input: {
  flagOn: boolean;
  operator: boolean;
  adminLogin: boolean;
  shell: boolean;
  mode: "in" | "up";
}): boolean {
  return input.flagOn && input.mode === "in" && !input.operator && !input.adminLogin && !input.shell;
}

export function keepMeLabel(locale: "en" | "fr" | string): string {
  return locale === "fr" ? "Rester connecté pendant 30 jours" : "Keep me signed in for 30 days";
}

/** Null max-age is a session cookie: the browser drops it on close. */
export function cookieMaxAgeSec(input: { shell: boolean; remember: boolean }): number | null {
  if (input.shell) return NATIVE_ABSOLUTE_SEC;
  if (input.remember) return WEB_REMEMBER_SEC;
  return null;
}

/**
 * What to store after a real request.
 * Shell keeps the original absolute until a refresh on open slides it.
 * Remember slides 30 days of inactivity.
 * Unticked slides the 12-hour idle and the browser-close cookie.
 */
export function nextSessionWindow(input: {
  shell: boolean;
  remember: boolean;
  nowMs: number;
  absoluteMs: number;
  idleMs: number | null;
}): { expired: boolean; expiresAtMs: number; absoluteMs: number; idleMs: number | null } {
  if (input.idleMs != null && input.nowMs >= input.idleMs) {
    return { expired: true, expiresAtMs: input.nowMs, absoluteMs: input.absoluteMs, idleMs: input.idleMs };
  }
  if (input.nowMs >= input.absoluteMs) {
    return { expired: true, expiresAtMs: input.nowMs, absoluteMs: input.absoluteMs, idleMs: input.idleMs };
  }
  if (!input.shell && !input.remember) {
    const idle = input.nowMs + WEB_IDLE_MS;
    return { expired: false, expiresAtMs: idle, absoluteMs: idle, idleMs: idle };
  }
  if (input.remember && !input.shell) {
    const absolute = input.nowMs + WEB_REMEMBER_MS;
    return { expired: false, expiresAtMs: absolute, absoluteMs: absolute, idleMs: null };
  }
  return {
    expired: false,
    expiresAtMs: input.absoluteMs,
    absoluteMs: input.absoluteMs,
    idleMs: null,
  };
}

export function initialSessionWindow(input: { shell: boolean; remember: boolean; nowMs: number }): {
  expiresAtMs: number;
  absoluteMs: number;
  idleMs: number | null;
} {
  if (input.shell) {
    const absolute = input.nowMs + NATIVE_ABSOLUTE_MS;
    return { expiresAtMs: absolute, absoluteMs: absolute, idleMs: null };
  }
  if (input.remember) {
    const absolute = input.nowMs + WEB_REMEMBER_MS;
    return { expiresAtMs: absolute, absoluteMs: absolute, idleMs: null };
  }
  const idle = input.nowMs + WEB_IDLE_MS;
  return { expiresAtMs: idle, absoluteMs: idle, idleMs: idle };
}

export type RefreshDecision = "rotate" | "reject" | "revoke";

export function decideRefresh(input: {
  presentedHash: string;
  currentHash: string;
  previousHash: string | null;
  rotatedAtMs: number | null;
  nowMs: number;
  revoked: boolean;
  absoluteMs: number;
}): RefreshDecision {
  if (input.revoked || !input.presentedHash || !input.currentHash) return "reject";
  if (input.nowMs >= input.absoluteMs) return "reject";
  if (input.presentedHash === input.currentHash) return "rotate";
  const recent =
    input.previousHash &&
    input.presentedHash === input.previousHash &&
    input.rotatedAtMs != null &&
    input.nowMs - input.rotatedAtMs < REFRESH_REUSE_GRACE_MS;
  if (recent) return "rotate";
  if (input.previousHash && input.presentedHash === input.previousHash) return "revoke";
  return "reject";
}

export type RevokeReason = "logout" | "password_change" | "account_delete" | "admin" | "security";

/**
 * Flag off keeps today's password-change rule: other sessions drop, this one stays.
 * Flag on: password change, account deletion, and admin or security revocation
 * sign out every device. Logout signs out this device only.
 */
export function revokePlan(
  reason: RevokeReason,
  flagOn: boolean,
): { allSessions: boolean; currentSession: boolean; push: "none" | "this" | "all" } {
  if (!flagOn && reason === "password_change") {
    return { allSessions: false, currentSession: false, push: "none" };
  }
  if (reason === "logout") return { allSessions: false, currentSession: true, push: "this" };
  return { allSessions: true, currentSession: true, push: "all" };
}

/** Session refresh must not drop a phone's push token. Resume registers it again. */
export function pushActionFor(event: "refresh" | "logout" | "password_change" | "resume"): "keep" | "unregister" | "reregister" {
  if (event === "refresh") return "keep";
  if (event === "resume") return "reregister";
  return "unregister";
}

export function sessionVisibleTo(rowUserId: string, actorUserId: string): boolean {
  const row = String(rowUserId || "");
  const actor = String(actorUserId || "");
  return row.length > 0 && row === actor;
}

export const PERSISTENT_STEP_UP = ["pickup_people", "payout_bank", "email_change", "password_change", "child_delete"] as const;
export type PersistentStepUp = (typeof PERSISTENT_STEP_UP)[number];

export function stepUpRequired(action: string, flagOn: boolean): boolean {
  if (!flagOn) return false;
  return (PERSISTENT_STEP_UP as readonly string[]).includes(action);
}

export function pickupListChanged(before: string | null | undefined, after: string | null | undefined): boolean {
  return String(before || "").trim() !== String(after || "").trim();
}

export function parseRefreshToken(raw: string | null | undefined): { id: string; secret: string } | null {
  const parts = String(raw || "").trim().split(".");
  if (parts.length !== 3) return null;
  const [prefix, id, secret] = parts;
  if (prefix !== "ps1") return null;
  if (!/^[A-Za-z0-9_-]{12,80}$/.test(id || "")) return null;
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(secret || "")) return null;
  return { id: id || "", secret: secret || "" };
}

export function formatRefreshToken(id: string, secret: string): string {
  return `ps1.${id}.${secret}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Better Auth verifies this with atob, so the signature is standard base64. */
export async function signSessionToken(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  const signature = btoa(String.fromCharCode(...new Uint8Array(signed)));
  return `${token}.${signature}`;
}

export function randomUrlToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function maskDeviceIp(ip?: string | null): string | null {
  const raw = String(ip || "").trim();
  if (!raw) return null;
  if (raw.includes(".")) {
    const parts = raw.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.*`;
  }
  if (raw.includes(":")) return `${raw.split(":").slice(0, 3).join(":")}:*`;
  return null;
}
