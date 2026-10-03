/**
 * Signed vacancy check-in links. Server / Node tests only.
 * Do not import this from client components.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { VACANCY_CHECKIN_TTL_MS } from "./vacancy-checkin.ts";

export type VacancyCheckinPayload = {
  v: 1;
  daycareId: string;
  exp: number;
};

function hmacSha256(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("base64url");
}

export function vacancyCheckinSecret(env: Record<string, string | undefined> = process.env): string {
  return String(env.BETTER_AUTH_SECRET || "").trim();
}

export function signVacancyCheckinToken(
  daycareId: string,
  secret: string,
  nowMs = Date.now(),
): string | null {
  const id = String(daycareId || "").trim();
  if (!id || !secret) return null;
  const payload: VacancyCheckinPayload = { v: 1, daycareId: id, exp: nowMs + VACANCY_CHECKIN_TTL_MS };
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${data}.${hmacSha256(secret, data)}`;
}

export function verifyVacancyCheckinToken(
  token: string,
  secret: string,
  nowMs = Date.now(),
): VacancyCheckinPayload | null {
  const trimmed = String(token || "").trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot < 1 || !secret) return null;
  const data = trimmed.slice(0, dot);
  const sig = trimmed.slice(dot + 1);
  const expected = hmacSha256(secret, data);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as VacancyCheckinPayload;
    if (parsed.v !== 1) return null;
    if (!parsed.daycareId || typeof parsed.daycareId !== "string") return null;
    if (!Number.isFinite(parsed.exp) || parsed.exp < nowMs) return null;
    return parsed;
  } catch {
    return null;
  }
}
