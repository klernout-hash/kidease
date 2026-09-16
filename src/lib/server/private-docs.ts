import {
  inferPrivateDocMime,
  isAllowedPrivateDocMime,
  isLegacyPrivateDataUrl,
  isPrivateR2Key,
  PRIVATE_DOC_BAD_FILE,
  PRIVATE_DOC_FALLBACK_MAX_BYTES,
  PRIVATE_DOC_MAX_BYTES,
  privateDocExt,
  R2_LICENSE_PREFIX,
  R2_SCREENING_PREFIX,
  safeDocKeyPart,
} from "@/lib/private-docs";
import { R2_SETUP_MESSAGE, resolveR2Config } from "@/lib/server/r2";
import { nid } from "@/lib/utils";

export type PrivateDocPrefix = typeof R2_SCREENING_PREFIX | typeof R2_LICENSE_PREFIX;

export type LoadedPrivateDoc = {
  body: Buffer;
  mime: string;
  filename: string;
};

export function decodePrivateDataUrl(dataUrl: string): { body: Buffer; mime: string } | null {
  const raw = (dataUrl || "").trim();
  if (!raw.startsWith("data:") || !raw.includes(",")) return null;
  const comma = raw.indexOf(",");
  const header = raw.slice(5, comma).toLowerCase();
  const mime = inferPrivateDocMime({ mime: header.split(";")[0], dataUrl: raw });
  const body = Buffer.from(raw.slice(comma + 1), "base64");
  if (!body.byteLength || !isAllowedPrivateDocMime(mime)) return null;
  return { body, mime };
}

export function parsePrivateUpload(input: {
  dataUrl?: string;
  mime?: string;
  filename?: string;
  body?: Buffer;
}):
  | { ok: true; body: Buffer; mime: string; filename: string }
  | { ok: false; error: string } {
  const filename = (input.filename || "document").trim().slice(0, 160) || "document";
  let body = input.body;
  let mime = inferPrivateDocMime({ mime: input.mime, filename, dataUrl: input.dataUrl });
  if (!body && input.dataUrl) {
    const decoded = decodePrivateDataUrl(input.dataUrl);
    if (!decoded) return { ok: false, error: PRIVATE_DOC_BAD_FILE };
    body = decoded.body;
    mime = mime || decoded.mime;
  }
  if (!body?.byteLength || !isAllowedPrivateDocMime(mime)) {
    return { ok: false, error: PRIVATE_DOC_BAD_FILE };
  }
  if (body.byteLength > PRIVATE_DOC_MAX_BYTES) {
    return { ok: false, error: PRIVATE_DOC_BAD_FILE };
  }
  return { ok: true, body, mime, filename };
}

export async function persistPrivateDoc(input: {
  prefix: PrivateDocPrefix;
  keyTail: string;
  body: Buffer;
  mime: string;
}): Promise<{ storageRef: string; mime: string }> {
  const parsed = parsePrivateUpload({ body: input.body, mime: input.mime });
  if (!parsed.ok) throw new Error(parsed.error);
  const key = `${input.prefix}/${input.keyTail}.${privateDocExt(parsed.mime)}`;
  if (resolveR2Config().ok) {
    const { putPrivateDoc } = await import("@/lib/server/r2.server");
    const stored = await putPrivateDoc({
      key,
      contentType: parsed.mime,
      body: parsed.body,
    });
    return { storageRef: stored.key, mime: stored.contentType };
  }
  if (parsed.body.byteLength > PRIVATE_DOC_FALLBACK_MAX_BYTES) {
    throw new Error(R2_SETUP_MESSAGE);
  }
  return {
    storageRef: `data:${parsed.mime};base64,${parsed.body.toString("base64")}`,
    mime: parsed.mime,
  };
}

export async function loadPrivateDoc(
  ref: string | null | undefined,
  fallbackMime?: string | null,
  fallbackName?: string | null,
): Promise<LoadedPrivateDoc> {
  const value = (ref || "").trim();
  if (!value) throw new Error("File not found");
  const filename = (fallbackName || "document").trim().slice(0, 160) || "document";
  if (isLegacyPrivateDataUrl(value)) {
    const decoded = decodePrivateDataUrl(value);
    if (!decoded) throw new Error("File not found");
    return { body: decoded.body, mime: decoded.mime, filename };
  }
  if (!isPrivateR2Key(value)) throw new Error("File not found");
  const { getR2Object } = await import("@/lib/server/r2.server");
  const object = await getR2Object(value);
  return {
    body: object.body,
    mime: fallbackMime || object.contentType || "application/octet-stream",
    filename,
  };
}

export function screeningObjectTail(input: {
  daycareId: string;
  personId: string;
  kind: string;
}): string {
  return `${safeDocKeyPart(input.daycareId)}/${safeDocKeyPart(input.personId)}/${safeDocKeyPart(input.kind)}-${safeDocKeyPart(nid("sd"))}`;
}

export function licenseObjectTail(daycareId: string): string {
  return `${safeDocKeyPart(daycareId)}/${safeDocKeyPart(nid("lic"))}`;
}

export function privateDocResponse(doc: LoadedPrivateDoc): Response {
  const safeName = doc.filename.replace(/[^\w.-]+/g, "-") || "document";
  return new Response(new Uint8Array(doc.body), {
    status: 200,
    headers: {
      "Content-Type": doc.mime,
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Length": String(doc.body.byteLength),
    },
  });
}

export async function readUploadFile(file: File | Blob | null | undefined): Promise<Buffer> {
  if (!file) throw new Error(PRIVATE_DOC_BAD_FILE);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > PRIVATE_DOC_MAX_BYTES) {
    throw new Error(PRIVATE_DOC_BAD_FILE);
  }
  return bytes;
}
