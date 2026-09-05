/**
 * Server-only R2 put/get. Keep the `.server` suffix so Vite never ships
 * signing keys or fetch helpers to the browser.
 */

import {
  allowContentType,
  decodeObjectBody,
  humanR2Error,
  objectUrl,
  presignS3Get,
  publicPhotoToR2Key,
  r2MediaReadEnabled,
  R2_PRESIGN_TTL_SEC,
  resolveR2Config,
  sanitizeObjectKey,
  signS3Request,
  type R2Config,
} from "./r2";

export type R2PutResult = {
  key: string;
  bytes: number;
  contentType: string;
  etag: string | null;
};

export type R2GetResult = {
  key: string;
  bytes: number;
  contentType: string;
  body: Buffer;
  etag: string | null;
};

function requireConfig(env: Record<string, string | undefined> = process.env): R2Config {
  const resolved = resolveR2Config(env);
  if (!resolved.ok) throw new Error(resolved.error);
  return resolved.config;
}

async function r2Fetch(
  signed: { url: string; headers: Record<string, string> },
  method: "GET" | "PUT" | "HEAD",
  body?: Buffer | null,
) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(signed.headers)) {
    headers.set(key, value);
  }
  const res = await fetch(signed.url, {
    method,
    headers,
    body: body ? new Uint8Array(body) : undefined,
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 240);
    throw new Error(`R2 ${res.status}${text ? `: ${text}` : ""}`);
  }
  return res;
}

export async function putR2ObjectBytes(input: {
  key: string;
  contentType: string;
  body: Buffer;
}): Promise<R2PutResult> {
  const config = requireConfig();
  const key = sanitizeObjectKey(input.key);
  const contentType = allowContentType(input.contentType);
  const body = input.body;
  if (!body.byteLength) throw new Error("Object body is required.");
  const url = objectUrl(config, key);
  const signed = signS3Request({
    method: "PUT",
    url,
    headers: {
      "content-type": contentType,
      "content-length": String(body.byteLength),
    },
    body,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
  try {
    const res = await r2Fetch(signed, "PUT", body);
    return {
      key,
      bytes: body.byteLength,
      contentType,
      etag: res.headers.get("etag"),
    };
  } catch (err) {
    throw new Error(humanR2Error(err, config.secretAccessKey));
  }
}

export async function putR2Object(input: {
  key: string;
  contentType: string;
  bodyBase64: string;
}): Promise<R2PutResult> {
  return putR2ObjectBytes({
    key: input.key,
    contentType: input.contentType,
    body: decodeObjectBody(input.bodyBase64),
  });
}

export async function getR2Object(keyInput: string): Promise<R2GetResult> {
  const config = requireConfig();
  const key = sanitizeObjectKey(keyInput);
  const url = objectUrl(config, key);
  const signed = signS3Request({
    method: "GET",
    url,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
  try {
    const res = await r2Fetch(signed, "GET");
    const body = Buffer.from(await res.arrayBuffer());
    return {
      key,
      bytes: body.byteLength,
      contentType: res.headers.get("content-type") || "application/octet-stream",
      body,
      etag: res.headers.get("etag"),
    };
  } catch (err) {
    throw new Error(humanR2Error(err, config.secretAccessKey));
  }
}

export async function headR2Object(keyInput: string): Promise<boolean> {
  const config = requireConfig();
  const key = sanitizeObjectKey(keyInput);
  const url = objectUrl(config, key);
  const signed = signS3Request({
    method: "HEAD",
    url,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
  try {
    await r2Fetch(signed, "HEAD");
    return true;
  } catch (err) {
    const message = humanR2Error(err, config.secretAccessKey);
    if (/not found/i.test(message)) return false;
    throw new Error(message);
  }
}

const R2_MISS_TTL_MS = 5 * 60 * 1000;
const R2_MISS_MAX = 512;
const r2MissAt = new Map<string, number>();

function rememberR2Miss(key: string) {
  r2MissAt.set(key, Date.now());
  if (r2MissAt.size > R2_MISS_MAX) {
    const first = r2MissAt.keys().next().value;
    if (typeof first === "string") r2MissAt.delete(first);
  }
}

/** Prefer R2 for a catalogue `/photos/…` path. Returns null when unset, disabled, or missing. */
export async function tryReadPublicPhotoFromR2(
  publicPath: string,
): Promise<{ body: Buffer; contentType: string; key: string } | null> {
  if (!r2MediaReadEnabled()) return null;
  const key = publicPhotoToR2Key(publicPath);
  if (!key) return null;
  const missed = r2MissAt.get(key);
  if (missed && Date.now() - missed < R2_MISS_TTL_MS) return null;
  try {
    const object = await getR2Object(key);
    r2MissAt.delete(key);
    return { body: object.body, contentType: object.contentType, key };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/not found/i.test(message)) rememberR2Miss(key);
    return null;
  }
}

export function presignR2Get(
  keyInput: string,
  expiresIn = R2_PRESIGN_TTL_SEC,
): { key: string; url: string; expiresIn: number } {
  const config = requireConfig();
  const key = sanitizeObjectKey(keyInput);
  const url = presignS3Get({
    url: objectUrl(config, key),
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    expiresIn,
  });
  return { key, url, expiresIn };
}
