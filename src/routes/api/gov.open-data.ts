import { createFileRoute } from "@tanstack/react-router";
import { actorFromApiKey, auditGov } from "@/lib/server/gov-actor.server";
import { dashboardForActor } from "@/lib/server/gov-portal.server";

const robots = {
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex, nofollow",
};

function statusOf(err: unknown): number {
  const status = (err as { status?: number }).status;
  return status === 403 || status === 429 ? status : 500;
}

export const Route = createFileRoute("/api/gov/open-data")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const header = request.headers.get("authorization") || "";
        const bearer = header.replace(/^Bearer\s+/i, "").trim();
        const key = bearer || request.headers.get("x-api-key") || "";
        const actor = await actorFromApiKey(key);
        if (!actor) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: robots });
        }
        const url = new URL(request.url);
        try {
          const data = await dashboardForActor(actor, {
            province: url.searchParams.get("province"),
            region: url.searchParams.get("region"),
            city: url.searchParams.get("city"),
            locale: url.searchParams.get("locale"),
          });
          await auditGov({ userId: actor.userId, action: "open_data", province: data.province });
          return Response.json(
            { anonymized: true, kAnonymity: data.k, generatedAt: data.generatedAt, place: data.placeLabel, data },
            { headers: { ...robots, "content-type": "application/json; charset=utf-8" } },
          );
        } catch (err) {
          const status = statusOf(err);
          const retry = (err as { retryAfterSec?: number }).retryAfterSec;
          return Response.json(
            { error: status === 429 ? "Too many requests" : "Unavailable" },
            { status, headers: { ...robots, ...(retry ? { "retry-after": String(retry) } : {}) } },
          );
        }
      },
    },
  },
});
