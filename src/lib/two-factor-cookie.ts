import { createHmac, timingSafeEqual } from "node:crypto";

/** Signed payload lifetime for the current-login session cookie. */
export const TWO_FACTOR_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Trusted-device cookie when "Remember this device for 30 days" is checked. */
export const TWO_FACTOR_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function signTwoFactorCookie(userId: string, exp: number, secret: string): string {
  const body = `${userId}.${exp}`;
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  return `${body}.${sig}`;
}

/** Revocable trusted-device cookie. Legacy 3-part cookies still verify. */
export function signTwoFactorDeviceCookie(
  userId: string,
  deviceId: string,
  exp: number,
  secret: string,
): string {
  const id = deviceId.trim();
  if (!id || id.includes(".")) throw new Error("Invalid trusted device id");
  const body = `${userId}.${id}.${exp}`;
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  return `${body}.${sig}`;
}

export function parseTwoFactorDevice(
  raw: string | null | undefined,
  secret: string,
): { userId: string; exp: number; deviceId?: string } | null {
  if (!raw || !secret) return null;
  const parts = raw.split(".");
  if (parts.length === 3) {
    const [userId, expRaw, sig] = parts;
    const exp = Number(expRaw);
    if (!userId || !Number.isFinite(exp) || exp < Date.now()) return null;
    const expected = createHmac("sha256", secret).update(`${userId}.${exp}`).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { userId, exp };
  }
  if (parts.length === 4) {
    const [userId, deviceId, expRaw, sig] = parts;
    const exp = Number(expRaw);
    if (!userId || !deviceId || deviceId.includes(".") || !Number.isFinite(exp) || exp < Date.now()) {
      return null;
    }
    const expected = createHmac("sha256", secret).update(`${userId}.${deviceId}.${exp}`).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { userId, exp, deviceId };
  }
  return null;
}

export function isTwoFactorVerified(
  userId: string,
  raw: string | null | undefined,
  secret: string,
): boolean {
  const device = parseTwoFactorDevice(raw, secret);
  return Boolean(device && device.userId === userId);
}

/** Fail closed: missing, expired, or tampered values never verify. */
export function isTwoFactorVerifiedAny(
  userId: string,
  raws: Array<string | null | undefined>,
  secret: string,
): boolean {
  return raws.some((raw) => isTwoFactorVerified(userId, raw, secret));
}
