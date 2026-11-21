/**
 * Server-only R2 put/get. Keep the `.server` suffix so Vite never ships
 * signing keys or fetch helpers to the browser.
 */

import {
  allowContentType,
  allowContractPdfType,
  allowPrivateDocType,
  decodeObjectBody,
  humanR2Error,
  isPrivateDocKey,
  objectUrl,
  presignS3Get,
  R2_CONTRACT_MAX_BYTES,
  R2_MAX_OBJECT_BYTES,
  R2_PRESIGN_TTL_SEC,
  resolvePrivateR2Config,
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

function requirePrivateConfig(env: Record<string, string | undefined> = process.env): R2Config {
  const resolved = resolvePrivateR2Config(env);
  if (!resolved.ok) throw new Error(resolved.error);
  return resolved.config;
}

function configForKey(key: string): R2Config {
  return isPrivateDocKey(key) ? requirePrivateConfig() : requireConfig();
}

async function r2Fetch(
  signed: { url: string; headers: Record<string, string> },
  method: "GET" | "PUT" | "HEAD" | "DELETE",
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

/** Database backups are not images. Cap is 200 MB so a serverless run can hold the file. */
export async function putR2BackupBytes(input: { key: string; body: Buffer }): Promise<R2PutResult> {
  const config = requireConfig();
  const key = sanitizeObjectKey(input.key);
  if (!key.startsWith("backups/neon/")) throw new Error("Backup key is not allowed.");
  const body = input.body;
  if (!body.byteLength) throw new Error("Object body is required.");
  if (body.byteLength > 200 * 1024 * 1024) throw new Error("Backup is too large.");
  const contentType = "application/octet-stream";
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
    return { key, bytes: body.byteLength, contentType, etag: res.headers.get("etag") };
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

export async function putContractPdf(input: { key: string; body: Buffer }): Promise<R2PutResult> {
  const config = requireConfig();
  const key = sanitizeObjectKey(input.key);
  if (!key.startsWith("contracts/")) throw new Error("Signed PDF key must stay under contracts/.");
  const contentType = allowContractPdfType("application/pdf");
  const body = input.body;
  if (!body.byteLength) throw new Error("Object body is required.");
  if (body.byteLength > R2_CONTRACT_MAX_BYTES) {
    throw new Error(`Signed PDF is too large (max ${R2_CONTRACT_MAX_BYTES} bytes).`);
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

export async function putPrivateDoc(input: {
  key: string;
  contentType: string;
  body: Buffer;
}): Promise<R2PutResult> {
  const key = sanitizeObjectKey(input.key);
  if (!isPrivateDocKey(key)) {
    throw new Error("Private document key must stay under screening/, licenses/, family-docs/, or centre-docs/.");
  }
  const config = requirePrivateConfig();
  const contentType = allowPrivateDocType(input.contentType);
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

/** Remove a parent vault object. Refuses every other prefix. */
async function deleteObject(config: R2Config, key: string): Promise<void> {
  const url = objectUrl(config, key);
  const signed = signS3Request({
    method: "DELETE",
    url,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
  try {
    await r2Fetch(signed, "DELETE");
  } catch (err) {
    const message = humanR2Error(err, config.secretAccessKey);
    if (/not found/i.test(message)) return;
    throw new Error(message);
  }
}

export async function deleteFamilyDocObject(keyInput: string): Promise<void> {
  const key = sanitizeObjectKey(keyInput);
  if (!key.startsWith("family-docs/")) throw new Error("File not found");
  const privateResolved = resolvePrivateR2Config();
  if (privateResolved.ok) await deleteObject(privateResolved.config, key);
  const publicResolved = resolveR2Config();
  if (publicResolved.ok) await deleteObject(publicResolved.config, key);
  if (!privateResolved.ok && !publicResolved.ok) {
    throw new Error(privateResolved.ok ? "Object not found." : privateResolved.error);
  }
}

export async function headR2Object(keyInput: string): Promise<{
  key: string;
  exists: boolean;
  bytes: number | null;
  contentType: string | null;
  etag: string | null;
}> {
  const key = sanitizeObjectKey(keyInput);
  const config = isPrivateDocKey(key) ? resolvePrivateR2Config() : resolveR2Config();
  if (!config.ok) {
    if (!isPrivateDocKey(key)) throw new Error(config.error);
    const pub = resolveR2Config();
    if (!pub.ok) throw new Error(config.error);
    return headWithConfig(pub.config, key);
  }
  const found = await headWithConfig(config.config, key);
  if (found.exists || !isPrivateDocKey(key)) return found;
  const pub = resolveR2Config();
  if (!pub.ok || pub.config.bucket === config.config.bucket) return found;
  return headWithConfig(pub.config, key);
}

async function headWithConfig(
  config: R2Config,
  key: string,
): Promise<{
  key: string;
  exists: boolean;
  bytes: number | null;
  contentType: string | null;
  etag: string | null;
}> {
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

async function readObject(config: R2Config, key: string): Promise<R2GetResult> {
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

export async function getR2Object(keyInput: string): Promise<R2GetResult> {
  const key = sanitizeObjectKey(keyInput);
  if (!isPrivateDocKey(key)) return readObject(requireConfig(), key);
  const privateResolved = resolvePrivateR2Config();
  if (privateResolved.ok) {
    try {
      return await readObject(privateResolved.config, key);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (!/not found/i.test(message)) throw err instanceof Error ? err : new Error("Object not found.");
      console.error("[r2] private document is not in the private bucket yet");
    }
  } else {
    console.error("[r2] private document bucket is not ready");
  }
  return readObject(requireConfig(), key);
}

export function presignR2Get(
  keyInput: string,
  expiresIn = R2_PRESIGN_TTL_SEC,
): { key: string; url: string; expiresIn: number } {
  const key = sanitizeObjectKey(keyInput);
  const config = configForKey(key);
  const url = presignS3Get({
    url: objectUrl(config, key),
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    expiresIn,
  });
  return { key, url, expiresIn };
}
