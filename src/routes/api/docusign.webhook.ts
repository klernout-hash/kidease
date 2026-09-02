import { createFileRoute } from "@tanstack/react-router";
import { applyEnvelopeEvent, authorizedWebhook, docusignMode, parseConnectPayload } from "@/lib/server/docusign";

async function run(request: Request) {
  const raw = await request.text();
  if (!authorizedWebhook(request, raw)) return new Response("Unauthorized", { status: 401 });
  const parsed = raw ? parseConnectPayload(raw) : null;
  if (!parsed) return Response.json({ ok: true, ignored: "empty" });
  try {
    const result = await applyEnvelopeEvent(parsed);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[docusign.webhook]", err);
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "apply failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/docusign/webhook")({
  server: {
    handlers: {
      GET: () => Response.json({ ok: true, mode: docusignMode() }),
      POST: ({ request }) => run(request),
    },
  },
});
