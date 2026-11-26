import { createFileRoute } from "@tanstack/react-router";
import { dialActionTwiml } from "@/lib/voice";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";
import { authorizeTwilioPost } from "@/lib/server/sms-status";

/**
 * <Dial action> for in-app calls. Twilio posts here (signed) when the dial
 * ends, with DialCallStatus and DialCallDuration. Settles the daily media
 * cap to real minutes, then hangs up. Never dials anything.
 */
async function run(request: Request) {
  const ip = requestIp(request);
  const auth = await authorizeTwilioPost(request, process.env.TWILIO_VOICE_STATUS_URL);
  const xml = { status: 200, headers: { "Content-Type": "text/xml" } };
  if (!auth.ok) {
    await logSecurityEvent({ kind: "webhook_reject", detail: "twilio voice status", ip });
    return auth.response;
  }
  const dialStatus = auth.params.DialCallStatus || "";
  const callSid = (auth.params.CallSid || "").trim();
  if (callSid) {
    const { settleVoiceCall } = await import("@/lib/server/media-usage");
    await settleVoiceCall({ callSid, dialStatus, dialDurationSeconds: auth.params.DialCallDuration });
  }
  await logSecurityEvent({ kind: "webhook_accept", detail: "twilio voice status", ip });
  return new Response(dialActionTwiml(dialStatus), xml);
}

export const Route = createFileRoute("/api/voice/status")({
  server: {
    handlers: {
      GET: () => new Response("Method Not Allowed", { status: 405 }),
      POST: ({ request }) => run(request),
    },
  },
});
