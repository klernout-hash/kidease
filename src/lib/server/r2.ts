/**
 * Cloudflare R2 (S3-compatible) helpers. No Start/DB — tests import this file.
 *
 * Private bucket `kidease-media` (Western North America). No public r2.dev URL.
 * Raw originals live here so listing JPEGs can leave Git later. Delivery /
 * optimization stays with Cloudflare Images / Stream (already Active).
 *
 * Listing photos stay as `/photos/…` paths in the catalogue. `/img` prefers
 * the matching R2 object (`photos/wpg/1052.jpg`) when R2 is configured, then
 * falls back to `public/photos/…`. Git files are not deleted by the migrate
 * script. Set `R2_MEDIA_READ=0` to keep credentials but skip the R2 read.
 *
 * TODO (follow-up):
 * - Run `npm run media:migrate-r2 -- --apply` with Production R2_* (see docs/r2-media.md)
 * - Admin / provider upload UI
 * - After R2 is the source of truth, drop Git originals in a later PR
 */

import { createHash, createHmac } from "node:crypto";

export const R2_DEFAULT_BUCKET = "kidease-media";
export const R2_REGION = "auto";
export const R2_SERVICE = "s3";
export const R2_HOST_SUFFIX = ".r2.cloudflarestorage.com";
export const R2_MAX_OBJECT_BYTES = 4 * 1024 * 1024;
export const R2_PRESIGN_TTL_SEC = 5 * 60;
export const R2_KEY_MAX = 512;

export const R2_SETUP_MESSAGE =
  "R2 is not configured. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ENDPOINT (or R2_ACCOUNT_ID) on the Vercel project. Bucket defaults to kidease-media.";

/** Git-mirrored listing objects. `/photos/wpg/1052.jpg` → `photos/wpg/1052.jpg`. */
export const PUBLIC_PHOTO_KEY_RE = /^photos\/[a-z0-9/_-]+\.(jpe?g|png|webp|avif)$/i;

export const R2_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
] as const;

const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/;
const ACCOUNT_RE = /^[a-z0-9][a-z0-9_-]{4,63}$/i;

type EnvMap = Record<string, string | undefined>;

export type R2Config = {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  endpointHost: string;
};

export type R2Status = {
  configured: boolean;
  bucket: string | null;
  endpointHost: string | null;
  publicDelivery: false;
  missing: string[];
  setupMessage: string | null;
};

export function envStr(env: EnvMap, ...keys: string[]) {
  for (const key of keys) {
    const v = env[key]?.trim();
    if (v) return v;
  }
  return "";
}

export function r2MissingEnv(env: EnvMap = process.env): string[] {
  const missing: string[] = [];
  if (!envStr(env, "R2_ACCESS_KEY_ID")) missing.push("R2_ACCESS_KEY_ID");
  if (!envStr(env, "R2_SECRET_ACCESS_KEY")) missing.push("R2_SECRET_ACCESS_KEY");
  if (!envStr(env, "R2_ENDPOINT") && !envStr(env, "R2_ACCOUNT_ID")) {
    missing.push("R2_ENDPOINT");
  }
  return missing;
}

export function deriveR2Endpoint(accountId: string) {
  const id = accountId.trim();
  if (!ACCOUNT_RE.test(id)) {
    throw new Error("R2_ACCOUNT_ID is not a valid Cloudflare account id.");
  }
  return `https://${id}${R2_HOST_SUFFIX}`;
}

export function parseR2Endpoint(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("R2_ENDPOINT must be an https S3 API URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("R2_ENDPOINT must use https.");
  }
  if (url.username || url.password) {
    throw new Error("R2_ENDPOINT must not include credentials.");
  }
  const host = url.hostname.toLowerCase();
  if (host !== "r2.cloudflarestorage.com" && !host.endsWith(R2_HOST_SUFFIX)) {
    throw new Error("R2_ENDPOINT must be a *.r2.cloudflarestorage.com S3 API URL.");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

export function resolveR2Config(
  env: EnvMap = process.env,
): { ok: true; config: R2Config } | { ok: false; error: string; missing: string[] } {
  const missing = r2MissingEnv(env);
  if (missing.length) {
    return { ok: false, error: R2_SETUP_MESSAGE, missing };
  }

  const accessKeyId = envStr(env, "R2_ACCESS_KEY_ID");
  const secretAccessKey = envStr(env, "R2_SECRET_ACCESS_KEY");
  const bucket = envStr(env, "R2_BUCKET") || R2_DEFAULT_BUCKET;
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
    return { ok: false, error: "R2_BUCKET is not a valid bucket name.", missing: ["R2_BUCKET"] };
  }

  try {
    const explicit = envStr(env, "R2_ENDPOINT");
    const accountId = envStr(env, "R2_ACCOUNT_ID");
    const endpointUrl = explicit ? parseR2Endpoint(explicit) : new URL(deriveR2Endpoint(accountId));
    const host = endpointUrl.hostname.toLowerCase();
    return {
      ok: true,
      config: {
        accountId: accountId || host.replace(R2_HOST_SUFFIX, ""),
        bucket,
        accessKeyId,
        secretAccessKey,
        endpoint: `https://${host}`,
        endpointHost: host,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : R2_SETUP_MESSAGE,
      missing: [],
    };
  }
}

/**
 * Dual-read is on whenever R2 credentials resolve, unless Kyle sets
 * `R2_MEDIA_READ=0` (or false/off) to pause listing reads without removing keys.
 */
export function r2MediaReadEnabled(env: EnvMap = process.env): boolean {
  if (!resolveR2Config(env).ok) return false;
  const raw = envStr(env, "R2_MEDIA_READ").toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

/** Map a catalogue `/photos/…` path to the R2 object key, or null if unsafe. */
export function publicPhotoToR2Key(src: string): string | null {
  const raw = String(src || "")
    .trim()
    .replace(/^\/+/, "");
  if (!PUBLIC_PHOTO_KEY_RE.test(raw)) return null;
  try {
    return sanitizeObjectKey(raw);
  } catch {
    return null;
  }
}

export function contentTypeForPhotoKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".avif")) return "image/avif";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

export function r2StatusFromEnv(env: EnvMap = process.env): R2Status {
  const resolved = resolveR2Config(env);
  if (!resolved.ok) {
    return {
      configured: false,
      bucket: envStr(env, "R2_BUCKET") || R2_DEFAULT_BUCKET,
      endpointHost: null,
      publicDelivery: false,
      missing: resolved.missing,
      setupMessage: resolved.error,
    };
  }
  return {
    configured: true,
    bucket: resolved.config.bucket,
    endpointHost: resolved.config.endpointHost,
    publicDelivery: false,
    missing: [],
    setupMessage: null,
  };
}

export function sanitizeObjectKey(raw: string): string {
  const key = String(raw || "")
    .trim()
    .replace(/^\/+/, "");
  if (!key) throw new Error("Object key is required.");
  if (key.length > R2_KEY_MAX) throw new Error("Object key is too long.");
  if (key.includes("..") || key.includes("\\") || key.includes("\0")) {
    throw new Error("Object key is not allowed.");
  }
  if (!KEY_RE.test(key)) throw new Error("Object key is not allowed.");
  return key;
}

export function allowContentType(raw: string): string {
  const type = String(raw || "")
    .trim()
    .toLowerCase()
    .split(";")[0]
    ?.trim();
  if (!type || !(R2_ALLOWED_TYPES as readonly string[]).includes(type)) {
    throw new Error("Use a JPEG, PNG, WebP, AVIF, or GIF.");
  }
  return type;
}

export function decodeObjectBody(bodyBase64: string): Buffer {
  const raw = String(bodyBase64 || "").trim();
  if (!raw) throw new Error("Object body is required.");
  const buf = Buffer.from(raw, "base64");
  if (!buf.length) throw new Error("Object body is required.");
  if (buf.byteLength > R2_MAX_OBJECT_BYTES) {
    throw new Error(`Object is too large (max ${R2_MAX_OBJECT_BYTES} bytes).`);
  }
  return buf;
}

export function sanitizeR2Error(err: unknown, secrets: string[] = []): string {
  let msg = err instanceof Error ? err.message : "Could not reach R2.";
  for (const secret of secrets) {
    if (!secret) continue;
    if (msg.includes(secret)) msg = msg.split(secret).join("••••");
  }
  return msg;
}

export function humanR2Error(err: unknown, secret = ""): string {
  const raw = sanitizeR2Error(err, [secret]);
  if (/not configured|R2_ACCESS_KEY_ID|R2_ENDPOINT|R2_ACCOUNT_ID/i.test(raw)) {
    return R2_SETUP_MESSAGE;
  }
  if (/403|AccessDenied|SignatureDoesNotMatch|InvalidAccessKeyId/i.test(raw)) {
    return "R2 rejected the request. Check the API token and bucket name on Vercel.";
  }
  if (/404|NoSuchKey|Not Found/i.test(raw)) return "Object not found.";
  return raw;
}

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

export function amzDateParts(now: Date) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function encodeS3Path(path: string): string {
  return path
    .split("/")
    .map((part) => encodeRfc3986(part))
    .join("/");
}

export function objectUrl(config: R2Config, key: string): URL {
  const safe = sanitizeObjectKey(key);
  return new URL(`${config.endpoint}/${config.bucket}/${encodeS3Path(safe)}`);
}

function headerMap(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const name = key.toLowerCase().trim();
    const val = value.trim().replace(/\s+/g, " ");
    if (!name) continue;
    out[name] = out[name] ? `${out[name]},${val}` : val;
  }
  return out;
}

export function awsSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

export type SignS3Input = {
  method: string;
  url: URL;
  headers?: Record<string, string>;
  body?: Buffer | null;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  service?: string;
  now?: Date;
  unsignedPayload?: boolean;
};

export type SignedS3Request = {
  url: string;
  headers: Record<string, string>;
  amzDate: string;
  authorization: string;
  payloadHash: string;
  canonicalRequest: string;
  stringToSign: string;
  signature: string;
};

export function signS3Request(input: SignS3Input): SignedS3Request {
  const region = input.region || R2_REGION;
  const service = input.service || R2_SERVICE;
  const { amzDate, dateStamp } = amzDateParts(input.now ?? new Date());
  const payloadHash = input.unsignedPayload
    ? "UNSIGNED-PAYLOAD"
    : sha256Hex(input.body ?? Buffer.alloc(0));

  const headers = headerMap({
    host: input.url.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    ...(input.headers ?? {}),
  });

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalQuery = [...input.url.searchParams.entries()]
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonicalUri = encodeS3Path(input.url.pathname) || "/";
  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmacSha256(
    awsSigningKey(input.secretAccessKey, dateStamp, region, service),
    stringToSign,
  ).toString("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: input.url.toString(),
    headers: { ...headers, authorization },
    amzDate,
    authorization,
    payloadHash,
    canonicalRequest,
    stringToSign,
    signature,
  };
}

export function presignS3Get(input: {
  url: URL;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  service?: string;
  expiresIn?: number;
  now?: Date;
}): string {
  const region = input.region || R2_REGION;
  const service = input.service || R2_SERVICE;
  const expiresIn = Math.min(7 * 24 * 60 * 60, Math.max(1, input.expiresIn ?? R2_PRESIGN_TTL_SEC));
  const { amzDate, dateStamp } = amzDateParts(input.now ?? new Date());
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${input.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": "host",
  });
  const signed = new URL(input.url.toString());
  signed.search = "";
  for (const [key, value] of [...params.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    signed.searchParams.set(key, value);
  }

  const payloadHash = "UNSIGNED-PAYLOAD";
  const canonicalQuery = [...signed.searchParams.entries()]
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .sort()
    .join("&");
  const canonicalRequest = [
    "GET",
    encodeS3Path(signed.pathname) || "/",
    canonicalQuery,
    `host:${signed.host}\n`,
    "host",
    payloadHash,
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmacSha256(
    awsSigningKey(input.secretAccessKey, dateStamp, region, service),
    stringToSign,
  ).toString("hex");
  signed.searchParams.set("X-Amz-Signature", signature);
  return signed.toString();
}
