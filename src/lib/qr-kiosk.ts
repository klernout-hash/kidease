/**
 * Rotating daycare check-in codes. Pure: no database.
 * FEATURE_QR_KIOSK defaults off. A missing KIOSK_TOKEN_SECRET fails closed.
 * The secret is never returned to the browser.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { qrKioskEnabled, type EnvMap } from "./features.ts";

export const KIOSK_ROTATE_MS = 30_000;
export const KIOSK_SECRET_ENV = "KIOSK_TOKEN_SECRET";
export const KIOSK_ACTIONS = ["check_in", "check_out"] as const;
export type KioskAction = (typeof KIOSK_ACTIONS)[number];

export function kioskTokenSecret(env: EnvMap = process.env): string {
  return String(env[KIOSK_SECRET_ENV] || "").trim();
}

export function kioskWindow(now = Date.now(), rotateMs = KIOSK_ROTATE_MS): string {
  const step = rotateMs > 0 ? rotateMs : KIOSK_ROTATE_MS;
  return String(Math.floor(now / step));
}

export function kioskExpiresAt(now = Date.now(), rotateMs = KIOSK_ROTATE_MS): number {
  const step = rotateMs > 0 ? rotateMs : KIOSK_ROTATE_MS;
  return (Math.floor(now / step) + 1) * step;
}

function mac(secret: string, daycareId: string, window: string): string {
  return createHmac("sha256", secret).update(`${daycareId}.${window}`, "utf8").digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export type KioskToken = {
  token: string;
  daycareId: string;
  window: string;
  expiresAt: number;
};

/** Opaque code. The daycare id is inside so a scan knows the centre. */
export function mintKioskToken(input: {
  daycareId: string;
  secret: string;
  now?: number;
  rotateMs?: number;
  enabled?: boolean;
}): KioskToken | null {
  if (input.enabled === false) return null;
  const daycareId = String(input.daycareId || "").trim();
  const secret = String(input.secret || "");
  if (!daycareId || daycareId.length > 80 || !secret) return null;
  const now = input.now ?? Date.now();
  const rotateMs = input.rotateMs ?? KIOSK_ROTATE_MS;
  const window = kioskWindow(now, rotateMs);
  const body = `${Buffer.from(daycareId, "utf8").toString("base64url")}.${window}`;
  return {
    token: `${body}.${mac(secret, daycareId, window)}`,
    daycareId,
    window,
    expiresAt: kioskExpiresAt(now, rotateMs),
  };
}

export function verifyKioskToken(
  token: string,
  secret: string,
  now = Date.now(),
  rotateMs = KIOSK_ROTATE_MS,
): { daycareId: string; window: string } | null {
  const secretText = String(secret || "");
  if (!secretText) return null;
  const parts = String(token || "").trim().split(".");
  if (parts.length !== 3) return null;
  const [idPart, window, sig] = parts;
  if (!idPart || !window || !/^\d+$/.test(window) || !sig) return null;
  let daycareId = "";
  try {
    daycareId = Buffer.from(idPart, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!daycareId || daycareId.length > 80) return null;
  const current = Number(kioskWindow(now, rotateMs));
  const shown = Number(window);
  if (!Number.isFinite(shown) || shown > current || current - shown > 1) return null;
  const expected = mac(secretText, daycareId, window);
  if (!safeEqual(sig, expected)) return null;
  return { daycareId, window };
}

export function kioskScanUrl(origin: string, token: string): string {
  const base = String(origin || "https://www.kidease.ca").replace(/\/$/, "");
  return `${base}/parent/daily-feed#kiosk=${encodeURIComponent(token)}`;
}

export function readKioskHash(hash: string | null | undefined): string {
  const raw = String(hash || "").replace(/^#/, "");
  const params = new URLSearchParams(raw);
  return (params.get("kiosk") || "").trim();
}

export function isKioskAction(value: string | null | undefined): value is KioskAction {
  return value === "check_in" || value === "check_out";
}

export function attendanceStatusForKiosk(action: KioskAction): "arrived" | "departed" {
  return action === "check_in" ? "arrived" : "departed";
}

export type KioskRedeemResult =
  | { ok: true; status: "arrived" | "departed" }
  | { ok: false; reason: "off" | "bad_code" | "not_enrolled" | "already" | "bad_action" };

export function kioskRedeemDecision(input: {
  enabled: boolean;
  verified: boolean;
  enrolled: boolean;
  action: string;
  alreadyUsed: boolean;
}): KioskRedeemResult {
  if (!input.enabled) return { ok: false, reason: "off" };
  if (!isKioskAction(input.action)) return { ok: false, reason: "bad_action" };
  if (!input.verified) return { ok: false, reason: "bad_code" };
  if (!input.enrolled) return { ok: false, reason: "not_enrolled" };
  if (input.alreadyUsed) return { ok: false, reason: "already" };
  return { ok: true, status: attendanceStatusForKiosk(input.action) };
}

export function kioskReady(env?: EnvMap): { enabled: boolean; canMint: boolean } {
  const enabled = qrKioskEnabled(env);
  return { enabled, canMint: enabled && Boolean(kioskTokenSecret(env)) };
}
