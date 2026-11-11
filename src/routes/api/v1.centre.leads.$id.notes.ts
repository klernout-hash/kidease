import { createFileRoute } from "@tanstack/react-router";
import { centreApiEnabled } from "@/lib/features";
import { handleCentreApi } from "@/lib/centre-api";
import { getSql } from "@/lib/db";
import { centreApiStore } from "@/lib/server/centre-leads";

async function respond(request: Request) {
  if (!centreApiEnabled()) return Response.json({ error: "not_found" }, { status: 404 });
  const sql = await getSql();
  return handleCentreApi({ request, store: centreApiStore(sql), enabled: true });
}

export const Route = createFileRoute("/api/v1/centre/leads/$id/notes")({
  server: {
    handlers: {
      POST: ({ request }) => respond(request),
    },
  },
});
