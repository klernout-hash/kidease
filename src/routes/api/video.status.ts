import { createFileRoute } from "@tanstack/react-router";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";
import { authorizeTwilioPost } from "@/lib/server/sms-status";

/**
 * Twilio Video room StatusCallback (signed with TWILIO_AUTH_TOKEN).
 * participant-disconnected settles that join to its real minutes;
 * room-ended settles any join that never reported. Other events are ignored.
 */
async function run(request: Request) {
  const ip = requestIp(request);
  const auth = await authorizeTwilioPost(request, process.env.TWILIO_VIDEO_STATUS_CALLBACK_URL);
  if (!auth.ok) {
    await logSecurityEvent({ kind: "webhook_reject", detail: "twilio video status", ip });
    return auth.response;
  }
  const event = (auth.params.StatusCallbackEvent || "").trim();
  const roomSid = (auth.params.RoomSid || "").trim();
  const usage = await import("@/lib/server/media-usage");
  if (event === "participant-disconnected" && roomSid) {
    await usage.settleVideoParticipant({
      roomSid,
      identity: (auth.params.ParticipantIdentity || "").trim(),
      participantSid: (auth.params.ParticipantSid || "").trim(),
      durationSeconds: auth.params.ParticipantDuration,
    });
  } else if (event === "room-ended" && roomSid) {
    await usage.settleVideoRoom({ roomSid, durationSeconds: auth.params.RoomDuration });
  }
  await logSecurityEvent({ kind: "webhook_accept", detail: `twilio video ${event || "status"}`.slice(0, 80), ip });
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute("/api/video/status")({
  server: {
    handlers: {
      GET: () => new Response("Method Not Allowed", { status: 405 }),
      POST: ({ request }) => run(request),
    },
  },
});
