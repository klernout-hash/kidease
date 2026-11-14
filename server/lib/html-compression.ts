import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { isHtmlResponse } from "../../scripts/csp.mjs";

const gzipAsync = promisify(gzip);

function encodingQualities(acceptEncoding: string | null): Map<string, number> {
  const qualities = new Map<string, number>();
  if (!acceptEncoding?.trim()) return qualities;
  for (const member of acceptEncoding.split(",")) {
    const [coding, ...parameters] = member.trim().toLowerCase().split(";");
    if (!["gzip", "*", "identity"].includes(coding.trim())) continue;
    let quality = 1;
    for (const parameter of parameters) {
      const [name, rawValue] = parameter.trim().split("=");
      if (name.trim() !== "q") continue;
      const value = rawValue?.trim() || "";
      quality = Math.min(quality, /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(value)
        ? Number(value)
        : 0);
    }
    const key = coding.trim();
    // Repeated, contradictory preferences are resolved conservatively.
    qualities.set(key, Math.min(qualities.get(key) ?? 1, quality));
  }
  return qualities;
}

/** Explicit gzip exclusions take precedence over a wildcard. */
export function acceptsGzip(acceptEncoding: string | null): boolean {
  const qualities = encodingQualities(acceptEncoding);
  const gzipQuality = qualities.get("gzip") ?? qualities.get("*") ?? 0;
  const identityQuality = qualities.get("identity");
  return gzipQuality > 0 && (identityQuality === undefined || gzipQuality >= identityQuality);
}

function acceptsIdentity(acceptEncoding: string | null): boolean {
  const qualities = encodingQualities(acceptEncoding);
  return (qualities.get("identity") ?? (qualities.get("*") === 0 ? 0 : 1)) > 0;
}

function varyOnEncoding(headers: Headers): void {
  const current = headers.get("vary");
  const fields = (current || "").split(",").map((field) => field.trim().toLowerCase());
  if (fields.includes("*") || fields.includes("accept-encoding")) return;
  headers.set("Vary", current ? `${current}, Accept-Encoding` : "Accept-Encoding");
}

/**
 * Encode finalized HTML only: CSP nonce/head transformations must run first.
 * Cache and cookie policy belong to the caller and are preserved verbatim.
 */
export async function compressHtmlResponse(
  response: Response,
  acceptEncoding: string | null,
): Promise<Response> {
  if (
    !response.body ||
    !isHtmlResponse(response.headers.get("content-type")) ||
    response.headers.has("content-encoding") ||
    response.status === 206 ||
    response.headers.has("content-range")
  ) {
    return response;
  }

  const headers = new Headers(response.headers);
  varyOnEncoding(headers);
  if (!acceptsGzip(acceptEncoding)) {
    if (!acceptsIdentity(acceptEncoding)) {
      headers.set("Content-Length", "0");
      for (const name of ["ETag", "Content-MD5", "Digest", "Content-Digest", "Repr-Digest"]) headers.delete(name);
      return new Response(null, { status: 406, statusText: "Not Acceptable", headers });
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const encoded = await gzipAsync(new Uint8Array(await response.arrayBuffer()), { level: 6 });
  headers.set("Content-Encoding", "gzip");
  headers.set("Content-Length", String(encoded.byteLength));
  // These validators described the unencoded representation.
  headers.delete("ETag");
  headers.delete("Content-MD5");
  headers.delete("Digest");
  headers.delete("Content-Digest");
  headers.delete("Repr-Digest");
  return new Response(new Uint8Array(encoded), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
