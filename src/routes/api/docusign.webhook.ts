import { createFileRoute } from "@tanstack/react-router";
import { applyEnvelopeEvent } from "@/lib/server/docusign";
import { planConnectWebhook, webhookUrlHasSecret } from "@/lib/server/docusign-connect";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";

function ignored(reason: "not_configured" | "foreign_account" | "unknown_account" | "empty") {
  return Response.json({ ok: true, ignored: reason });
}

async function run(request: Request) {
  const raw = await request.text();
  const plan = planConnectWebhook(request, raw);
  const ip = requestIp(request);
  if (plan.kind === "query_secret" || webhookUrlHasSecret(request)) {
    await logSecurityEvent({ kind: "webhook_reject", detail: "docusign query secret", ip });
    return new Response("Unauthorized", { status: 401 });
  }
  if (plan.kind === "not_configured") return ignored("not_configured");
  if (plan.kind === "foreign_account") return ignored("foreign_account");
  if (plan.kind === "unknown_account") return ignored("unknown_account");
  if (plan.kind === "bad_signature") {
    await logSecurityEvent({ kind: "webhook_reject", detail: "docusign signature", ip });
    return new Response("Unauthorized", { status: 401 });
  }
  if (plan.kind === "empty") return ignored("empty");
  try {
    const result = await applyEnvelopeEvent(plan.parsed);
    await logSecurityEvent({ kind: "webhook_accept", detail: "docusign envelope", ip });
    return Response.json(result);
  } catch {
    return Response.json({ ok: false, error: "apply failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/docusign/webhook")({
  server: {
    handlers: {
      GET: () => new Response("Method Not Allowed", { status: 405 }),
      POST: ({ request }) => run(request),
    },
  },
});
