import { createFileRoute } from "@tanstack/react-router";
import { applyInboundSms } from "@/lib/server/casl-consent";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";
import { normalizeCaslPhone, parseInboundOptOut } from "@/lib/casl";
import {
  parseTwilioForm,
  publicRequestUrl,
  TwilioSignatureError,
  validateTwilioSignature,
} from "@/lib/server/sms-status";

/**
 * Twilio inbound SMS (STOP / ARRÊT / START).
 * Messaging Service Advanced Opt-Out still applies at the carrier.
 * This persists the withdrawal so FEATURE_SMS cannot text that mobile later.
 */
async function run(request: Request) {
  const raw = await request.text();
  const token = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const ip = requestIp(request);
  const params = parseTwilioForm(raw);
  const url = publicRequestUrl(request, process.env.TWILIO_INBOUND_CALLBACK_URL);
  const sig = request.headers.get("x-twilio-signature") || "";

  if (!token) {
    await logSecurityEvent({ kind: "webhook_reject", detail: "twilio inbound token missing", ip });
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    if (!validateTwilioSignature(token, sig, url, params)) {
      await logSecurityEvent({ kind: "webhook_reject", detail: "twilio inbound signature", ip });
      return new Response("Unauthorized", { status: 401 });
    }
  } catch (err) {
    const reason = err instanceof TwilioSignatureError ? err.message : "twilio verify failed";
    await logSecurityEvent({ kind: "webhook_reject", detail: reason, ip });
    return new Response("Unauthorized", { status: 401 });
  }

  const from = normalizeCaslPhone(params.From || params.from);
  const opt = parseInboundOptOut(params);
  if (from && opt) {
    await applyInboundSms({
      from,
      opt,
      ip,
      userAgent: request.headers.get("user-agent"),
    });
  }
  console.info("[kidease-sms]", { event: "inbound", opt, hasFrom: Boolean(from) });
  await logSecurityEvent({
    kind: "webhook_accept",
    detail: `twilio inbound ${opt || "other"}`,
    ip,
  });
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    { status: 200, headers: { "Content-Type": "text/xml" } },
  );
}

export const Route = createFileRoute("/api/sms/inbound")({
  server: {
    handlers: {
      GET: () => new Response("Method Not Allowed", { status: 405 }),
      POST: ({ request }) => run(request),
    },
  },
});
