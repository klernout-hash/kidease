// Sentry first — Vercel Node functions cannot use --import, so init here.
import "./instrument.server";

import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { reportError } from "@/lib/observe";
import { flushSentry } from "@/lib/sentry.server";

function signinRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/signin" && path !== "/fr/signin") return null;
  url.pathname = path === "/fr/signin" ? "/fr/login" : "/login";
  return Response.redirect(url, 301);
}

export default createServerEntry({
  async fetch(request) {
    try {
      const bounced = signinRedirect(request);
      if (bounced) return bounced;
      return await handler.fetch(request);
    } catch (err) {
      reportError(err, { route: new URL(request.url).pathname || "server" });
      throw err;
    } finally {
      await flushSentry();
    }
  },
});
