import { isPosthogProxyPath, posthogUpstreamUrl } from "../posthog-proxy.ts";

const HOP =
  /^(host|connection|keep-alive|proxy-authenticate|proxy-authorization|te|trailers|transfer-encoding|upgrade|content-length)$/i;

function rewriteSetCookie(value: string): string {
  return value
    .split(";")
    .map((part) => (/^\s*domain=/i.test(part) ? "" : part))
    .filter((part) => part.trim().length > 0)
    .join(";");
}

/**
 * Forward a first-party `/ingest` request to PostHog US.
 * Drops incoming Cookie / Authorization so session cookies never leave kidease.ca.
 */
export async function proxyPosthogRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!isPosthogProxyPath(url.pathname)) {
    return new Response("Not Found", { status: 404 });
  }

  const dest = posthogUpstreamUrl(url.pathname, url.search);
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (HOP.test(key)) return;
    if (key === "cookie" || key === "authorization") return;
    headers.set(key, value);
  });
  headers.set("host", new URL(dest).host);
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const forwardedProto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "") || "https";
  const forwardedFor = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "";
  if (forwardedHost) headers.set("x-forwarded-host", forwardedHost.split(",")[0].trim());
  if (forwardedProto) headers.set("x-forwarded-proto", forwardedProto.split(",")[0].trim());
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  const upstream = await fetch(dest, init);
  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (HOP.test(key) || key === "set-cookie") return;
    out.set(key, value);
  });
  const setCookies =
    typeof upstream.headers.getSetCookie === "function" ? upstream.headers.getSetCookie() : [];
  for (const cookie of setCookies) {
    out.append("set-cookie", rewriteSetCookie(cookie));
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}

export function ingestProxyHandlers() {
  const run = ({ request }: { request: Request }) => proxyPosthogRequest(request);
  return {
    GET: run,
    HEAD: run,
    POST: run,
    PUT: run,
    PATCH: run,
    OPTIONS: run,
  };
}
