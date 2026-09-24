import { createFileRoute } from "@tanstack/react-router";
import { handleResendWebhook } from "@/lib/resend-webhook";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";

/**
 * Resend (Svix) webhook. Unset RESEND_WEBHOOK_SECRET no-ops.
 * Bad signatures are rejected. Hard bounces and complaints land in email_suppressions.
 */
async function run(request: Request) {
  const ip = requestIp(request);
  return handleResendWebhook(request, {
    secret: process.env.RESEND_WEBHOOK_SECRET,
    apply: async ({ event, svixId }) => {
      const { applyIncomingResendEvent } = await import("@/lib/server/email-suppressions");
      return applyIncomingResendEvent({ event, svixId });
    },
    log: async ({ kind, detail }) => {
      await logSecurityEvent({ kind, detail, ip }).catch(() => undefined);
    },
  });
}

export const Route = createFileRoute("/api/webhooks/resend")({
  server: {
    handlers: {
      GET: () => new Response("Method Not Allowed", { status: 405 }),
      POST: ({ request }) => run(request),
    },
  },
});
