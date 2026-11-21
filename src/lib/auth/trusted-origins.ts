/** Production sign-in hosts. Preview hosts are not trusted here. */
export const PRODUCTION_AUTH_HOSTS = ["kidease.ca", "www.kidease.ca"] as const;
export const PRODUCTION_AUTH_ORIGINS = PRODUCTION_AUTH_HOSTS.map((host) => `https://${host}`);
/** Capacitor hands the system browser back to the app with this scheme. */
export const NATIVE_APP_ORIGINS = ["ca.kidease.app://"] as const;

export function isProductionAuthEnv(env: { VERCEL_ENV?: string } = process.env): boolean {
  return (env.VERCEL_ENV || "").trim() === "production";
}

export function previewAuthHostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  if (h.endsWith(".grok-sandbox.com") || h === "grok-sandbox.com") return true;
  if (h.endsWith(".grok.me") || h === "grok.me") return true;
  if (h.includes("kidease") && h.endsWith(".vercel.app")) return true;
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]") return true;
  return false;
}

export function authHostAllowed(host: string, env: { VERCEL_ENV?: string } = process.env): boolean {
  const h = host.toLowerCase();
  if ((PRODUCTION_AUTH_HOSTS as readonly string[]).includes(h)) return true;
  if (isProductionAuthEnv(env)) return false;
  return previewAuthHostAllowed(h);
}

/** Stay on this site after sign-in. A lookalike origin becomes the home page. */
export function safePostLoginUrl(raw: string, currentOrigin: string): string {
  try {
    const dest = new URL(raw, currentOrigin);
    if (dest.origin === currentOrigin) return `${dest.pathname}${dest.search}${dest.hash}` || "/";
    if (dest.protocol === "ca.kidease.app:") return dest.toString();
  } catch {
    /* ignore */
  }
  return "/";
}
