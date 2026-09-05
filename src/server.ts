// Sentry first — Vercel Node functions cannot use --import, so init here.
import "./instrument.server";

import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { reportError } from "@/lib/observe";
import { flushSentry } from "@/lib/sentry.server";

export default createServerEntry({
  async fetch(request) {
    try {
      return await handler.fetch(request);
    } catch (err) {
      reportError(err, { route: new URL(request.url).pathname || "server" });
      throw err;
    } finally {
      await flushSentry();
    }
  },
});
