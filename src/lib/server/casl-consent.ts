import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import {
  CASL_ADDRESS_BLOCKED_MESSAGE,
  CASL_NO_CONSENT_MESSAGE,
  CASL_SENDER,
  CASL_UNSUB_TTL_MS,
  caslStatement,
  decideCaslSend,
  emptyConsent,
  isCaslChannel,
  isCaslMethod,
  isCaslPurpose,
  normalizeCaslAddress,
  statementKeyFor,
  type CaslAction,
  type CaslBlockPurpose,
  type CaslChannel,
  type CaslConsentState,
  type CaslLocale,
  type CaslMethod,
  type CaslPrefs,
  type CaslPurpose,
} from "@/lib/casl";
import { signCaslUnsubToken, verifyCaslUnsubToken } from "@/lib/casl-token";

export {
  CASL_ADDRESS_BLOCKED_MESSAGE,
  CASL_NO_CONSENT_MESSAGE,
  CASL_SENDER,
  caslStatement,
  statementKeyFor,
};

type ConsentRow = {
  user_id: string;
  channel: string;
  purpose: string;
  granted: number | boolean;
  granted_at: string | Date | null;
  withdrawn_at: string | Date | null;
  method: string | null;
  statement: string | null;
  address: string | null;
  updated_at: string | Date | null;
};

function iso(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value) || null;
}

function mapConsent(row: ConsentRow | undefined, channel: CaslChannel, purpose: CaslPurpose): CaslConsentState {
  if (!row) return emptyConsent(channel, purpose);
  return {
    channel,
    purpose,
    granted: row.granted === 1 || row.granted === true,
    grantedAt: iso(row.granted_at),
    withdrawnAt: iso(row.withdrawn_at),
    method: row.method,
    statement: row.statement,
    address: row.address,
    updatedAt: iso(row.updated_at),
  };
}

function unsubSecret() {
  return (process.env.BETTER_AUTH_SECRET || "").trim();
}

function appOrigin() {
  return (process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://www.kidease.ca").replace(/\/$/, "");
}

export function caslUnsubscribeUrl(input: {
  userId?: string;
  channel: CaslChannel;
  purpose: CaslPurpose | "all";
  address?: string;
  secret?: string;
  nowMs?: number;
}): string | null {
  const secret = input.secret ?? unsubSecret();
  if (!secret) return `${appOrigin()}${CASL_SENDER.unsubscribePath}`;
  const token = signCaslUnsubToken(
    {
      userId: input.userId,
      channel: input.channel,
      purpose: input.purpose,
      address: input.address,
      exp: (input.nowMs ?? Date.now()) + CASL_UNSUB_TTL_MS,
    },
    secret,
  );
  return `${appOrigin()}${CASL_SENDER.unsubscribePath}?token=${encodeURIComponent(token)}`;
}

export function caslOneClickUrl(input: Parameters<typeof caslUnsubscribeUrl>[0]): string | null {
  const page = caslUnsubscribeUrl(input);
  if (!page) return null;
  return page.replace(CASL_SENDER.unsubscribePath, "/api/unsubscribe");
}

export async function readConsent(
  userId: string,
  channel: CaslChannel,
  purpose: CaslPurpose,
): Promise<CaslConsentState> {
  const sql = await getSql();
  const rows = await sql<ConsentRow>`
    select user_id, channel, purpose, granted, granted_at, withdrawn_at, method, statement, address, updated_at
    from casl_consents
    where user_id = ${userId} and channel = ${channel} and purpose = ${purpose}
    limit 1
  `.catch(() => [] as ConsentRow[]);
  return mapConsent(rows[0], channel, purpose);
}

export async function listConsents(userId: string): Promise<CaslPrefs & { rows: CaslConsentState[] }> {
  const sql = await getSql();
  const rows = await sql<ConsentRow>`
    select user_id, channel, purpose, granted, granted_at, withdrawn_at, method, statement, address, updated_at
    from casl_consents
    where user_id = ${userId}
  `.catch(() => [] as ConsentRow[]);
  const mapped = rows.map((row) =>
    mapConsent(row, isCaslChannel(row.channel) ? row.channel : "email", isCaslPurpose(row.purpose) ? row.purpose : "service"),
  );
  return {
    smsService: mapped.some((r) => r.channel === "sms" && r.purpose === "service" && r.granted),
    emailService: mapped.some((r) => r.channel === "email" && r.purpose === "service" && r.granted),
    emailCommercial: mapped.some((r) => r.channel === "email" && r.purpose === "commercial" && r.granted),
    rows: mapped,
  };
}

export async function isAddressBlocked(
  channel: CaslChannel,
  address: string,
  purpose: CaslPurpose,
): Promise<boolean> {
  const dest = normalizeCaslAddress(channel, address);
  if (!dest) return false;
  const sql = await getSql();
  const rows = await sql<{ n: number }>`
    select 1 as n from casl_address_blocks
    where channel = ${channel}
      and address = ${dest}
      and purpose in (${purpose}, 'all')
    limit 1
  `.catch(() => [] as { n: number }[]);
  return Boolean(rows[0]);
}

export async function evaluateCaslSend(input: {
  userId?: string | null;
  channel: CaslChannel;
  purpose: CaslPurpose;
  address?: string | null;
}): Promise<{ ok: true } | { ok: false; skipped: true; error: string }> {
  const dest = normalizeCaslAddress(input.channel, input.address);
  const blocked = dest ? await isAddressBlocked(input.channel, dest, input.purpose) : false;
  const granted = input.userId
    ? (await readConsent(input.userId, input.channel, input.purpose)).granted
    : false;
  const decision = decideCaslSend({ userGranted: granted, addressBlocked: blocked });
  if (!decision.ok) return { ok: false, skipped: true, error: decision.reason };
  return { ok: true };
}

export async function recordConsentEvent(input: {
  userId?: string | null;
  channel: CaslChannel;
  purpose: CaslPurpose;
  action: CaslAction;
  method: CaslMethod;
  statement?: string | null;
  address?: string | null;
  locale?: CaslLocale | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const sql = await getSql();
  const address = normalizeCaslAddress(input.channel, input.address) || input.address?.trim() || null;
  await sql`
    insert into casl_consent_events (
      id, user_id, channel, purpose, action, method, statement, address, locale, ip, user_agent
    ) values (
      ${nid("cse")},
      ${input.userId || null},
      ${input.channel},
      ${input.purpose},
      ${input.action},
      ${input.method},
      ${input.statement || null},
      ${address},
      ${input.locale || null},
      ${(input.ip || "").slice(0, 80) || null},
      ${(input.userAgent || "").slice(0, 240) || null}
    )
  `.catch(() => undefined);
}

export async function setConsent(input: {
  userId: string;
  channel: CaslChannel;
  purpose: CaslPurpose;
  granted: boolean;
  method: CaslMethod;
  statement?: string | null;
  address?: string | null;
  locale?: CaslLocale | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<CaslConsentState> {
  const sql = await getSql();
  const address = normalizeCaslAddress(input.channel, input.address) || null;
  const statement =
    input.statement ||
    caslStatement(input.locale === "fr" ? "fr" : "en", statementKeyFor(input.channel, input.purpose));
  if (input.granted) {
    await sql`
      insert into casl_consents (
        user_id, channel, purpose, granted, granted_at, withdrawn_at, method, statement, address, locale, updated_at
      ) values (
        ${input.userId}, ${input.channel}, ${input.purpose}, 1, now(), null,
        ${input.method}, ${statement}, ${address}, ${input.locale || "en"}, now()
      )
      on conflict (user_id, channel, purpose) do update set
        granted = 1,
        granted_at = now(),
        withdrawn_at = null,
        method = excluded.method,
        statement = excluded.statement,
        address = coalesce(excluded.address, casl_consents.address),
        locale = excluded.locale,
        updated_at = now()
    `.catch(() => undefined);
    if (address) {
      await sql`
        delete from casl_address_blocks
        where channel = ${input.channel}
          and address = ${address}
          and purpose in (${input.purpose}, 'all')
      `.catch(() => undefined);
    }
  } else {
    await sql`
      insert into casl_consents (
        user_id, channel, purpose, granted, granted_at, withdrawn_at, method, statement, address, locale, updated_at
      ) values (
        ${input.userId}, ${input.channel}, ${input.purpose}, 0, null, now(),
        ${input.method}, ${statement}, ${address}, ${input.locale || "en"}, now()
      )
      on conflict (user_id, channel, purpose) do update set
        granted = 0,
        withdrawn_at = now(),
        method = excluded.method,
        statement = excluded.statement,
        address = coalesce(excluded.address, casl_consents.address),
        locale = excluded.locale,
        updated_at = now()
    `.catch(() => undefined);
  }
  await recordConsentEvent({
    userId: input.userId,
    channel: input.channel,
    purpose: input.purpose,
    action: input.granted ? "grant" : "withdraw",
    method: input.method,
    statement,
    address,
    locale: input.locale,
    ip: input.ip,
    userAgent: input.userAgent,
  });
  return readConsent(input.userId, input.channel, input.purpose);
}

export async function setAddressBlock(input: {
  channel: CaslChannel;
  address: string;
  purpose: CaslBlockPurpose;
  method: CaslMethod;
  blocked: boolean;
}) {
  const dest = normalizeCaslAddress(input.channel, input.address);
  if (!dest) return;
  const sql = await getSql();
  if (input.blocked) {
    await sql`
      insert into casl_address_blocks (channel, address, purpose, blocked_at, method)
      values (${input.channel}, ${dest}, ${input.purpose}, now(), ${input.method})
      on conflict (channel, address, purpose) do update set
        blocked_at = now(),
        method = excluded.method
    `.catch(() => undefined);
  } else {
    await sql`
      delete from casl_address_blocks
      where channel = ${input.channel} and address = ${dest} and purpose = ${input.purpose}
    `.catch(() => undefined);
  }
}

export async function withdrawByAddress(input: {
  channel: CaslChannel;
  address: string;
  purpose?: CaslPurpose | "all";
  method: CaslMethod;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const dest = normalizeCaslAddress(input.channel, input.address);
  if (!dest) return { ok: false as const, error: "Need a valid email or mobile number." };
  const purposes: CaslPurpose[] =
    !input.purpose || input.purpose === "all" ? ["service", "commercial"] : [input.purpose];
  await setAddressBlock({
    channel: input.channel,
    address: dest,
    purpose: input.purpose === "service" || input.purpose === "commercial" ? input.purpose : "all",
    method: input.method,
    blocked: true,
  });
  const sql = await getSql();
  const byConsent = await sql<{ user_id: string }>`
    select user_id from casl_consents
    where channel = ${input.channel} and address = ${dest}
  `.catch(() => [] as { user_id: string }[]);
  const byProfile =
    input.channel === "sms"
      ? await sql<{ user_id: string; phone: string | null }>`
          select user_id, phone from profiles where phone is not null
        `.catch(() => [] as { user_id: string; phone: string | null }[])
      : [];
  const seen = new Set<string>();
  for (const row of byConsent) {
    if (row.user_id) seen.add(row.user_id);
  }
  for (const row of byProfile) {
    if (row.user_id && normalizeCaslAddress("sms", row.phone) === dest) seen.add(row.user_id);
  }
  for (const userId of seen) {
    for (const purpose of purposes) {
      await setConsent({
        userId,
        channel: input.channel,
        purpose,
        granted: false,
        method: input.method,
        address: dest,
        ip: input.ip,
        userAgent: input.userAgent,
      });
    }
  }
  if (!seen.size) {
    for (const purpose of purposes) {
      await recordConsentEvent({
        channel: input.channel,
        purpose,
        action: "withdraw",
        method: input.method,
        address: dest,
        ip: input.ip,
        userAgent: input.userAgent,
      });
    }
  }
  return { ok: true as const };
}

export async function applyInboundSms(input: {
  from: string;
  opt: "stop" | "start";
  ip?: string | null;
  userAgent?: string | null;
}) {
  const dest = normalizeCaslAddress("sms", input.from);
  if (!dest) return { ok: false as const };
  if (input.opt === "stop") {
    await withdrawByAddress({
      channel: "sms",
      address: dest,
      purpose: "all",
      method: "sms_stop",
      ip: input.ip,
      userAgent: input.userAgent,
    });
    return { ok: true as const, action: "stop" as const };
  }
  await setAddressBlock({
    channel: "sms",
    address: dest,
    purpose: "all",
    method: "sms_start",
    blocked: false,
  });
  return { ok: true as const, action: "start" as const };
}

export async function applyUnsubscribeToken(token: string, meta?: { ip?: string | null; userAgent?: string | null }) {
  const payload = verifyCaslUnsubToken(token, unsubSecret());
  if (!payload) return { ok: false as const, error: "This unsubscribe link is invalid or expired." };
  if (payload.userId) {
    const purposes: CaslPurpose[] = payload.purpose === "all" ? ["service", "commercial"] : [payload.purpose];
    for (const purpose of purposes) {
      await setConsent({
        userId: payload.userId,
        channel: payload.channel,
        purpose,
        granted: false,
        method: "email_unsub",
        address: payload.address,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      });
    }
    if (payload.address) {
      await setAddressBlock({
        channel: payload.channel,
        address: payload.address,
        purpose: payload.purpose === "all" ? "all" : payload.purpose,
        method: "email_unsub",
        blocked: true,
      });
    }
    return { ok: true as const };
  }
  if (payload.address) {
    return withdrawByAddress({
      channel: payload.channel,
      address: payload.address,
      purpose: payload.purpose,
      method: payload.channel === "sms" ? "sms_stop" : "email_unsub",
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });
  }
  return { ok: false as const, error: "This unsubscribe link is missing a recipient." };
}

export const getMyCaslConsents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => listConsents(context.userId));

export const saveMyCaslConsents = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    smsService?: boolean;
    emailService?: boolean;
    emailCommercial?: boolean;
    phone?: string;
    email?: string;
    locale?: string;
    method?: string;
  }) => ({
    smsService: Boolean(input?.smsService),
    emailService: Boolean(input?.emailService),
    emailCommercial: Boolean(input?.emailCommercial),
    phone: String(input?.phone || ""),
    email: String(input?.email || ""),
    locale: input?.locale === "fr" ? ("fr" as const) : ("en" as const),
    method: isCaslMethod(String(input?.method || "")) ? (input!.method as CaslMethod) : ("profile_checkbox" as const),
  }))
  .handler(async ({ context, data }): Promise<CaslPrefs> => {
    const phone = normalizeCaslAddress("sms", data.phone);
    const email = normalizeCaslAddress("email", data.email);
    await setConsent({
      userId: context.userId,
      channel: "sms",
      purpose: "service",
      granted: data.smsService,
      method: data.method,
      address: phone,
      locale: data.locale,
    });
    await setConsent({
      userId: context.userId,
      channel: "email",
      purpose: "service",
      granted: data.emailService,
      method: data.method,
      address: email,
      locale: data.locale,
    });
    await setConsent({
      userId: context.userId,
      channel: "email",
      purpose: "commercial",
      granted: data.emailCommercial,
      method: data.method,
      address: email,
      locale: data.locale,
    });
    const next = await listConsents(context.userId);
    return {
      smsService: next.smsService,
      emailService: next.emailService,
      emailCommercial: next.emailCommercial,
    };
  });

export const applyPublicUnsubscribe = createServerFn({ method: "POST" })
  .validator((input: { token?: string; channel?: string; address?: string; purpose?: string }) => ({
    token: String(input?.token || "").trim(),
    channel: String(input?.channel || "").trim(),
    address: String(input?.address || "").trim(),
    purpose: String(input?.purpose || "all").trim(),
  }))
  .handler(async ({ data }) => {
    if (data.token) {
      return applyUnsubscribeToken(data.token);
    }
    if (!isCaslChannel(data.channel)) {
      return { ok: false as const, error: "Choose email or SMS." };
    }
    const purpose = data.purpose === "service" || data.purpose === "commercial" ? data.purpose : "all";
    return withdrawByAddress({
      channel: data.channel,
      address: data.address,
      purpose,
      method: "public_form",
    });
  });
