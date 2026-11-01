import { createFileRoute } from "@tanstack/react-router";
import { cronAuthorized } from "@/lib/cron-auth";
import { runCalendarJob } from "@/lib/server/compliance-calendar";

export const Route = createFileRoute("/api/compliance/calendar")({
  server: {
    handlers: {
      GET: ({ request }) => (cronAuthorized(request) ? runCalendarJob().then((result) => Response.json(result)) : new Response("Unauthorized", { status: 401 })),
      POST: ({ request }) => (cronAuthorized(request) ? runCalendarJob().then((result) => Response.json(result)) : new Response("Unauthorized", { status: 401 })),
    },
  },
});
