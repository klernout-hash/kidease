import { createFileRoute } from "@tanstack/react-router";
import { capReachedTwiml, clientDialTwiml, userIdFromVoiceIdentity, voiceStatusCallbackUrl } from "@/lib/voice";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";
import { authorizeTwilioPost, publicRequestUrl } from "@/lib/server/sms-status";
import { identitiesForClientCall } from "@/lib/server/voice-routing";

/**
 * TwiML App voice URL for browser calls.
 * Dials the other party's Twilio client. Never a phone number.
 * The daily media cap is reserved here, once per placed call (not per token
 * mint), and settled to real minutes by /api/voice/status.
 */
async function run(request: Request) {
  const ip = requestIp(request);
  const auth = await authorizeTwilioPost(request, process.env.TWILIO_VOICE_CONNECT_URL);
  if (!auth.ok) {
    await logSecurityEvent({ kind: "webhook_reject", detail: "twilio voice connect", ip });
    return auth.response;
  }
  const { voiceCallsEnabled } = await import("@/lib/features");
  if (!voiceCallsEnabled()) {
    return new Response(clientDialTwiml([]), { status: 200, headers: { "Content-Type": "text/xml" } });
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
  const conversationId = auth.params.conversationId || auth.params.ConversationId || "";
  const xml = { status: 200, headers: { "Content-Type": "text/xml" } };
  if (!identities.length) return new Response(clientDialTwiml([]), xml);
  const callSid = String(auth.params.CallSid || "").trim();
  const { voiceReservationExists, recordMediaReservation } = await import("@/lib/server/media-usage");
  if (!(callSid && (await voiceReservationExists(callSid)))) {
    const { gateMediaSession } = await import("@/lib/server/outbound-gate");
    const gate = await gateMediaSession("voice");
    if (!gate.ok) return new Response(capReachedTwiml(), xml);
    if (callSid) {
      await recordMediaReservation({
        id: `ms_voice_${callSid}`,
        kind: "voice",
        twilioSid: callSid,
        identity: auth.params.From || auth.params.Caller || null,
        conversationId: conversationId || null,
        userId: userIdFromVoiceIdentity(auth.params.From || auth.params.Caller || "")?.userId ?? null,
        usageDay: gate.day,
        reservedMinutes: gate.units,
      });
    }
  }
  const actionUrl = voiceStatusCallbackUrl(process.env, new URL(publicRequestUrl(request)).origin);
  return new Response(clientDialTwiml(identities, conversationId, { actionUrl }), {
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
