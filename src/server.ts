// Sentry first — Vercel Node functions cannot use --import, so init here.
import "./instrument.server";
// Outbound safety gate: registers the send gate and the group kill switches.
import "@/lib/server/outbound-gate";

import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { englishAliasPath } from "@/lib/locale-path";
import { reportError } from "@/lib/observe";
import { flushSentry } from "@/lib/sentry.server";

function englishAliasRedirect(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  const path = englishAliasPath(url.pathname);
  if (!path) return null;
  url.pathname = path;
  return Response.redirect(url, 301);
}

function signinRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/signin" && path !== "/fr/signin") return null;
  url.pathname = path === "/fr/signin" ? "/fr/login" : "/login";
  return Response.redirect(url, 301);
}

async function admissionsRedirect(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/admissions" && path !== "/fr/admissions") return null;
  const { roleChromeForRequest } = await import("@/lib/server/role-route");
  const { admissionsRedirectPath } = await import("@/lib/admissions-forward");
  const chrome = await roleChromeForRequest(request);
  const target = admissionsRedirectPath({ pathname: path, role: chrome.role, signedIn: chrome.signedIn });
  if (!target) return null;
  return Response.redirect(new URL(target, url.origin), 302);
}

export default createServerEntry({
  async fetch(request) {
    try {
      const bounced = englishAliasRedirect(request) ?? signinRedirect(request);
      if (bounced) return bounced;
      const admissions = await admissionsRedirect(request);
      if (admissions) return admissions;
      return await handler.fetch(request);
    } catch (err) {
      reportError(err, { route: new URL(request.url).pathname || "server" });
      throw err;
    } finally {
      await flushSentry();
    }
  },
});
