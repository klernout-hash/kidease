import { createHmac, timingSafeEqual } from "node:crypto";

export function parseTwoFactorDevice(
  raw: string | null | undefined,
  secret: string,
): { userId: string; exp: number } | null {
  if (!raw || !secret) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [userId, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!userId || !Number.isFinite(exp) || exp < Date.now()) return null;
  const expected = createHmac("sha256", secret).update(`${userId}.${exp}`).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { userId, exp };
}

export function isTwoFactorVerified(
  userId: string,
  raw: string | null | undefined,
  secret: string,
): boolean {
  const device = parseTwoFactorDevice(raw, secret);
  return Boolean(device && device.userId === userId);
}
