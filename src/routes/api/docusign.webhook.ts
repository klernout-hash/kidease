import { createFileRoute } from "@tanstack/react-router";
import { applyEnvelopeEvent, authorizedWebhook, docusignMode, parseConnectPayload } from "@/lib/server/docusign";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";

async function run(request: Request) {
  const raw = await request.text();
  const secret = (process.env.DOCUSIGN_WEBHOOK_SECRET || "").trim();
  const ip = requestIp(request);
  if (!secret) {
    await logSecurityEvent({ kind: "webhook_reject", detail: "docusign secret missing", ip });
    return new Response("Unauthorized", { status: 401 });
  }
  if (!authorizedWebhook(request, raw)) {
    await logSecurityEvent({ kind: "webhook_reject", detail: "docusign signature", ip });
    return new Response("Unauthorized", { status: 401 });
  }
  const parsed = raw ? parseConnectPayload(raw) : null;
  if (!parsed) return Response.json({ ok: true, ignored: "empty" });
  try {
    const result = await applyEnvelopeEvent(parsed);
    await logSecurityEvent({ kind: "webhook_accept", detail: "docusign envelope", ip });
    return Response.json({ ok: true, ...result });
  } catch (err) {
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
