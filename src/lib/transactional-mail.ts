/**
 * Transactional OTP / reset mail: Resend → SendGrid → Titan SMTP.
 *
 * Sign-in codes go out as noreply@send.kidease.ca through Resend.
 * Apex @kidease.ca is never a Resend From (its SPF is Titan-only).
 * A rejected send host falls through to Titan SMTP, which stays on kyle@.
 * Reply-To stays kyle@.
 *
 * No Start / DB. Tests inject fetch + Titan.
 */

import { KIDEASE_OPERATOR_EMAIL, normalizeEmail } from "./admin-email.ts";
import { resendCampaignTags } from "./email-suppressions.ts";
import {
  DEFAULT_TRANSACTIONAL_MAIL_FROM,
  isApexKidEaseFrom,
  transactionalMailFrom,
} from "./mail-from.ts";
import { SUPPORT_INBOX_EMAIL } from "./support.ts";
import { mailboxAddress, titanAppPassword } from "./server/titan-mail.ts";
import { parseQaAllowlist } from "./qa-send.ts";
import { outboundGates } from "./outbound-gate-core.ts";

export const MAIL_FROM_RESEND_ENV = "MAIL_FROM_RESEND";
/** Apex From Resend will accept today (kidease.ca is verified). */
export const EMERGENCY_RESEND_MAIL_FROM = `KidEase <${KIDEASE_OPERATOR_EMAIL}>`;

export type TransactionalMailPurpose =
  | "2fa"
  | "password_reset"
  | "claim"
  | "invite"
  | "verify_email"
  | "provider_onboard"
  | "waitlist_status"
  | "spot_offer"
  | "open_spots_checkin"
  | "customer_alert"
  | "area_waitlist"
  | "earnings_statement"
  | "parent_invoice"
  | "coparent"
  | "host_action";
export type TransactionalMailProvider = "resend" | "sendgrid" | "titan" | "logged";
export type TransactionalMailReason =
  | "domain_unverified"
  | "forbidden"
  | "unauthorized"
  | "rate_limited"
  | "upstream"
  | "network"
  | "not_configured"
  | "rejected"
  | "test_listing_suppressed"
  | "outbound_blocked"
  | "qa_allowlist_sent";

export type TransactionalMailEvent =
  | "resend_ok"
  | "resend_fail"
  | "resend_retry_apex"
  | "sendgrid_ok"
  | "sendgrid_fail"
  | "titan_ok"
  | "titan_fallback_success"
  | "titan_fail"
  | "all_failed"
  | "logged";

export type OtpMailHealth = {
  resendConfigured: boolean;
  sendgridConfigured: boolean;
  titanConfigured: boolean;
  lastEvent: TransactionalMailEvent | null;
  lastPurpose: TransactionalMailPurpose | null;
  lastReason: TransactionalMailReason | null;
  lastVia: TransactionalMailProvider | null;
};

export type TransactionalMailResult = {
  status: "sent" | "logged";
  via: TransactionalMailProvider;
  fallbackFrom?: "resend" | "sendgrid" | "titan";
  reason?: TransactionalMailReason;
};

export type TransactionalMailInput = {
  purpose: TransactionalMailPurpose;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  /** One-click unsubscribe URL (RFC 8058). Adds List-Unsubscribe headers. */
  unsubscribeUrl?: string;
  /** Structured branded content. Used instead of `html`/`text` when BRANDED_EMAILS=1. */
  branded?: import("./email-layout.ts").BrandedEmailInput;
  /** Set true when the email is about a test/QA listing. It is sent only when every recipient is on QA_SEND_ALLOWLIST. */
  aboutTestListing?: boolean;
  /**
   * A person the owner just typed, such as a staff invite.
   * Send it even when the centre name looks like a QA fixture.
   * Broadcasts about that centre stay suppressed.
   */
  directInvite?: boolean;
  /** Internal safety alerts. Counted toward the daily email cap but never blocked. */
  outboundEssential?: boolean;
};

/** Sign-in and account safety mail. Counted toward caps, never blocked by a switch or cap. */
export const ESSENTIAL_MAIL_PURPOSES: ReadonlySet<TransactionalMailPurpose> = new Set([
  "2fa",
  "password_reset",
  "verify_email",
]);

type OutboundEmailGateFn = (input: {
  to: string;
  subject: string;
  essential?: boolean;
  label?: string;
}) => Promise<{ allow: true; to: string; subject: string; testMode: boolean } | { allow: false; reason: string }>;

/** Same address list as qa-send-mail.ts. A star allows every recipient. An empty list allows none. */
export function testListingRecipientsAllowed(to: string, allowlistRaw: string | null | undefined): boolean {
  const recipients = [
    ...new Set(
      to
        .split(/[,;]+/)
        .map((part) => normalizeEmail(part))
        .filter((email) => email.includes("@")),
    ),
  ];
  if (!recipients.length) return false;
  const allow = new Set(parseQaAllowlist(allowlistRaw));
  if (allow.has("*")) return true;
  return recipients.every((email) => allow.has(email));
}

export function brandedEmailsEnabled(env: EnvMap = process.env): boolean {
  return env.BRANDED_EMAILS === "1" || env.BRANDED_EMAILS === "true";
}

/** Branded body + List-Unsubscribe headers when the flag is on; otherwise unchanged. */
export async function prepareMailBody(
  input: TransactionalMailInput,
  env: EnvMap = process.env,
): Promise<{ text: string; html: string; headers: Record<string, string> }> {
  const headers: Record<string, string> = {};
  let { text, html } = input;
  if (brandedEmailsEnabled(env)) {
    if (input.unsubscribeUrl) {
      headers["List-Unsubscribe"] = `<${input.unsubscribeUrl}>, <mailto:unsubscribe@kidease.ca?subject=unsubscribe>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }
    if (input.branded) {
      const { renderBrandedEmail, renderBrandedText } = await import("./email-layout.ts");
      const b = { ...input.branded, unsubscribeUrl: input.branded.unsubscribeUrl ?? input.unsubscribeUrl };
      html = renderBrandedEmail(b);
      text = renderBrandedText(b);
    }
  }
  return { text, html, headers };
}

export type EnvMap = Record<string, string | undefined>;

export type SendTitanMail = (input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) => Promise<{ ok: true; via: "titan" }>;

export type TransactionalMailDeps = {
  /** Outbound safety gate. Defaults to the one src/lib/server/outbound-gate.ts registers. */
  gate?: OutboundEmailGateFn | null;
  fetch?: typeof fetch;
  sendTitan?: SendTitanMail;
  env?: EnvMap;
  log?: (line: string) => void;
  nowMs?: number;
};

let lastHealth: OtpMailHealth = {
  resendConfigured: false,
  sendgridConfigured: false,
  titanConfigured: false,
  lastEvent: null,
  lastPurpose: null,
  lastReason: null,
  lastVia: null,
};

export function readOtpMailHealth(): OtpMailHealth {
  return { ...lastHealth };
}

export function resetOtpMailHealth(): void {
  lastHealth = {
    resendConfigured: false,
    sendgridConfigured: false,
    titanConfigured: false,
    lastEvent: null,
    lastPurpose: null,
    lastReason: null,
    lastVia: null,
  };
}

export function otpProvidersFromEnv(env: EnvMap = process.env): Pick<
  OtpMailHealth,
  "resendConfigured" | "sendgridConfigured" | "titanConfigured"
> {
  return {
    resendConfigured: Boolean(env.RESEND_API_KEY?.trim()),
    sendgridConfigured: Boolean(env.SENDGRID_API_KEY?.trim()),
    titanConfigured: Boolean(titanAppPassword(env)),
  };
}

export function transactionalMailConfigured(env: EnvMap = process.env): boolean {
  const providers = otpProvidersFromEnv(env);
  return providers.resendConfigured || providers.sendgridConfigured || providers.titanConfigured;
}

/** Never-remapped Resend From. Production can set this to kyle@ while send.kidease.ca is added. */
export function emergencyResendMailFrom(env: EnvMap = process.env): string | null {
  const explicit = (env[MAIL_FROM_RESEND_ENV] || "").trim();
  if (explicit) return explicit;
  const mailFrom = (env.MAIL_FROM || "").trim();
  if (mailFrom && isApexKidEaseFrom(mailFrom)) return mailFrom;
  return null;
}

/**
 * Resend From for sign-in codes. Always the send subdomain.
 * Apex @kidease.ca is Titan-only. Sending it through Resend fails SPF and lands in spam.
 * A rejected send host falls through to Titan SMTP, which stays on the kyle@ mailbox.
 */
export function otpResendFromCandidates(env: EnvMap = process.env): string[] {
  const preferred = transactionalMailFrom(env.MAIL_FROM);
  if (!preferred || isApexKidEaseFrom(preferred)) return [DEFAULT_TRANSACTIONAL_MAIL_FROM];
  return [preferred];
}

export function titanSmtpFrom(env: EnvMap = process.env): string {
  return `KidEase <${mailboxAddress(env)}>`;
}

export function isOperatorMailbox(to: string, env: EnvMap = process.env): boolean {
  const email = normalizeEmail(to);
  if (!email) return false;
  if (email === KIDEASE_OPERATOR_EMAIL) return true;
  return email === normalizeEmail(mailboxAddress(env));
}

export function titanFallbackAllowed(input: {
  to: string;
  titanConfigured: boolean;
  resendUnhealthy: boolean;
  env?: EnvMap;
}): boolean {
  if (!input.titanConfigured) return false;
  if (input.resendUnhealthy) return true;
  return isOperatorMailbox(input.to, input.env);
}

export function classifyMailFailure(status: number, body = ""): TransactionalMailReason {
  const raw = body.toLowerCase();
  const unverified =
    raw.includes("not verified") ||
    raw.includes("unverified") ||
    (raw.includes("domain") && (raw.includes("not found") || raw.includes("invalid") || raw.includes("verify")));
  if (unverified || (status === 403 && raw.includes("domain"))) return "domain_unverified";
  if (status === 401) return "unauthorized";
  if (status === 429) return "rate_limited";
  if (status === 403) return "forbidden";
  if (status >= 500) return "upstream";
  if (status <= 0) return "network";
  return "rejected";
}

export function shouldFallbackAfterResend(reason: TransactionalMailReason): boolean {
  return (
    reason === "domain_unverified" ||
    reason === "forbidden" ||
    reason === "unauthorized" ||
    reason === "rate_limited" ||
    reason === "upstream" ||
    reason === "network" ||
    reason === "rejected"
  );
}

export function formatTransactionalMailLog(input: {
  purpose: TransactionalMailPurpose;
  event: TransactionalMailEvent;
  reason?: TransactionalMailReason | null;
  via?: TransactionalMailProvider | null;
  status?: number | null;
}): string {
  const parts = [`[kidease-mail] purpose=${input.purpose}`, `event=${input.event}`];
  if (input.via) parts.push(`via=${input.via}`);
  if (input.reason) parts.push(`reason=${input.reason}`);
  if (typeof input.status === "number" && input.status > 0) parts.push(`status=${input.status}`);
  return parts.join(" ");
}

export function recordOtpMailHealth(next: Partial<OtpMailHealth> & { lastEvent: TransactionalMailEvent }): OtpMailHealth {
  lastHealth = {
    ...lastHealth,
    ...next,
    lastEvent: next.lastEvent,
  };
  return readOtpMailHealth();
}

export function parseFromParts(header: string, fallbackEmail: string): { email: string; name: string } {
  const match = header.match(/^(.*)<([^>]+)>\s*$/);
  if (match) {
    return {
      name: match[1].replace(/"/g, "").trim() || "KidEase",
      email: match[2].trim() || fallbackEmail,
    };
  }
  return { name: "KidEase", email: header.trim() || fallbackEmail };
}

export function friendlyTransactionalMailError(error: unknown, kind: "otp" | "reset" = "otp"): string {
  const raw = (error instanceof Error ? error.message : String(error || "")).toLowerCase();
  const support = SUPPORT_INBOX_EMAIL;
  if (kind === "reset") {
    if (raw.includes("not configured")) {
      return `We can’t email a reset link until mail is configured (RESEND_API_KEY, SENDGRID_API_KEY, or TITAN_APP_PASSWORD). Or email ${support}.`;
    }
    return `The reset email could not be sent. Try again in a few minutes, or email ${support}. We did not treat this as sent.`;
  }
  if (raw.includes("not configured")) {
    return `Email is not configured, so we could not send a new code. Email ${support} if you need a sign-in.`;
  }
  return `We could not send a new code. Try again in a moment, or email ${support}. We did not treat this as sent.`;
}

function emit(
  deps: TransactionalMailDeps,
  purpose: TransactionalMailPurpose,
  event: TransactionalMailEvent,
  extra: { reason?: TransactionalMailReason; via?: TransactionalMailProvider; status?: number } = {},
) {
  const providers = otpProvidersFromEnv(deps.env);
  recordOtpMailHealth({
    ...providers,
    lastEvent: event,
    lastPurpose: purpose,
    lastReason: extra.reason ?? null,
    lastVia: extra.via ?? null,
  });
  const line = formatTransactionalMailLog({ purpose, event, ...extra });
  (deps.log ?? console.info)(line);
}

async function postJson(
  fetchFn: typeof fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<{ ok: boolean; status: number; text: string; json: unknown }> {
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, text, json };
  } catch {
    return { ok: false, status: 0, text: "", json: null };
  }
}

async function defaultSendTitan(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ ok: true; via: "titan" }> {
  const titanFile = "./server/" + "titan-mail.server.ts";
  const { sendTitanMail } = await import(/* @vite-ignore */ titanFile);
  const sent = await sendTitanMail(input);
  return { ok: true, via: sent.via };
}

/**
 * Sign-in and account codes go Titan SMTP first, From kyle@kidease.ca,
 * when TITAN_APP_PASSWORD is set. A missing password or a Titan error
 * falls through to Resend, then SendGrid. Other mail stays Resend first.
 */
export async function sendTransactionalMail(
  input: TransactionalMailInput,
  deps: TransactionalMailDeps = {},
): Promise<TransactionalMailResult> {
  (globalThis as { __kideaseViewAsSideEffect__?: (action: "email") => void }).__kideaseViewAsSideEffect__?.("email");
  const env = deps.env ?? process.env;
  const fetchFn = deps.fetch ?? fetch;
  let to = normalizeEmail(input.to);
  const replyTo = (input.replyTo || env.ADMIN_EMAIL || KIDEASE_OPERATOR_EMAIL).trim() || KIDEASE_OPERATOR_EMAIL;
  const providers = otpProvidersFromEnv(env);
  recordOtpMailHealth({ ...providers, lastEvent: lastHealth.lastEvent ?? "logged" });
  const blob = `${input.subject}\n${input.text || ""}`;
  const aboutTestListing =
    !input.directInvite &&
    (input.aboutTestListing === true ||
      /[([]\s*(qa|test)\s*[)\]]/i.test(blob) ||
      /\bkidease\s+test\b/i.test(blob));
  const qaAllowlistSend = aboutTestListing && testListingRecipientsAllowed(to, env.QA_SEND_ALLOWLIST);
  if (aboutTestListing && !qaAllowlistSend) {
    emit(deps, input.purpose, "logged", { via: "logged", reason: "test_listing_suppressed" });
    return { status: "logged", via: "logged", reason: "test_listing_suppressed" };
  }
  const sentReason = (reason?: TransactionalMailReason): TransactionalMailReason | undefined =>
    qaAllowlistSend ? "qa_allowlist_sent" : reason;
  const gate = deps.gate === undefined ? (outboundGates().email as OutboundEmailGateFn | undefined) : deps.gate;
  if (gate) {
    const g = await gate({
      to,
      subject: input.subject,
      essential: input.outboundEssential === true || ESSENTIAL_MAIL_PURPOSES.has(input.purpose),
      label: `txn-${input.purpose}`,
    });
    if (!g.allow) {
      emit(deps, input.purpose, "logged", { via: "logged", reason: "outbound_blocked" });
      return { status: "logged", via: "logged", reason: "outbound_blocked" };
    }
    to = normalizeEmail(g.to);
    input = { ...input, subject: g.subject };
  }
  const body = await prepareMailBody(input, env);
  input = { ...input, text: body.text, html: body.html };

  let resendUnhealthy = !providers.resendConfigured;
  let lastReason: TransactionalMailReason | undefined;
  let titanTried = false;
  const codeFirst = ESSENTIAL_MAIL_PURPOSES.has(input.purpose);

  async function sendViaTitan(reason?: TransactionalMailReason): Promise<TransactionalMailResult | null> {
    if (!providers.titanConfigured || titanTried) return null;
    titanTried = true;
    try {
      const sendTitan = deps.sendTitan ?? defaultSendTitan;
      await sendTitan({
        to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
      const event = codeFirst ? "titan_ok" : "titan_fallback_success";
      emit(deps, input.purpose, event, { via: "titan", reason: sentReason(reason) });
      return {
        status: "sent",
        via: "titan",
        fallbackFrom: codeFirst ? undefined : providers.resendConfigured ? "resend" : providers.sendgridConfigured ? "sendgrid" : undefined,
        reason: sentReason(reason),
      };
    } catch {
      lastReason = lastReason ?? "rejected";
      emit(deps, input.purpose, "titan_fail", { reason: lastReason, via: "titan" });
      return null;
    }
  }

  if (codeFirst) {
    const titanFirst = await sendViaTitan();
    if (titanFirst) return titanFirst;
  }

  const resendKey = env.RESEND_API_KEY?.trim();
  if (resendKey) {
    const candidates = otpResendFromCandidates(env);
    for (let i = 0; i < candidates.length; i += 1) {
      const from = candidates[i] ?? DEFAULT_TRANSACTIONAL_MAIL_FROM;
      const result = await postJson(
        fetchFn,
        "https://api.resend.com/emails",
        { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        {
          from,
          to: [to],
          reply_to: replyTo,
          subject: input.subject,
          text: input.text,
          html: input.html,
          ...(Object.keys(body.headers).length ? { headers: body.headers } : {}),
          tags: resendCampaignTags(`txn-${input.purpose}`),
        },
      );
      if (result.ok) {
        emit(deps, input.purpose, i === 0 ? "resend_ok" : "resend_retry_apex", {
          via: "resend",
          reason: sentReason(),
        });
        return {
          status: "sent",
          via: "resend",
          fallbackFrom: titanTried ? "titan" : undefined,
          reason: sentReason(),
        };
      }
      lastReason = classifyMailFailure(result.status, result.text);
      emit(deps, input.purpose, "resend_fail", { reason: lastReason, via: "resend", status: result.status });
      resendUnhealthy = true;
      if (!shouldFallbackAfterResend(lastReason)) break;
    }
  }

  const sendgridKey = env.SENDGRID_API_KEY?.trim();
  if (sendgridKey) {
    const from = transactionalMailFrom(env.MAIL_FROM);
    const parts = parseFromParts(from, replyTo);
    const result = await postJson(
      fetchFn,
      "https://api.sendgrid.com/v3/mail/send",
      { Authorization: `Bearer ${sendgridKey}`, "Content-Type": "application/json" },
      {
        personalizations: [{ to: [{ email: to }] }],
        from: { email: parts.email, name: parts.name },
        reply_to: { email: replyTo },
        subject: input.subject,
        ...(Object.keys(body.headers).length ? { headers: body.headers } : {}),
        content: [
          { type: "text/plain", value: input.text },
          { type: "text/html", value: input.html },
        ],
      },
    );
    if (result.ok) {
      emit(deps, input.purpose, "sendgrid_ok", {
        via: "sendgrid",
        reason: sentReason(lastReason),
      });
      return {
        status: "sent",
        via: "sendgrid",
        fallbackFrom: titanTried ? "titan" : providers.resendConfigured ? "resend" : undefined,
        reason: sentReason(lastReason),
      };
    }
    lastReason = classifyMailFailure(result.status, result.text);
    emit(deps, input.purpose, "sendgrid_fail", { reason: lastReason, via: "sendgrid", status: result.status });
  }

  if (
    !codeFirst &&
    titanFallbackAllowed({
      to,
      titanConfigured: providers.titanConfigured,
      resendUnhealthy,
      env,
    })
  ) {
    const titanLater = await sendViaTitan(lastReason ?? (resendUnhealthy ? "domain_unverified" : undefined));
    if (titanLater) return titanLater;
  }

  if (!providers.resendConfigured && !providers.sendgridConfigured && !providers.titanConfigured) {
    if (env.VERCEL_ENV === "production") {
      emit(deps, input.purpose, "all_failed", { reason: "not_configured" });
      throw new Error("Email is not configured");
    }
    emit(deps, input.purpose, "logged", { via: "logged", reason: "not_configured" });
    return { status: "logged", via: "logged", reason: "not_configured" };
  }

  emit(deps, input.purpose, "all_failed", { reason: lastReason ?? "not_configured" });
  throw new Error("Email could not be sent");
}
