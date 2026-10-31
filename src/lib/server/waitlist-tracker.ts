import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { evaluateCaslSend } from "@/lib/server/casl-consent";
import { isSuppressed } from "@/lib/server/email-suppressions";
import { lookupUser } from "@/lib/server/notify";
import { readFamilyTimeZone } from "@/lib/server/alert-dispatch";
import { sendTransactionalMail } from "@/lib/transactional-mail";
import { nid } from "@/lib/utils";
import {
  canWithdrawWaitlist,
  parentWaitlistStatus,
  waitlistEmailAllowed,
  waitlistQuietNow,
  waitlistStatusEmail,
  type ParentWaitlistStatus,
} from "@/lib/waitlist-tracker";

export type WaitlistRow = {
  id: string;
  daycareName: string;
  daycareSlug: string;
  city: string;
  status: ParentWaitlistStatus;
  sentAt: string;
  updatedAt: string;
  batchId: string | null;
};

/** A row from daycare_waitlist, the same list as /parent/spot-offers. */
export type CentreWaitlistRow = {
  id: string;
  daycareName: string;
  daycareSlug: string;
  ageGroup: string;
  status: string;
  joinedAt: string;
  offerId: string | null;
  offerStatus: string | null;
  offerExpiresAt: string | null;
};

export type AreaWaitlistRow = {
  id: string;
  label: string;
  postalCode: string;
  radiusKm: number;
  ageGroup: string;
  startDate: string | null;
  createdAt: string;
};

export type MyWaitlistsResult = {
  requests: WaitlistRow[];
  centres: CentreWaitlistRow[];
  areas: AreaWaitlistRow[];
};

async function ensureWaitlistColumns() {
  if (!import.meta.env.SSR) return;
  const { ensureWaitlistMailTable } = await import("./runtime-schema");
  await ensureWaitlistMailTable();
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const text = String(value || "").trim();
  return text || new Date(0).toISOString();
}

export const listMyWaitlists = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<MyWaitlistsResult> => {
    await ensureWaitlistColumns();
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      status: string;
      created_at: string;
      updated_at: string | null;
      batch_id: string | null;
      name: string;
      slug: string;
      city: string | null;
    }>`
      select b.id, b.status, b.created_at, b.status_updated_at as updated_at, b.batch_id,
             d.name, d.slug, d.city
      from bookings b
      join daycares d on d.id = b.daycare_id
      where b.user_id = ${context.userId}
      order by b.created_at desc
      limit 100
    `.catch(() => []);
    const requests = rows.flatMap((row) => {
      const status = parentWaitlistStatus(row.status);
      if (!status) return [];
      return [
        {
          id: row.id,
          daycareName: row.name,
          daycareSlug: row.slug,
          city: row.city || "",
          status,
          sentAt: iso(row.created_at),
          updatedAt: iso(row.updated_at || row.created_at),
          batchId: row.batch_id,
        },
      ];
    });
    const centres = await listCentreWaitlistRows(sql, context.userId);
    const areas = await listAreaWaitlistRows(sql, context.userId);
    return { requests, centres, areas };
  });

async function listCentreWaitlistRows(sql: Awaited<ReturnType<typeof getSql>>, userId: string): Promise<CentreWaitlistRow[]> {
  const entries = await sql<{
    id: string;
    age_group: string;
    status: string;
    joined_at: string | Date;
    name: string;
    slug: string;
  }>`
    select w.id, w.age_group, w.status, w.joined_at, d.name, d.slug
    from daycare_waitlist w
    join daycares d on d.id = w.daycare_id
    where w.user_id = ${userId}
    order by w.joined_at desc
    limit 100
  `.catch(() => []);
  const offers = await sql<{
    id: string;
    waitlist_id: string;
    status: string;
    expires_at: string | Date | null;
    offered_at: string | Date;
  }>`
    select id, waitlist_id, status, expires_at, offered_at
    from spot_offers
    where user_id = ${userId}
    order by offered_at desc
    limit 200
  `.catch(() => []);
  const byWaitlist = new Map<string, (typeof offers)[number]>();
  for (const offer of offers) {
    if (!byWaitlist.has(offer.waitlist_id)) byWaitlist.set(offer.waitlist_id, offer);
  }
  return entries.map((row) => {
    const offer = byWaitlist.get(row.id);
    return {
      id: row.id,
      daycareName: row.name,
      daycareSlug: row.slug,
      ageGroup: row.age_group,
      status: row.status,
      joinedAt: iso(row.joined_at),
      offerId: offer?.id ?? null,
      offerStatus: offer?.status ?? null,
      offerExpiresAt: offer?.expires_at ? iso(offer.expires_at) : null,
    };
  });
}

async function listAreaWaitlistRows(sql: Awaited<ReturnType<typeof getSql>>, userId: string): Promise<AreaWaitlistRow[]> {
  const rows = await sql<{
    id: string;
    center_label: string;
    postal_code: string | null;
    radius_km: number;
    age_band: string;
    start_date: string | Date | null;
    created_at: string | Date;
  }>`
    select id, center_label, postal_code, radius_km, age_band, start_date, created_at
    from saved_searches
    where user_id = ${userId} and kind = 'waitlist_area' and alerts_enabled = 1
    order by created_at desc
    limit 20
  `.catch(() => []);
  return rows.map((row) => ({
    id: row.id,
    label: row.center_label,
    postalCode: row.postal_code || "",
    radiusKm: Number(row.radius_km) || 0,
    ageGroup: row.age_band,
    startDate: row.start_date ? iso(row.start_date).slice(0, 10) : null,
    createdAt: iso(row.created_at),
  }));
}

export const withdrawMyWaitlist = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { bookingId?: string } | undefined) => ({
    bookingId: String(input?.bookingId || "").trim().slice(0, 80),
  }))
  .handler(async ({ context, data }) => {
    if (!data.bookingId) return { ok: false as const, error: "missing" as const };
    await ensureWaitlistColumns();
    const sql = await getSql();
    const rows = await sql<{ id: string; status: string; daycare_id: string }>`
      select id, status, daycare_id from bookings
      where id = ${data.bookingId} and user_id = ${context.userId}
      limit 1
    `;
    const row = rows[0];
    const status = row ? parentWaitlistStatus(row.status) : null;
    if (!row || !status || !canWithdrawWaitlist(status)) return { ok: false as const, error: "closed" as const };
    await sql`
      update bookings
      set status = 'cancelled', status_updated_at = now()
      where id = ${row.id} and user_id = ${context.userId}
    `;
    return { ok: true as const, daycareId: row.daycare_id };
  });

async function deliverWaitlistMail(input: { email: string; userId: string; centre: string; status: ParentWaitlistStatus }) {
  const suppressed = await isSuppressed(input.email);
  const casl = await evaluateCaslSend({
    userId: input.userId,
    channel: "email",
    purpose: "service",
    address: input.email,
  });
  if (!waitlistEmailAllowed({ quiet: false, emailConsent: casl.ok, suppressed })) return "skipped" as const;
  const letter = waitlistStatusEmail({ centre: input.centre, status: input.status });
  const sent = await sendTransactionalMail({
    to: input.email,
    subject: letter.subject,
    text: letter.text,
    html: letter.html,
    purpose: "waitlist_status",
  });
  return sent.status === "sent" || sent.status === "logged" ? ("sent" as const) : ("skipped" as const);
}

export async function notifyWaitlistStatusChange(input: {
  userId: string;
  bookingId: string;
  daycareName: string;
  status: string;
  now?: Date;
}) {
  const status = parentWaitlistStatus(input.status);
  if (!status || status === "withdrawn") return { inApp: false, email: "skipped" as const };
  await ensureWaitlistColumns();
  const sql = await getSql();
  const sourceKey = `lead:${input.bookingId}:${status}`;
  await sql`
    insert into user_notifications (
      id, user_id, kind, title_key, href, source_key, daycare_name, status, created_at
    ) values (
      ${nid("nt")}, ${input.userId}, ${"lead"}, ${"notifLeadUpdated"}, ${"/parent?tab=waitlists"},
      ${sourceKey}, ${input.daycareName.slice(0, 120)}, ${status}, now()
    )
    on conflict (user_id, source_key) do nothing
  `.catch(() => undefined);
  const now = input.now ?? new Date();
  const { dispatchCustomerAlert } = await import("@/lib/server/alert-dispatch");
  await dispatchCustomerAlert({
    userId: input.userId,
    category: "waitlist",
    vars: { name: input.daycareName, status },
    href: "/parent?tab=waitlists",
    dedupeKey: `waitlist:${input.bookingId}:${status}`,
    emailFallback: false,
    now,
  }).catch(() => undefined);
  const zone = await readFamilyTimeZone(sql, input.userId);
  if (waitlistQuietNow(now, zone)) {
    await sql`
      insert into waitlist_status_mail (id, user_id, booking_id, status, daycare_name)
      values (${nid("wsm")}, ${input.userId}, ${input.bookingId}, ${status}, ${input.daycareName.slice(0, 120)})
    `.catch(() => undefined);
    return { inApp: true, email: "held" as const };
  }
  const user = await lookupUser(input.userId).catch(() => ({ email: null as string | null }));
  const email = String(user.email || "").trim();
  if (!email) return { inApp: true, email: "skipped" as const };
  const result = await deliverWaitlistMail({ email, userId: input.userId, centre: input.daycareName, status }).catch(
    () => "skipped" as const,
  );
  return { inApp: true, email: result };
}

/** Sends mail that was held during quiet hours in that family's time zone. */
export async function flushHeldWaitlistMail(now: Date = new Date()) {
  await ensureWaitlistColumns();
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    user_id: string;
    status: string;
    daycare_name: string;
  }>`
    select id, user_id, status, daycare_name
    from waitlist_status_mail
    where sent_at is null
    order by created_at
    limit 40
  `.catch(() => []);
  let sent = 0;
  for (const row of rows) {
    const zone = await readFamilyTimeZone(sql, row.user_id);
    if (waitlistQuietNow(now, zone)) continue;
    const status = parentWaitlistStatus(row.status);
    if (!status) continue;
    const user = await lookupUser(row.user_id).catch(() => ({ email: null as string | null }));
    const email = String(user.email || "").trim();
    const result = email
      ? await deliverWaitlistMail({ email, userId: row.user_id, centre: row.daycare_name, status }).catch(() => "skipped" as const)
      : "skipped";
    if (result === "sent" || result === "skipped") {
      await sql`update waitlist_status_mail set sent_at = now() where id = ${row.id}`.catch(() => undefined);
      if (result === "sent") sent += 1;
    }
  }
  return { sent };
}

/** Spot alerts read open waitlist rows. No names, emails, or child details. */
export async function listOpenWaitlistFacts(daycareId: string) {
  const sql = await getSql();
  const rows = await sql<{ user_id: string; age_group: string; start_date: string | null; status: string }>`
    select user_id, age_group, start_date, status
    from bookings
    where daycare_id = ${daycareId}
  `.catch(() => [] as Array<{ user_id: string; age_group: string; start_date: string | null; status: string }>);
  return rows.flatMap((row) => {
    const status = parentWaitlistStatus(row.status);
    if (status !== "sent" && status !== "seen" && status !== "waitlisted") return [];
    return [
      {
        userId: row.user_id,
        ageGroup: row.age_group,
        startDate: row.start_date ? String(row.start_date).slice(0, 10) : null,
        status,
      },
    ];
  });
}
