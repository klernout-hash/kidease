/**
 * Private provider docs (screening certificates + provincial licence scans).
 * Stored as R2 keys (`screening/…`, `licenses/…`) or a small data-URL fallback
 * when R2 is not configured. Never put these on public listings.
 */

export const PRIVATE_DOC_MAX_BYTES = 4 * 1024 * 1024;
/** Local/dev only — Production must use R2 so Vercel body limits do not truncate files. */
export const PRIVATE_DOC_FALLBACK_MAX_BYTES = 350_000;
export const PRIVATE_DOC_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const R2_SCREENING_PREFIX = "screening";
export const R2_LICENSE_PREFIX = "licenses";
export const SCREENING_DOC_API = "/api/screening-documents";
export const LICENSE_DOC_API = "/api/license-docs";

export const PRIVATE_DOC_BAD_FILE = "Upload a PDF or image under 4 MB.";

export type UploadPart = {
  arrayBuffer: () => Promise<ArrayBuffer>;
  size: number;
  type: string;
  name: string;
};

/**
 * Accept a multipart file without `instanceof File`.
 * Undici's File on Vercel is a different realm, so `instanceof File` rejects a real upload.
 */
export function asUploadPart(value: unknown): UploadPart | null {
  if (!value || typeof value !== "object") return null;
  const file = value as {
    arrayBuffer?: () => Promise<ArrayBuffer>;
    size?: unknown;
    type?: unknown;
    name?: unknown;
  };
  if (typeof file.arrayBuffer !== "function") return null;
  const size = typeof file.size === "number" ? file.size : Number(file.size);
  if (!Number.isFinite(size) || size < 0) return null;
  const type = typeof file.type === "string" ? file.type : "";
  const name = typeof file.name === "string" && file.name.trim() ? file.name.trim() : "document";
  const read = file.arrayBuffer.bind(value);
  return {
    arrayBuffer: () => read(),
    size,
    type,
    name,
  };
}

export function inferPrivateDocMime(input: {
  mime?: string | null;
  filename?: string | null;
  dataUrl?: string | null;
}): string {
  const raw = (input.mime || "").trim().toLowerCase().split(";")[0]?.trim() || "";
  if (raw === "image/jpg") return "image/jpeg";
  if ((PRIVATE_DOC_MIME as readonly string[]).includes(raw)) return raw;
  const name = (input.filename || "").trim().toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  const dataUrl = (input.dataUrl || "").trim();
  if (dataUrl.startsWith("data:")) {
    const header = dataUrl.slice(5, dataUrl.indexOf(",")).toLowerCase();
    const headerMime = header.split(";")[0]?.trim() || "";
    if (headerMime === "image/jpg") return "image/jpeg";
    if ((PRIVATE_DOC_MIME as readonly string[]).includes(headerMime)) return headerMime;
  }
  return "";
}

export function isAllowedPrivateDocMime(mime: string | null | undefined): boolean {
  return (PRIVATE_DOC_MIME as readonly string[]).includes((mime || "").trim().toLowerCase());
}

export function privateDocExt(mime: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export function isPrivateR2Key(ref: string | null | undefined): boolean {
  const key = (ref || "").trim();
  return key.startsWith(`${R2_SCREENING_PREFIX}/`) || key.startsWith(`${R2_LICENSE_PREFIX}/`);
}

export function isLegacyPrivateDataUrl(ref: string | null | undefined): boolean {
  const value = (ref || "").trim();
  return value.startsWith("data:image/") || value.startsWith("data:application/pdf");
}

export function hasStoredPrivateDoc(ref: string | null | undefined): boolean {
  return isPrivateR2Key(ref) || isLegacyPrivateDataUrl(ref);
}

/** Short marker for list payloads — never ship a multi-megabyte data URL. */
export function licenseReviewMarker(ref: string | null | undefined): string | null {
  const value = (ref || "").trim();
  if (!value) return null;
  if (value.startsWith("data:image/")) return "data:image";
  if (value.startsWith("data:application/pdf")) return "data:application/pdf";
  if (isPrivateR2Key(value)) return value;
  return "on-file";
}

export function screeningDocHref(documentId: string): string {
  return `${SCREENING_DOC_API}/${encodeURIComponent(documentId)}`;
}

export function licenseDocHref(daycareId: string): string {
  return `${LICENSE_DOC_API}/${encodeURIComponent(daycareId)}`;
}

export function safeDocKeyPart(raw: string): string {
  const v = String(raw || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!v) throw new Error("Invalid document key.");
  return v;
}

export async function postPrivateDocForm(
  href: string,
  fields: Record<string, string>,
  file: File,
): Promise<{ ok: true } & Record<string, unknown>> {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  body.set("file", file, file.name);
  const res = await fetch(href, { method: "POST", body, credentials: "same-origin" });
  let json: { ok?: boolean; error?: string } = {};
  try {
    json = (await res.json()) as { ok?: boolean; error?: string };
  } catch {
    json = {};
  }
  if (!res.ok || !json.ok) {
    throw new Error(json.error || PRIVATE_DOC_BAD_FILE);
  }
  return { ...json, ok: true as const };
}

export function openPrivateDocHref(href: string) {
  const opened = window.open(href, "_blank", "noopener");
  if (!opened) {
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
  }
}
