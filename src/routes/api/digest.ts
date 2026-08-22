import { createFileRoute } from "@tanstack/react-router";
import { sendDailyDigest } from "@/lib/server/notify";

function authorized(request: Request) {
  const secret = (process.env.CRON_SECRET || process.env.DIGEST_SECRET || "").trim();
  if (!secret) return true;
  const header = request.headers.get("authorization") || "";
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

async function run(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const result = await sendDailyDigest();
  return Response.json(result);
}

export const Route = createFileRoute("/api/digest")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
