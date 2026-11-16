/**
 * Serves Microsoft manifest extras and the widget feed only when the matching
 * flag is on. While every flag is off, the request continues and the static
 * manifest at /manifest.microsoft.webmanifest is unchanged.
 */
import baseManifest from "../../public/manifest.microsoft.webmanifest" with { type: "json" };
import {
  microsoftManifestActive,
  microsoftWidgetData,
  withMicrosoftExtras,
  type MicrosoftManifest,
} from "../../src/lib/microsoft/platform.ts";

interface MicrosoftEvent {
  url: URL;
  req: { method?: string };
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-cache",
};

export default async function microsoftManifestMiddleware(
  event: MicrosoftEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const method = (event.req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return next();
  const path = event.url.pathname;
  if (path === "/api/microsoft-widget") {
    const data = microsoftWidgetData(process.env);
    if (!data) return next();
    if (method === "HEAD") return new Response(null, { headers: JSON_HEADERS });
    return Response.json(data, { headers: JSON_HEADERS });
  }
  if (path !== "/api/microsoft-manifest") return next();
  if (!microsoftManifestActive(process.env)) return next();
  const manifest = typeof baseManifest === "string" ? (JSON.parse(baseManifest) as MicrosoftManifest) : (baseManifest as MicrosoftManifest);
  const body = JSON.stringify(withMicrosoftExtras(manifest, process.env));
  if (method === "HEAD") {
    return new Response(null, {
      headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "no-cache" },
    });
  }
  return new Response(body, {
    headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "no-cache" },
  });
}
