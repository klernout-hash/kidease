import { createFileRoute } from "@tanstack/react-router";
import { cronAuthorized } from "@/lib/cron-auth";
import { pollOpenEnvelopes } from "@/lib/server/docusign";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";

async function run(request: Request) {
  const ip = requestIp(request);
  if (new URL(request.url).searchParams.has("secret")) {
    await logSecurityEvent({ kind: "webhook_reject", detail: "docusign poll query secret", ip });
    return new Response("Unauthorized", { status: 401 });
  }
  if (!cronAuthorized(request)) {
    await logSecurityEvent({ kind: "webhook_reject", detail: "docusign poll cron", ip });
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await pollOpenEnvelopes();
  await logSecurityEvent({ kind: "webhook_accept", detail: "docusign poll", ip });
  return Response.json(result);
}

export const Route = createFileRoute("/api/docusign/poll")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
