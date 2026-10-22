/**
 * Passkey rules that do not touch the database.
 * RP ID stays kidease.ca. Android origins are apk-key-hash values
 * derived from the same cert fingerprints as assetlinks.json.
 */

export const PASSKEY_RP_ID = "kidease.ca";
export const PASSKEY_RP_NAME = "KidEase";
export const PASSKEY_WEB_ORIGINS = ["https://www.kidease.ca", "https://kidease.ca"] as const;
export const PASSKEY_LOCAL_ORIGINS = ["http://localhost:8080", "http://127.0.0.1:8080"] as const;
export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const PASSKEY_RATE_WINDOW_MS = 10 * 60 * 1000;
export const PASSKEY_RATE_MAX = 8;
export const PASSKEY_MAX_PER_USER = 10;
export const PASSKEY_ANDROID_PACKAGE = "ca.kidease.app";

const SHA256_HEX = /^[0-9a-fA-F]{64}$/;

/** Colon-hex SHA-256 cert fingerprint → base64url (no padding) for Digital Asset Links. */
export function sha256FingerprintToApkKeyHash(colonHex: string): string | null {
  const hex = colonHex.replace(/[^0-9a-fA-F]/g, "");
  if (!SHA256_HEX.test(hex)) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function androidApkKeyHashOrigin(hash: string): string {
  return `android:apk-key-hash:${hash}`;
}

export function passkeyExpectedOrigins(input: {
  production: boolean;
  fingerprints: readonly string[];
}): string[] {
  const web = input.production
    ? [...PASSKEY_WEB_ORIGINS]
    : [...PASSKEY_WEB_ORIGINS, ...PASSKEY_LOCAL_ORIGINS];
  const android: string[] = [];
  const seen = new Set<string>();
  for (const fingerprint of input.fingerprints) {
    const hash = sha256FingerprintToApkKeyHash(fingerprint);
    if (!hash || seen.has(hash)) continue;
    seen.add(hash);
    android.push(androidApkKeyHashOrigin(hash));
  }
  return [...web, ...android];
}

/**
 * A passkey ceremony with user verification is possession plus a biometric
 * or PIN, bound to kidease.ca. That is enough to skip the admin email code.
 * If the authenticator did not verify the person, the email code stays.
 */
export function passkeySatisfiesAdminEmailStep(userVerified: boolean): boolean {
  return userVerified === true;
}

export function passkeyRateLimited(recentCount: number): boolean {
  return recentCount >= PASSKEY_RATE_MAX;
}

export function cleanDeviceName(raw: string | null | undefined): string {
  let out = "";
  for (const char of String(raw ?? "")) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 31 || code === 127) continue;
    out += char;
  }
  const trimmed = out.trim().slice(0, 80);
  return trimmed || "This device";
}

export function clientIpFromHeaders(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf.slice(0, 64);
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (fwd || "unknown").slice(0, 64);
}

export function isPasskeyProduction(): boolean {
  return (process.env.VERCEL_ENV || "").trim() === "production";
}
