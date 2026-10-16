import { createFileRoute } from "@tanstack/react-router";
import { clientDialTwiml } from "@/lib/voice";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";
import { authorizeTwilioPost } from "@/lib/server/sms-status";
import { identitiesForClientCall } from "@/lib/server/voice-routing";

/**
 * TwiML App voice URL for browser calls.
 * Dials the other party's Twilio client. Never a phone number.
 */
async function run(request: Request) {
  const ip = requestIp(request);
  const auth = await authorizeTwilioPost(request, process.env.TWILIO_VOICE_CONNECT_URL);
  if (!auth.ok) {
    await logSecurityEvent({ kind: "webhook_reject", detail: "twilio voice connect", ip });
    return auth.response;
  }
  const identities = await identitiesForClientCall({
    fromIdentity: auth.params.From || auth.params.Caller || "",
    conversationId: auth.params.conversationId || auth.params.ConversationId || "",
  }).catch(() => [] as string[]);
  await logSecurityEvent({
    kind: "webhook_accept",
    detail: identities.length ? "twilio voice client" : "twilio voice client denied",
    ip,
  });
  return new Response(clientDialTwiml(identities), {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export const Route = createFileRoute("/api/voice/connect")({
  server: {
    handlers: {
      GET: () => new Response("Method Not Allowed", { status: 405 }),
      POST: ({ request }) => run(request),
    },
  },
});
