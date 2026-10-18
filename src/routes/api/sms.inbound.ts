import { createFileRoute } from "@tanstack/react-router";
import { applyInboundSms } from "@/lib/server/casl-consent";
import { logSecurityEvent, requestIp } from "@/lib/server/security-events";
import { normalizeCaslPhone, parseInboundOptOut } from "@/lib/casl";
import { inboundKeywordTwiml, inboundSmsChatDecision } from "@/lib/sms-copy";
import { upsertSmsDelivery } from "@/lib/server/sms-log";
import {
  parseTwilioForm,
  publicRequestUrl,
  smsDeliveryRecord,
  TwilioSignatureError,
  twilioSignatureMatches,
} from "@/lib/server/sms-status";

/**
 * Twilio inbound SMS. This route never writes a conversations/messages row.
 * Keyword replies (HELP / STOP / START) are sent by Advanced Opt-Out when that
 * is on. We answer in TwiML only when OptOutType is absent, so the person
 * does not get two texts. A non-keyword body is stored as a delivery row
 * without the text, then we return empty TwiML.
 */
async function run(request: Request) {
  const raw = await request.text();
  const ip = requestIp(request);
  const params = parseTwilioForm(raw);
  const url = publicRequestUrl(request, process.env.TWILIO_INBOUND_CALLBACK_URL);
  const sig = request.headers.get("x-twilio-signature") || "";
  const chat = inboundSmsChatDecision(params.Body || params.body || "");
  if (chat.insertIntoThread || chat.persistBody) {
    return new Response("Unavailable", { status: 500 });
  }

  try {
    if (!twilioSignatureMatches(sig, url, params)) {
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
  if (from && (opt === "stop" || opt === "start")) {
    await applyInboundSms({
      from,
      opt,
      ip,
      userAgent: request.headers.get("user-agent"),
    });
  }
  await upsertSmsDelivery(smsDeliveryRecord(params, opt)).catch(() => undefined);
  console.info("[kidease-sms]", { event: "inbound", opt, hasFrom: Boolean(from) });
  await logSecurityEvent({
    kind: "webhook_accept",
    detail: `twilio inbound ${opt || "other"}`,
    ip,
  });
  return new Response(inboundKeywordTwiml(params, opt), {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export const Route = createFileRoute("/api/sms/inbound")({
  server: {
    handlers: {
      GET: () => new Response("Method Not Allowed", { status: 405 }),
      POST: ({ request }) => run(request),
    },
  },
});
