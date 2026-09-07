/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when that env is set.
 * Query-string `?secret=` is rejected — secrets in URLs leak via logs and Referer.
 */
export function cronSecretFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return (env.CRON_SECRET || env.DIGEST_SECRET || "").trim();
}

export function cronAuthorized(request: Request, secret = cronSecretFromEnv()): boolean {
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}
