import { createFileRoute } from "@tanstack/react-router";
import { incomingVoiceTwiml, voiceRecordingCallbackUrl } from "@/lib/voice";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";
import { authorizeTwilioPost } from "@/lib/server/sms-status";
import { identitiesForIncomingCaller } from "@/lib/server/voice-routing";

/**
 * Toll-free voice webhook. Greeting names KidEase, then rings the daycare
 * in the app or takes a voicemail. Personal numbers are not spoken or forwarded.
 */
async function run(request: Request) {
  const ip = requestIp(request);
  const auth = await authorizeTwilioPost(request, process.env.TWILIO_VOICE_INCOMING_URL);
  if (!auth.ok) {
    await logSecurityEvent({ kind: "webhook_reject", detail: "twilio voice incoming", ip });
    return auth.response;
  }
  const identities = await identitiesForIncomingCaller(auth.params.From || auth.params.from || "").catch(
    () => [] as string[],
  );
  const origin = process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://www.kidease.ca";
  const xml = incomingVoiceTwiml({
    identities,
    recordingCallback: voiceRecordingCallbackUrl(process.env, origin),
  });
  await logSecurityEvent({
    kind: "webhook_accept",
    detail: identities.length ? "twilio voice dial" : "twilio voice voicemail",
    ip,
  });
  return new Response(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
}

export const Route = createFileRoute("/api/voice/incoming")({
  server: {
    handlers: {
      GET: () => new Response("Method Not Allowed", { status: 405 }),
      POST: ({ request }) => run(request),
    },
  },
});
