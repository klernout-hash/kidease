import { createFileRoute } from "@tanstack/react-router";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";
import {
  parseTwilioForm,
  publicRequestUrl,
  summarizeSmsStatus,
  TwilioSignatureError,
  validateTwilioSignature,
} from "@/lib/server/sms-status";

/**
 * Thin Twilio StatusCallback sink.
 * Fail closed: missing TWILIO_AUTH_TOKEN or bad X-Twilio-Signature → 401.
 * Does not persist delivery rows. Set TWILIO_STATUS_CALLBACK_URL to this
 * HTTPS path on Production + Preview (and on the Messaging Service).
 */
async function run(request: Request) {
  const raw = await request.text();
  const token = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const ip = requestIp(request);
  const params = parseTwilioForm(raw);
  const url = publicRequestUrl(request, process.env.TWILIO_STATUS_CALLBACK_URL);
  const sig = request.headers.get("x-twilio-signature") || "";

  if (!token) {
    await logSecurityEvent({ kind: "webhook_reject", detail: "twilio auth token missing", ip });
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    if (!validateTwilioSignature(token, sig, url, params)) {
      await logSecurityEvent({ kind: "webhook_reject", detail: "twilio signature", ip });
      return new Response("Unauthorized", { status: 401 });
    }
  } catch (err) {
    const reason = err instanceof TwilioSignatureError ? err.message : "twilio verify failed";
    await logSecurityEvent({ kind: "webhook_reject", detail: reason, ip });
    return new Response("Unauthorized", { status: 401 });
  }

  const summary = summarizeSmsStatus(params);
  console.info("[kidease-sms]", {
    event: "status",
    sid: summary.messageSid ? `${summary.messageSid.slice(0, 2)}…` : null,
    status: summary.messageStatus,
  });
  await logSecurityEvent({
    kind: "webhook_accept",
    detail: `twilio ${summary.messageStatus || "status"}`,
    ip,
  });
  return new Response(null, { status: 204 });
}

export const Route = createFileRoute("/api/sms/status")({
  server: {
    handlers: {
      GET: () => new Response("Method Not Allowed", { status: 405 }),
      POST: ({ request }) => run(request),
    },
  },
});
