import { createFileRoute } from "@tanstack/react-router";
import { applyEnvelopeEvent } from "@/lib/server/docusign";
import { authorizedWebhook, parseConnectPayload, webhookUrlHasSecret } from "@/lib/server/docusign-connect";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";

async function run(request: Request) {
  const raw = await request.text();
  const secret = (process.env.DOCUSIGN_WEBHOOK_SECRET || "").trim();
  const ip = requestIp(request);
  if (webhookUrlHasSecret(request)) {
    await logSecurityEvent({ kind: "webhook_reject", detail: "docusign query secret", ip });
    return new Response("Unauthorized", { status: 401 });
  }
  if (!secret) {
    await logSecurityEvent({ kind: "webhook_reject", detail: "docusign secret missing", ip });
    return new Response("Unauthorized", { status: 401 });
  }
  if (!authorizedWebhook(request, raw, secret)) {
    await logSecurityEvent({ kind: "webhook_reject", detail: "docusign signature", ip });
    return new Response("Unauthorized", { status: 401 });
  }
  const parsed = raw ? parseConnectPayload(raw) : null;
  if (!parsed) return Response.json({ ok: true, ignored: "empty" });
  try {
    const result = await applyEnvelopeEvent(parsed);
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
