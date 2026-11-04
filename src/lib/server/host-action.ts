/**
 * In-app notice and account email when a listing is missing facts.
 * FEATURE_HOST_LISTING stays off. Mail sends only in production.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { hostListingEnabled } from "@/lib/features";
import {
  decideHostActionNotice,
  hostActionEmailLive,
  hostActionFingerprint,
  hostActionItems,
  hostActionSentence,
  type HostActionItem,
} from "@/lib/host-action";
import { nid } from "@/lib/utils";
import { isAdminOnlyListing } from "@/lib/listing-visibility";
import { lookupUser } from "@/lib/server/notify";
import { ensureUserNotifications } from "@/lib/server/runtime-schema";

const WEEK_BUCKET = 7 * 24 * 60 * 60 * 1000;

function secret(): string {
  return (process.env.BETTER_AUTH_SECRET || "").trim();
}

function signToken(userId: string, exp: number): string | null {
  const key = secret();
  if (!key) return null;
  const body = Buffer.from(JSON.stringify({ userId, exp }), "utf8").toString("base64url");
  const sig = createHmac("sha256", key).update(body).digest("base64url");
  return `hl.${body}.${sig}`;
}

export function readHostActionToken(token: string, nowMs = Date.now()): { userId: string } | null {
  const raw = String(token || "").trim();
  if (!raw.startsWith("hl.")) return null;
  const key = secret();
  if (!key) return null;
  const parts = raw.slice(3).split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = createHmac("sha256", key).update(body).digest("base64url");
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { userId?: string; exp?: number };
    if (!parsed.userId || !parsed.exp || parsed.exp < nowMs) return null;
    return { userId: parsed.userId };
  } catch {
    return null;
  }
}

function origin(): string {
  return (process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://www.kidease.ca").replace(/\/$/, "");
}

function splitPhotos(raw: string | null): string[] {
  return String(raw || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

type CentreRow = {
  id: string;
  name: string | null;
  province: string | null;
  hours: string | null;
  license_number: string | null;
  license_status: string | null;
  licensed_capacity: number | null;
  ages_confirmed: number | boolean | null;
  age_min_months: number | null;
  age_max_months: number | null;
  infant_monthly: number | null;
  toddler_monthly: number | null;
  preschool_monthly: number | null;
  part_time_monthly: number | null;
  photos: string | null;
  screening_on_file: number | boolean | null;
  slug: string | null;
  visibility: string | null;
  is_test: number | boolean | null;
};

async function loadCentres(userId: string): Promise<CentreRow[]> {
  const sql = await getSql();
  return sql<CentreRow>`
    select d.id, d.name, d.province, d.hours, d.license_number, d.license_status, d.licensed_capacity,
           d.ages_confirmed, d.age_min_months, d.age_max_months,
           d.infant_monthly, d.toddler_monthly, d.preschool_monthly, d.part_time_monthly,
           d.photos, d.screening_on_file, d.slug, d.visibility, d.is_test
    from daycares d
    join provider_daycares p on p.daycare_id = d.id
    where p.user_id = ${userId}
  `
    .then((rows) =>
      // QA/test fixtures (is_test, admin_only, "(QA)"/TEST names) never trigger notices or email.
      rows.filter((row) => !isAdminOnlyListing({ name: row.name, slug: row.slug, visibility: row.visibility, isTest: row.is_test })),
    )
    .catch(() => []);
}

function itemsFor(rows: CentreRow[]): HostActionItem[] {
  return hostActionItems(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      province: row.province,
      hours: row.hours,
      licenseNumber: row.license_number,
      licenseStatus: row.license_status,
      licensedCapacity: row.licensed_capacity,
      agesKnown: row.ages_confirmed === true || row.ages_confirmed === 1,
      ageMinMonths: row.age_min_months,
      ageMaxMonths: row.age_max_months,
      infantMonthly: row.infant_monthly,
      toddlerMonthly: row.toddler_monthly,
      preschoolMonthly: row.preschool_monthly,
      partTimeMonthly: row.part_time_monthly,
      photos: splitPhotos(row.photos),
      screeningOnFile: row.screening_on_file === true || row.screening_on_file === 1,
    })),
  );
}

async function insertNotice(userId: string, itemGroup: HostActionItem[], locale: string) {
  const sql = await getSql();
  await ensureUserNotifications(sql);
  const daycareId = itemGroup[0]?.daycareId || "centre";
  const line = itemGroup
    .map((item) => hostActionSentence(item.code, item.daycareName, locale))
    .join(" ");
  const source = `customer_alert:host-action:${daycareId}:${hostActionFingerprint(itemGroup.map((item) => item.code))}:${Math.floor(Date.now() / WEEK_BUCKET)}`;
  await sql`
    insert into user_notifications (id, user_id, kind, title_key, href, source_key, daycare_name, status, created_at)
    values (
      ${nid("nt")},
      ${userId},
      ${"customer_alert"},
      ${"notifCustomerAlert"},
      ${"/provider?desk=today"},
      ${source},
      ${line.slice(0, 280)},
      ${"host_action"},
      now()
    )
    on conflict (user_id, source_key) do nothing
  `.catch(() => undefined);
}

async function sendAccountEmail(input: {
  to: string;
  locale: string;
  items: HostActionItem[];
  userId: string;
  province?: string | null;
}) {
  if (!hostActionEmailLive(process.env)) return { sent: false as const, reason: "quiet" as const };
  const fr = input.locale === "fr";
  const lines = input.items.map((item) => hostActionSentence(item.code, item.daycareName, input.locale));
  const exp = Date.now() + 60 * 24 * 60 * 60 * 1000;
  const token = signToken(input.userId, exp);
  const unsub = token ? `${origin()}/api/unsubscribe?token=${encodeURIComponent(token)}` : `${origin()}/unsubscribe`;
  const subject = fr ? "Votre fiche KidEase a encore besoin de faits" : "Your KidEase listing still needs a few facts";
  const intro = fr
    ? "Ceci est un avis de compte. KidEase n'invente pas les faits manquants."
    : "This is an account notice. KidEase does not invent the missing facts.";
  const text = [intro, "", ...lines, "", fr ? `Ne plus recevoir ces avis : ${unsub}` : `Stop these notices: ${unsub}`].join("\n");
  const html = `<p>${intro}</p><ul>${lines.map((line) => `<li>${line}</li>`).join("")}</ul><p><a href="${unsub}">${fr ? "Se désabonner" : "Unsubscribe"}</a></p>`;
  const { sendTransactionalMail } = await import("@/lib/transactional-mail");
  const { emailLocaleFor } = await import("@/lib/email-layout");
  const mailLocale = emailLocaleFor(input.locale, input.province);
  const frPrimary = mailLocale !== "en";
  const linesFr = input.items.map((item) => hostActionSentence(item.code, item.daycareName, "fr"));
  const linesEn = input.items.map((item) => hostActionSentence(item.code, item.daycareName, "en"));
  const introFr = "Ceci est un avis de compte. KidEase n'invente pas les faits manquants.";
  const introEn = "This is an account notice. KidEase does not invent the missing facts.";
  const ctaHref = `${origin()}/provider?desk=today`;
  await sendTransactionalMail({
    purpose: "host_action",
    to: input.to,
    subject,
    text,
    html,
    unsubscribeUrl: unsub,
    branded: {
      locale: mailLocale,
      origin: origin(),
      preheader: frPrimary ? "Ajoutez les faits manquants à votre fiche." : "Add the missing facts to your listing.",
      heading: frPrimary ? "Votre fiche a encore besoin de quelques faits" : "Your listing still needs a few facts",
      blocks: [
        { kind: "p", text: frPrimary ? introFr : introEn },
        { kind: "list", items: frPrimary ? linesFr : linesEn },
      ],
      cta: { label: frPrimary ? "Compléter ma fiche" : "Finish my listing", href: ctaHref },
      reason: frPrimary
        ? "Vous recevez ce courriel parce que vous gérez une fiche sur KidEase."
        : "You get this because you manage a listing on KidEase.",
      en: mailLocale === "fr-qc"
        ? {
            heading: "Your listing still needs a few facts",
            blocks: [
              { kind: "p", text: introEn },
              { kind: "list", items: linesEn },
            ],
            cta: { label: "Finish my listing" },
          }
        : undefined,
    },
  });
  return { sent: true as const };
}

export const syncHostActionNotices = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!hostListingEnabled()) return { enabled: false as const, sent: 0 };
    const sql = await getSql();
    const centres = await loadCentres(context.userId);
    const items = itemsFor(centres);
    const byCentre = new Map<string, HostActionItem[]>();
    for (const item of items) {
      const list = byCentre.get(item.daycareId) ?? [];
      list.push(item);
      byCentre.set(item.daycareId, list);
    }
    const actor = await lookupUser(context.userId).catch(() => ({ email: null as string | null }));
    const localeRows = await sql<{ locale: string | null }>`
      select locale from profiles where user_id = ${context.userId} limit 1
    `.catch(() => []);
    const locale = localeRows[0]?.locale === "fr" ? "fr" : "en";
    let sent = 0;
    const due: HostActionItem[] = [];
    for (const [daycareId, group] of byCentre) {
      const codes = group.map((item) => item.code);
      const rows = await sql<{ fingerprint: string | null; last_at: string | Date | null; email_opt_out: boolean | number | null }>`
        select fingerprint, last_at, email_opt_out
        from host_action_notices
        where user_id = ${context.userId} and daycare_id = ${daycareId}
        limit 1
      `.catch(() => []);
      const row = rows[0];
      const lastMs = row?.last_at ? new Date(row.last_at).getTime() : null;
      const decision = decideHostActionNotice({
        codes,
        previousFingerprint: row?.fingerprint ?? null,
        lastAtMs: Number.isFinite(lastMs) ? lastMs : null,
        nowMs: Date.now(),
      });
      if (decision === "wait") continue;
      const fingerprint = hostActionFingerprint(codes);
      await sql`
        insert into host_action_notices (user_id, daycare_id, fingerprint, first_at, last_at, email_opt_out)
        values (${context.userId}, ${daycareId}, ${fingerprint}, now(), now(), ${Boolean(row?.email_opt_out)})
        on conflict (user_id, daycare_id) do update
          set fingerprint = excluded.fingerprint,
              first_at = coalesce(host_action_notices.first_at, now()),
              last_at = now()
      `.catch(() => undefined);
      await insertNotice(context.userId, group, locale);
      const optedOut = row?.email_opt_out === true || row?.email_opt_out === 1;
      if (!optedOut) due.push(...group);
      sent += 1;
    }
    if (due.length && actor.email) {
      const qc = due.some((item) => String(centres.find((row) => row.id === item.daycareId)?.province || "").trim().toUpperCase() === "QC");
      await sendAccountEmail({ to: actor.email, locale, items: due, userId: context.userId, province: qc ? "QC" : null }).catch(() => undefined);
    }
    return { enabled: true as const, sent };
  });

export const getHostActionEmailPref = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!hostListingEnabled()) return { enabled: false as const, email: false };
    const sql = await getSql();
    const rows = await sql<{ n: number }>`
      select count(*)::int as n from host_action_notices
      where user_id = ${context.userId} and email_opt_out = true
    `.catch(() => [{ n: 0 }]);
    return { enabled: true as const, email: (rows[0]?.n ?? 0) === 0 };
  });

export const setHostActionEmailPref = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { email: boolean }) => ({ email: input?.email !== false }))
  .handler(async ({ context, data }) => {
    if (!hostListingEnabled()) return { ok: false as const };
    const sql = await getSql();
    const centres = await loadCentres(context.userId);
    const optOut = !data.email;
    for (const centre of centres) {
      await sql`
        insert into host_action_notices (user_id, daycare_id, fingerprint, email_opt_out)
        values (${context.userId}, ${centre.id}, ${""}, ${optOut})
        on conflict (user_id, daycare_id) do update set email_opt_out = ${optOut}
      `.catch(() => undefined);
    }
    if (!centres.length) {
      await sql`
        insert into host_action_notices (user_id, daycare_id, fingerprint, email_opt_out)
        values (${context.userId}, ${"account"}, ${""}, ${optOut})
        on conflict (user_id, daycare_id) do update set email_opt_out = ${optOut}
      `.catch(() => undefined);
    }
    return { ok: true as const, email: data.email };
  });

export async function applyHostActionUnsubscribe(token: string): Promise<{ ok: true } | { ok: false }> {
  const payload = readHostActionToken(token);
  if (!payload) return { ok: false };
  const sql = await getSql();
  await sql`
    update host_action_notices set email_opt_out = true where user_id = ${payload.userId}
  `.catch(() => undefined);
  await sql`
    insert into host_action_notices (user_id, daycare_id, fingerprint, email_opt_out)
    values (${payload.userId}, ${"account"}, ${""}, true)
    on conflict (user_id, daycare_id) do update set email_opt_out = true
  `.catch(() => undefined);
  return { ok: true };
}
