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
  R2_MAX_OBJECT_BYTES,
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
    const text = method === "HEAD" ? "" : (await res.text().catch(() => "")).slice(0, 240);
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
  if (body.byteLength > R2_MAX_OBJECT_BYTES) {
    throw new Error(`Object is too large (max ${R2_MAX_OBJECT_BYTES} bytes).`);
  }
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

export async function headR2Object(keyInput: string): Promise<{
  key: string;
  exists: boolean;
  bytes: number | null;
  contentType: string | null;
  etag: string | null;
}> {
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
    const res = await r2Fetch(signed, "HEAD");
    const length = Number(res.headers.get("content-length"));
    return {
      key,
      exists: true,
      bytes: Number.isFinite(length) ? length : null,
      contentType: res.headers.get("content-type"),
      etag: res.headers.get("etag"),
    };
  } catch (err) {
    const message = humanR2Error(err, config.secretAccessKey);
    if (/not found/i.test(message)) {
      return { key, exists: false, bytes: null, contentType: null, etag: null };
    }
    throw new Error(message);
  }
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
