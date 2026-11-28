/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when that env is set.
 * Query-string `?secret=` is rejected — secrets in URLs leak via logs and Referer.
 *
 * Server only. Do not import this from client components.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export function cronSecretFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return (env.CRON_SECRET || env.DIGEST_SECRET || "").trim();
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Constant-time check of the bearer header against the cron secret.
 * Both sides are hashed first so the buffers always have the same length and
 * the comparison time does not depend on how long the supplied value is.
 * Fails closed when the secret is missing or empty.
 */
export function cronAuthorized(request: Request, secret = cronSecretFromEnv()): boolean {
  if (typeof secret !== "string" || !secret) return false;
  const header = request.headers.get("authorization") || "";
  if (!header) return false;
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
