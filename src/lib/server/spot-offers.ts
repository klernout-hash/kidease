import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { isPublicListing, listingVisibilityInputFromDb } from "@/lib/listing-visibility";
import { spotOfferMailEnabled } from "@/lib/features";
import { sendTransactionalMail } from "@/lib/transactional-mail";
import {
  auditRowsForOffer,
  expireDue,
  parseSpotAge,
  placeInLine,
  rejectWaitlistFee,
  waitlistAuditCsv,
  respondToOffer,
  sendSpotToFamily,
  spotOfferMailPlan,
  withdrawFromWaitlist,
  type OfferStatus,
  type QueueSnapshot,
  type SpotAge,
  type SpotOffer,
  type WaitlistEntry,
  type WaitlistStatus,
} from "@/lib/spot-offers";
import { signSpotOfferToken, spotOfferTokenSecret, verifySpotOfferToken } from "@/lib/spot-offer-token";
import { SITEMAP_ORIGIN } from "@/lib/sitemap";
import { nid } from "@/lib/utils";
import { canCentreWriteLeadsFor } from "@/lib/server/centre-access";

type EntryRow = {
  id: string;
  daycare_id: string;
  user_id: string;
  age_group: string;
  child_label: string | null;
  note: string | null;
  status: string;
  joined_at: string | Date;
  sibling?: number | boolean | null;
  start_date?: string | Date | null;
};

type OfferRow = {
  id: string;
  waitlist_id: string;
  daycare_id: string;
  user_id: string;
  age_group: string;
  status: string;
  offered_at: string | Date;
  expires_at: string | Date;
};

export type CentreWaitlistFamily = {
  id: string;
  userId: string;
  parentName: string;
  childLabel: string;
  ageGroup: SpotAge;
  note: string;
  status: WaitlistStatus;
  joinedAt: string;
  place: number | null;
};

export type CentreWaitlistCard = {
  daycareId: string;
  daycareName: string;
  slug: string;
  families: CentreWaitlistFamily[];
  openOfferId: string | null;
  siblingPriority: boolean;
};

export type MySpotOfferRow = {
  id: string;
  daycareId: string;
  daycareName: string;
  slug: string;
  ageGroup: SpotAge;
  status: WaitlistStatus;
  joinedAt: string;
  place: number | null;
  offerId: string | null;
  offerStatus: OfferStatus | null;
  expiresAt: string | null;
};

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const text = String(value || "").trim();
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(0).toISOString();
}

function clip(raw: unknown, max: number): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function asStatus(raw: string): WaitlistStatus {
  if (
    raw === "waiting" ||
    raw === "offered" ||
    raw === "accepted" ||
    raw === "declined" ||
    raw === "expired" ||
    raw === "withdrawn"
  ) {
    return raw;
  }
  return "waiting";
}

function asOfferStatus(raw: string): OfferStatus {
  if (raw === "open" || raw === "accepted" || raw === "declined" || raw === "expired") return raw;
  return "expired";
}

function toEntry(row: EntryRow): WaitlistEntry {
  return {
    id: row.id,
    daycareId: row.daycare_id,
    userId: row.user_id,
    ageGroup: parseSpotAge(row.age_group) ?? "any",
    status: asStatus(row.status),
    joinedAt: iso(row.joined_at),
    sibling: row.sibling === 1 || row.sibling === true,
    startDate: row.start_date ? iso(row.start_date).slice(0, 10) : null,
  };
}

function toOffer(row: OfferRow): SpotOffer {
  return {
    id: row.id,
    waitlistId: row.waitlist_id,
    daycareId: row.daycare_id,
    userId: row.user_id,
    ageGroup: parseSpotAge(row.age_group) ?? "any",
    status: asOfferStatus(row.status),
    offeredAt: iso(row.offered_at),
    expiresAt: iso(row.expires_at),
  };
}

async function siblingPriorityOn(sql: Sql, daycareId: string): Promise<boolean> {
  try {
    await sql`
      create table if not exists daycare_waitlist_rules (
        daycare_id text primary key,
        sibling_priority int not null default 0
      )
    `;
    const rows = await sql<{ sibling_priority: number }>`
      select sibling_priority from daycare_waitlist_rules where daycare_id = ${daycareId} limit 1
    `;
    return rows[0]?.sibling_priority === 1;
  } catch {
    return false;
  }
}

async function loadState(sql: Sql, daycareId: string): Promise<QueueSnapshot> {
  const siblingPriority = await siblingPriorityOn(sql, daycareId);
  const entries = await sql<EntryRow>`
    select id, daycare_id, user_id, age_group, child_label, note, status, joined_at,
           sibling, start_date
    from daycare_waitlist
    where daycare_id = ${daycareId}
  `.catch(() =>
    sql<EntryRow>`
      select id, daycare_id, user_id, age_group, child_label, note, status, joined_at
      from daycare_waitlist
      where daycare_id = ${daycareId}
    `,
  );
  const offers = await sql<OfferRow>`
    select id, waitlist_id, daycare_id, user_id, age_group, status, offered_at, expires_at
    from spot_offers
    where daycare_id = ${daycareId}
  `;
  return { entries: entries.map(toEntry), offers: offers.map(toOffer), siblingPriority };
}

async function persistStep(sql: Sql, before: QueueSnapshot, after: QueueSnapshot, created: SpotOffer[]) {
  for (const row of after.entries) {
    const prev = before.entries.find((item) => item.id === row.id);
    if (!prev || prev.status === row.status) continue;
    await sql`
      update daycare_waitlist
      set status = ${row.status}, updated_at = now()
      where id = ${row.id}
    `;
  }
  for (const row of after.offers) {
    const prev = before.offers.find((item) => item.id === row.id);
    if (!prev || prev.status === row.status) continue;
    await sql`
      update spot_offers
      set status = ${row.status}, responded_at = now()
      where id = ${row.id}
    `;
  }
  for (const offer of created) {
    await sql`
      insert into spot_offers (
        id, waitlist_id, daycare_id, user_id, age_group, status, offered_at, expires_at
      ) values (
        ${offer.id}, ${offer.waitlistId}, ${offer.daycareId}, ${offer.userId}, ${offer.ageGroup},
        ${offer.status}, ${offer.offeredAt}, ${offer.expiresAt}
      )
    `;
  }
}

async function emailOffer(sql: Sql, offer: SpotOffer) {
  const plan = spotOfferMailPlan(spotOfferMailEnabled());
  if (!plan.sendEmail) return false;
  const secret = spotOfferTokenSecret();
  const token = signSpotOfferToken(
    { offerId: offer.id, userId: offer.userId, exp: Date.parse(offer.expiresAt) },
    secret,
  );
  if (!token) return false;
  const users = await sql<{ email: string | null }>`
    select email from "user" where id = ${offer.userId} limit 1
  `;
  const to = String(users[0]?.email || "").trim();
  if (!to) return false;
  const centres = await sql<{ name: string }>`
    select name from daycares where id = ${offer.daycareId} limit 1
  `;
  const name = centres[0]?.name || "A daycare";
  const href = `${SITEMAP_ORIGIN}/offer/${encodeURIComponent(token)}`;
  const text = `${name} offered you a spot on KidEase. You have 48 hours to answer. There is no waitlist fee. ${href}`;
  await sendTransactionalMail({
    purpose: "spot_offer",
    to,
    subject: `${name} offered you a spot`,
    text,
    html: `<p>${name} offered you a spot on KidEase. You have 48 hours to answer. There is no waitlist fee.</p><p><a href="${href}">Answer now</a></p>`,
  });
  return true;
}

async function notifyCreated(sql: Sql, offers: SpotOffer[]) {
  let sent = 0;
  for (const offer of offers) {
    try {
      if (await emailOffer(sql, offer)) sent += 1;
    } catch (err) {
      console.error("[kidease-spot-offer] mail skipped", err instanceof Error ? err.message : "error");
    }
  }
  return sent;
}

export const joinDaycareWaitlist = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; ageGroup?: string; childLabel?: string; note?: string; fee?: unknown }) => input)
  .handler(async ({ context, data }) => {
    const blocked = rejectWaitlistFee(data);
    if (blocked) throw new Error(blocked);
    const daycareId = String(data.daycareId || "").trim();
    const age = parseSpotAge(data.ageGroup);
    if (!daycareId || !age) throw new Error("Choose an age group.");
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      slug: string;
      name: string;
      license_number: string | null;
      address: string | null;
      visibility: string | null;
      is_test: number | null;
      claim_status: string | null;
      province: string | null;
      fact_source: string | null;
      merged_into: string | null;
      import_fault: string | null;
      listing_active: number | null;
    }>`
      select id, slug, name, license_number, address, visibility, is_test, claim_status,
             province, fact_source, merged_into, import_fault, listing_active
      from daycares where id = ${daycareId} limit 1
    `;
    const row = rows[0];
    if (!row || !isPublicListing(listingVisibilityInputFromDb(row))) {
      throw new Error("This listing is not open for a waitlist.");
    }
    const existing = await sql<EntryRow>`
      select id, daycare_id, user_id, age_group, child_label, note, status, joined_at
      from daycare_waitlist
      where daycare_id = ${daycareId} and user_id = ${context.userId}
        and status in ('waiting', 'offered')
      limit 1
    `;
    if (existing[0]) return { ok: true as const, id: existing[0].id, already: true };
    const id = nid("wl");
    const child = clip(data.childLabel, 40);
    const note = clip(data.note, 280);
    await sql`
      insert into daycare_waitlist (id, daycare_id, user_id, age_group, child_label, note, status)
      values (${id}, ${daycareId}, ${context.userId}, ${age}, ${child || null}, ${note || null}, 'waiting')
    `;
    return { ok: true as const, id, already: false };
  });

export const withdrawDaycareWaitlist = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string }) => input)
  .handler(async ({ context, data }) => {
    const id = String(data.id || "").trim();
    if (!id) throw new Error("You are not on this waitlist.");
    const sql = await getSql();
    const rows = await sql<{ daycare_id: string; user_id: string }>`
      select daycare_id, user_id from daycare_waitlist where id = ${id} limit 1
    `;
    const row = rows[0];
    if (!row || row.user_id !== context.userId) throw new Error("You are not on this waitlist.");
    const before = await loadState(sql, row.daycare_id);
    const step = withdrawFromWaitlist(before, id, Date.now(), () => nid("so"));
    if (!step.ok) throw new Error(step.error || "You are not on this waitlist.");
    await persistStep(sql, before, step.state, step.createdOffers);
    await notifyCreated(sql, step.createdOffers);
    return { ok: true as const };
  });

export const listMySpotOffers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const entries = await sql<EntryRow & { daycare_name: string; slug: string }>`
      select w.id, w.daycare_id, w.user_id, w.age_group, w.child_label, w.note, w.status, w.joined_at,
             d.name as daycare_name, d.slug
      from daycare_waitlist w
      join daycares d on d.id = w.daycare_id
      where w.user_id = ${context.userId}
      order by w.joined_at desc
    `;
    const offers = await sql<OfferRow>`
      select id, waitlist_id, daycare_id, user_id, age_group, status, offered_at, expires_at
      from spot_offers
      where user_id = ${context.userId}
      order by offered_at desc
    `;
    const byWaitlist = new Map<string, OfferRow>();
    for (const offer of offers) {
      if (!byWaitlist.has(offer.waitlist_id)) byWaitlist.set(offer.waitlist_id, offer);
    }
    const daycareIds = [...new Set(entries.map((row) => row.daycare_id))];
    const lines = new Map<string, WaitlistEntry[]>();
    for (const daycareId of daycareIds) {
      const state = await loadState(sql, daycareId);
      lines.set(daycareId, state.entries);
    }
    const mine: MySpotOfferRow[] = entries.map((row) => {
      const offer = byWaitlist.get(row.id);
      const age = parseSpotAge(row.age_group) ?? "any";
      return {
        id: row.id,
        daycareId: row.daycare_id,
        daycareName: row.daycare_name,
        slug: row.slug,
        ageGroup: age,
        status: asStatus(row.status),
        joinedAt: iso(row.joined_at),
        place: placeInLine(lines.get(row.daycare_id) ?? [], row.id),
        offerId: offer?.id ?? null,
        offerStatus: offer ? asOfferStatus(offer.status) : null,
        expiresAt: offer ? iso(offer.expires_at) : null,
      };
    });
    return { rows: mine, emailEnabled: spotOfferMailEnabled() };
  });

export const listCentreWaitlist = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const owned = await sql<{ id: string; name: string; slug: string }>`
      select d.id, d.name, d.slug
      from daycares d
      join provider_daycares p on p.daycare_id = d.id
      where p.user_id = ${context.userId}
    `;
    const member = await sql<{ id: string; name: string; slug: string }>`
      select d.id, d.name, d.slug
      from daycares d
      join centre_members m on m.daycare_id = d.id
      where m.user_id = ${context.userId} and m.status = 'active'
    `.catch(() => [] as Array<{ id: string; name: string; slug: string }>);
    const centres = new Map<string, { id: string; name: string; slug: string }>();
    for (const row of [...owned, ...member]) centres.set(row.id, row);
    const cards: CentreWaitlistCard[] = [];
    for (const centre of centres.values()) {
      if (!(await canCentreWriteLeadsFor(sql, context.userId, centre.id))) continue;
      const state = await loadState(sql, centre.id);
      const people = await sql<EntryRow & { parent_name: string | null }>`
        select w.id, w.daycare_id, w.user_id, w.age_group, w.child_label, w.note, w.status, w.joined_at,
               u.name as parent_name
        from daycare_waitlist w
        left join "user" u on u.id = w.user_id
        where w.daycare_id = ${centre.id}
        order by w.joined_at asc
      `;
      const open = state.offers.find((row) => row.status === "open");
      cards.push({
        daycareId: centre.id,
        daycareName: centre.name,
        slug: centre.slug,
        openOfferId: open?.id ?? null,
        siblingPriority: state.siblingPriority === true,
        families: people.map((row) => ({
          id: row.id,
          userId: row.user_id,
          parentName: String(row.parent_name || "Parent").trim() || "Parent",
          childLabel: String(row.child_label || "").trim(),
          ageGroup: parseSpotAge(row.age_group) ?? "any",
          note: String(row.note || "").trim(),
          status: asStatus(row.status),
          joinedAt: iso(row.joined_at),
          place: placeInLine(state.entries, row.id),
        })),
      });
    }
    return { centres: cards, emailEnabled: spotOfferMailEnabled() };
  });

export const sendCentreSpotOffer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { waitlistId?: string; fee?: unknown }) => input)
  .handler(async ({ context, data }) => {
    const blocked = rejectWaitlistFee(data);
    if (blocked) throw new Error(blocked);
    const waitlistId = String(data.waitlistId || "").trim();
    if (!waitlistId) throw new Error("That family is not waiting.");
    const sql = await getSql();
    const rows = await sql<{ daycare_id: string }>`
      select daycare_id from daycare_waitlist where id = ${waitlistId} limit 1
    `;
    const daycareId = rows[0]?.daycare_id;
    if (!daycareId || !(await canCentreWriteLeadsFor(sql, context.userId, daycareId))) {
      throw new Error("This listing is not on your desk.");
    }
    const before = await loadState(sql, daycareId);
    const step = sendSpotToFamily(before, waitlistId, Date.now(), () => nid("so"));
    await persistStep(sql, before, step.state, step.createdOffers);
    const sent = await notifyCreated(sql, step.createdOffers);
    if (!step.ok) throw new Error(step.error || "That family is not waiting.");
    return { ok: true as const, emailed: sent, emailEnabled: spotOfferMailEnabled() };
  });

async function respondAsUser(input: {
  offerId: string;
  userId: string;
  decision: "accept" | "decline";
}) {
  const sql = await getSql();
  const rows = await sql<{ daycare_id: string; user_id: string }>`
    select daycare_id, user_id from spot_offers where id = ${input.offerId} limit 1
  `;
  const row = rows[0];
  if (!row || row.user_id !== input.userId) throw new Error("This offer has ended.");
  const before = await loadState(sql, row.daycare_id);
  const step = respondToOffer(before, input.offerId, input.decision, Date.now(), () => nid("so"));
  if (!step.ok && !step.createdOffers.length) throw new Error(step.error || "This offer has ended.");
  await persistStep(sql, before, step.state, step.createdOffers);
  await notifyCreated(sql, step.createdOffers);
  return { ok: step.ok, error: step.error ?? null, decision: input.decision };
}

export const respondMySpotOffer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { offerId?: string; decision?: string }) => input)
  .handler(async ({ context, data }) => {
    const offerId = String(data.offerId || "").trim();
    const decision = data.decision === "accept" || data.decision === "decline" ? data.decision : null;
    if (!offerId || !decision) throw new Error("This offer has ended.");
    return respondAsUser({ offerId, userId: context.userId, decision });
  });

export const previewSpotOfferLink = createServerFn({ method: "GET" })
  .validator((token: string) => String(token || ""))
  .handler(async ({ data: token }) => {
    const payload = verifySpotOfferToken(token, spotOfferTokenSecret());
    if (!payload) return { ok: false as const };
    const sql = await getSql();
    const rows = await sql<{ status: string; expires_at: string | Date; name: string; slug: string }>`
      select o.status, o.expires_at, d.name, d.slug
      from spot_offers o
      join daycares d on d.id = o.daycare_id
      where o.id = ${payload.offerId} and o.user_id = ${payload.userId}
      limit 1
    `;
    const row = rows[0];
    if (!row) return { ok: false as const };
    return {
      ok: true as const,
      daycareName: row.name,
      slug: row.slug,
      status: asOfferStatus(row.status),
      expiresAt: iso(row.expires_at),
    };
  });

export const respondSpotOfferLink = createServerFn({ method: "POST" })
  .validator((input: { token?: string; decision?: string }) => input)
  .handler(async ({ data }) => {
    const payload = verifySpotOfferToken(String(data.token || ""), spotOfferTokenSecret());
    const decision = data.decision === "accept" || data.decision === "decline" ? data.decision : null;
    if (!payload || !decision) throw new Error("This link is not valid.");
    return respondAsUser({ offerId: payload.offerId, userId: payload.userId, decision });
  });

export async function runSpotOfferExpiryJob(now = Date.now()) {
  const sql = await getSql();
  const due = await sql<{ daycare_id: string }>`
    select distinct daycare_id from spot_offers
    where status = 'open' and expires_at <= ${new Date(now).toISOString()}
  `.catch(() => [] as Array<{ daycare_id: string }>);
  let advanced = 0;
  let emailed = 0;
  for (const row of due) {
    const before = await loadState(sql, row.daycare_id);
    const step = expireDue(before, now, () => nid("so"));
    if (!step.createdOffers.length && step.state === before) continue;
    const changed =
      step.createdOffers.length > 0 ||
      step.state.offers.some((offer, index) => offer.status !== before.offers[index]?.status);
    if (!changed && !step.createdOffers.length) {
      const statusChanged = step.state.entries.some((entry) => {
        const prev = before.entries.find((item) => item.id === entry.id);
        return prev && prev.status !== entry.status;
      });
      if (!statusChanged) continue;
    }
    await persistStep(sql, before, step.state, step.createdOffers);
    advanced += step.createdOffers.length;
    emailed += await notifyCreated(sql, step.createdOffers);
  }
  return {
    ok: true as const,
    centres: due.length,
    advanced,
    emailed,
    emailEnabled: spotOfferMailEnabled(),
  };
}

async function ensureAuditTable(sql: Sql) {
  await sql`
    create table if not exists waitlist_audit (
      id text primary key,
      daycare_id text not null,
      entry_id text,
      place int,
      action text not null,
      detail text not null default '',
      created_at timestamptz not null default now()
    )
  `;
}

export const setWaitlistSiblingPriority = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; on?: boolean }) => input)
  .handler(async ({ context, data }) => {
    const daycareId = String(data.daycareId || "").trim();
    const sql = await getSql();
    if (!daycareId || !(await canCentreWriteLeadsFor(sql, context.userId, daycareId))) {
      throw new Error("This listing is not on your desk.");
    }
    await sql`
      create table if not exists daycare_waitlist_rules (
        daycare_id text primary key,
        sibling_priority int not null default 0
      )
    `;
    const on = data.on === true ? 1 : 0;
    await sql`
      insert into daycare_waitlist_rules (daycare_id, sibling_priority)
      values (${daycareId}, ${on})
      on conflict (daycare_id) do update set sibling_priority = ${on}
    `;
    return { ok: true as const, siblingPriority: on === 1 };
  });

export const exportCentreWaitlistAudit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string }) => input)
  .handler(async ({ context, data }) => {
    const daycareId = String(data.daycareId || "").trim();
    const sql = await getSql();
    if (!daycareId || !(await canCentreWriteLeadsFor(sql, context.userId, daycareId))) {
      throw new Error("This listing is not on your desk.");
    }
    const state = await loadState(sql, daycareId);
    const waiting = state.entries.filter((row) => row.status === "waiting" || row.status === "offered");
    const spotAge = waiting[0]?.ageGroup ?? "any";
    const rows = auditRowsForOffer(waiting, {
      siblingPriority: state.siblingPriority === true,
      spotAge,
    });
    const csv = waitlistAuditCsv(rows);
    try {
      await ensureAuditTable(sql);
      for (const row of rows) {
        await sql`
          insert into waitlist_audit (id, daycare_id, entry_id, place, action, detail)
          values (
            ${nid("wla")},
            ${daycareId},
            ${row.entryId},
            ${row.place},
            ${"export"},
            ${`${row.ageGroup}|${row.startDate}|${row.sibling ? "sibling" : "no-sibling"}`}
          )
        `;
      }
    } catch (err) {
      console.error("[kidease-waitlist] audit skipped", err instanceof Error ? err.message : "failed");
    }
    return { ok: true as const, csv };
  });
