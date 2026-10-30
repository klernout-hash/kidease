/**
 * Apex Apple App Site Association.
 *
 * Vercel redirects every https://kidease.ca/* request to www with a 308
 * before this app runs. Apple will not follow that redirect for
 * https://kidease.ca/.well-known/apple-app-site-association.
 *
 * This worker answers only those association paths on the apex host, with the
 * same JSON www already serves at 200. Other apex paths stay on the Vercel 308.
 */

export const APEX_AASA_HOST = "kidease.ca";
export const APEX_AASA_PATHS = [
  "/.well-known/apple-app-site-association",
  "/.well-known/apple-app-site-association.json",
  "/apple-app-site-association",
];

export function isApexAasaRequest(url, method = "GET") {
  const verb = String(method || "GET").toUpperCase();
  if (verb !== "GET" && verb !== "HEAD") return false;
  try {
    const parsed = typeof url === "string" ? new URL(url) : url;
    return parsed.hostname === APEX_AASA_HOST && APEX_AASA_PATHS.includes(parsed.pathname);
  } catch {
    return false;
  }
}

export async function apexAasaResponse(request, fetchImpl = fetch) {
  const url = new URL(request.url);
  const upstream = await fetchImpl(`https://www.kidease.ca${url.pathname}`, {
    method: request.method,
    redirect: "manual",
    headers: { accept: "application/json" },
  });
  if (upstream.status !== 200) {
    return new Response("apple-app-site-association unavailable", {
      status: 502,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
  const cacheControl = upstream.headers.get("cache-control") || "public, max-age=3600";
  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": cacheControl,
    },
  });
}

export default {
  async fetch(request) {
    if (!isApexAasaRequest(request.url, request.method)) return fetch(request);
    return apexAasaResponse(request);
  },
};
