import { createFileRoute } from "@tanstack/react-router";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";
import { authorizeTwilioPost } from "@/lib/server/sms-status";
import { recordVoiceRecording } from "@/lib/server/voice-routing";

/** Stores the recording SID only. The media URL stays in Twilio. */
async function run(request: Request) {
  const ip = requestIp(request);
  const auth = await authorizeTwilioPost(request, process.env.TWILIO_VOICE_RECORDING_URL);
  if (!auth.ok) {
    await logSecurityEvent({ kind: "webhook_reject", detail: "twilio voice recording", ip });
    return auth.response;
  }
  try {
    await recordVoiceRecording({
      recordingSid: auth.params.RecordingSid || "",
      callSid: (auth.params.CallSid || "").trim() || null,
    });
  } catch {
    console.error("[kidease-voice] recording persist failed");
    return new Response("Unavailable", { status: 503 });
  }
  await logSecurityEvent({ kind: "webhook_accept", detail: "twilio voice recording", ip });
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute("/api/voice/recording")({
  server: {
    handlers: {
      GET: () => new Response("Method Not Allowed", { status: 405 }),
      POST: ({ request }) => run(request),
    },
  },
});
