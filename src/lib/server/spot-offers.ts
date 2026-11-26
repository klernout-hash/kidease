import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { catalogByIdGet } from "@/lib/catalog";
import { getSql, type Sql } from "@/lib/db";
import { isKidEaseOperatorEmail } from "@/lib/admin-email";
import {
  deskWaitlistVisible,
  isHiddenTestListing,
  isPublicListing,
  listingVisibilityInputFromDb,
} from "@/lib/listing-visibility";
import { spotOfferMailEnabled } from "@/lib/features";
import { moveInLine } from "@/lib/gap-features";
import { sendTransactionalMail } from "@/lib/transactional-mail";
import { renderBrandedEmail, renderBrandedText } from "@/lib/email-layout";
import { isAdminOnlyListing } from "@/lib/listing-visibility";
import {
  auditRowsForOffer,
  expireDue,
  fairOfferOrder,
  offerNextForAge,
  parseSpotAge,
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
import {
  WAITLIST_EVENT,
  orderFromIds,
  staffChildTags,
  waitlistJoinDecision,
  waitlistOpenFromEvents,
  type WaitlistEventRow,
} from "@/lib/pipeline-features";
import { signSpotOfferToken, spotOfferTokenSecret, verifySpotOfferToken } from "@/lib/spot-offer-token";
import { SITEMAP_ORIGIN } from "@/lib/sitemap";
import { nid } from "@/lib/utils";
import { canCentreWriteLeadsFor, listAccessibleDaycareIds } from "@/lib/server/centre-access";
import { upsertDaycare } from "@/lib/server/seed";

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
  rank_order?: number | null;
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
  sibling: boolean;
  staffChild: boolean;
  rank: number | null;
};

export type CentreWaitlistCard = {
  daycareId: string;
  daycareName: string;
  slug: string;
  families: CentreWaitlistFamily[];
  openOfferId: string | null;
  openOfferWaitlistId: string | null;
  openOfferExpiresAt: string | null;
  siblingPriority: boolean;
  waitlistOpen: boolean;
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
    rank: row.rank_order == null ? null : Number(row.rank_order),
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

async function readWaitlistEvents(sql: Sql, daycareId: string): Promise<WaitlistEventRow[]> {
  const rows = await sql<{ action: string; entry_id: string | null; created_at: string | Date }>`
    select action, entry_id, created_at from waitlist_audit
    where daycare_id = ${daycareId}
      and action in (${WAITLIST_EVENT.closed}, ${WAITLIST_EVENT.opened}, ${WAITLIST_EVENT.staffOn}, ${WAITLIST_EVENT.staffOff})
    order by created_at desc
    limit 500
  `.catch(() => [] as { action: string; entry_id: string | null; created_at: string | Date }[]);
  return rows.map((row) => ({ action: row.action, entryId: row.entry_id, createdAt: iso(row.created_at) }));
}

async function loadState(sql: Sql, daycareId: string): Promise<QueueSnapshot> {
  const siblingPriority = await siblingPriorityOn(sql, daycareId);
  const entries = await sql<EntryRow>`
    select id, daycare_id, user_id, age_group, child_label, note, status, joined_at,
           sibling, start_date, rank_order
    from daycare_waitlist
    where daycare_id = ${daycareId}
  `.catch(() =>
    sql<EntryRow>`
      select id, daycare_id, user_id, age_group, child_label, note, status, joined_at
      from daycare_waitlist
      where daycare_id = ${daycareId}
    `,
  );
  const staff = staffChildTags(await readWaitlistEvents(sql, daycareId));
  const offers = await sql<OfferRow>`
    select id, waitlist_id, daycare_id, user_id, age_group, status, offered_at, expires_at
    from spot_offers
    where daycare_id = ${daycareId}
  `;
  return {
    entries: entries.map((row) => ({ ...toEntry(row), staffChild: staff.has(row.id) })),
    offers: offers.map(toOffer),
    siblingPriority,
  };
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
  const users = await sql<{ email: string | null; name: string | null; locale: string | null }>`
    select u.email, u.name, p.locale
    from "user" u left join profiles p on p.user_id = u.id
    where u.id = ${offer.userId} limit 1
  `;
  const to = String(users[0]?.email || "").trim();
  if (!to) return false;
  const centres = await sql<{ name: string; slug: string | null; visibility: string | null; is_test: number | null; province: string | null }>`
    select name, slug, visibility, is_test, province from daycares where id = ${offer.daycareId} limit 1
  `;
  const centre = centres[0];
  const entry = await sql<{ child_label: string | null; start_date: string | null }>`
    select child_label, start_date::text as start_date from daycare_waitlist where id = ${offer.waitlistId} limit 1
  `.catch(() => [] as { child_label: string | null; start_date: string | null }[]);
  const name = centre?.name || "";
  const { noticeLocale, spotOfferEmail } = await import("@/lib/notification-templates");
  const locale = String(centre?.province || "").toUpperCase() === "QC" ? "fr" : noticeLocale(users[0]?.locale);
  const href = `${SITEMAP_ORIGIN}/offer/${encodeURIComponent(token)}`;
  const mail = spotOfferEmail({
    locale,
    parentName: users[0]?.name,
    childName: entry[0]?.child_label,
    centreName: name,
    ageGroup: offer.ageGroup,
    startDate: entry[0]?.start_date,
    expiresAt: offer.expiresAt,
    province: centre?.province,
    href,
  });
  const branded = mail.branded;
  await sendTransactionalMail({
    purpose: "spot_offer",
    to,
    subject: mail.subject,
    text: renderBrandedText(branded),
    html: renderBrandedEmail(branded),
    unsubscribeUrl: branded.unsubscribeUrl,
    aboutTestListing: isAdminOnlyListing({
      name,
      slug: centre?.slug,
      visibility: centre?.visibility,
      isTest: centre?.is_test,
    }),
    branded: branded,
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
    const { assertRuntimeSwitch } = await import("@/lib/runtime-switches");
    assertRuntimeSwitch("FEATURE_WAITLIST_SPOTS");
    const blocked = rejectWaitlistFee(data);
    if (blocked) throw new Error(blocked);
    const daycareId = String(data.daycareId || "").trim();
    const age = parseSpotAge(data.ageGroup);
    if (!daycareId || !age) throw new Error("Choose an age group.");
    const { assertFamilyWrite } = await import("@/lib/server/coparent");
    const homeId = (await assertFamilyWrite(context.userId)).dataUserId;
    const sql = await getSql();
    const listed = await catalogByIdGet(daycareId);
    if (listed) await upsertDaycare(sql, listed);
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
    const visibility = row ? listingVisibilityInputFromDb(row) : null;
    const hiddenTest = Boolean(visibility && isHiddenTestListing(visibility));
    const { callerIsTestAccount } = await import("@/lib/server/public-listing");
    const decision = row
      ? waitlistJoinDecision({
          publicListing: isPublicListing(visibility),
          hiddenTestListing: hiddenTest,
          viewerIsTestAccount: hiddenTest ? await callerIsTestAccount() : false,
          ownerOpen: waitlistOpenFromEvents(await readWaitlistEvents(sql, daycareId)),
        })
      : ({ ok: false, reason: "not_open" } as const);
    if (!decision.ok) {
      console.info("[kidease-waitlist] listing not open", daycareId, decision.reason);
      return {
        ok: false as const,
        error:
          decision.reason === "closed"
            ? "This daycare closed its waitlist for now."
            : "This listing is not open for a waitlist.",
      };
    }
    const existing = await sql<EntryRow>`
      select id, daycare_id, user_id, age_group, child_label, note, status, joined_at
      from daycare_waitlist
      where daycare_id = ${daycareId} and user_id = ${homeId}
        and status in ('waiting', 'offered')
      limit 1
    `;
    if (existing[0]) return { ok: true as const, id: existing[0].id, already: true };
    const id = nid("wl");
    const child = clip(data.childLabel, 40);
    const note = clip(data.note, 280);
    await sql`
      insert into daycare_waitlist (id, daycare_id, user_id, age_group, child_label, note, status)
      values (${id}, ${daycareId}, ${homeId}, ${age}, ${child || null}, ${note || null}, 'waiting')
    `;
    try {
      const { recordLeadRequest } = await import("@/lib/server/lead-requests");
      await recordLeadRequest(sql, {
        userId: homeId,
        daycareId,
        kind: "waitlist",
        message: note || "I asked to join the waitlist.",
        entry: "waitlist_join",
        ageGroup: age,
        childLabel: child || null,
        sourceKind: "waitlist_interest",
        sourceId: id,
        notify: false,
      });
    } catch (err) {
      console.error("[kidease-lead] waitlist lead skipped", err);
    }
    {
      // KidEase's own CRM (form:waitlist). Also files a default-role parent.
      const { captureFormLead } = await import("@/lib/server/ghl-form-lead");
      await captureFormLead({ form: "waitlist", userId: context.userId, parentAction: true });
    }
    return { ok: true as const, id, already: false };
  });

export const withdrawDaycareWaitlist = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string }) => input)
  .handler(async ({ context, data }) => {
    const id = String(data.id || "").trim();
    if (!id) throw new Error("You are not on this waitlist.");
    const { assertFamilyWrite } = await import("@/lib/server/coparent");
    const homeId = (await assertFamilyWrite(context.userId)).dataUserId;
    const sql = await getSql();
    const rows = await sql<{ daycare_id: string; user_id: string }>`
      select daycare_id, user_id from daycare_waitlist where id = ${id} limit 1
    `;
    const row = rows[0];
    if (!row || row.user_id !== homeId) throw new Error("You are not on this waitlist.");
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
    const { familyScopeFor } = await import("@/lib/server/coparent");
    const homeId = (await familyScopeFor(context.userId)).dataUserId;
    const entries = await sql<EntryRow & { daycare_name: string; slug: string }>`
      select w.id, w.daycare_id, w.user_id, w.age_group, w.child_label, w.note, w.status, w.joined_at,
             d.name as daycare_name, d.slug
      from daycare_waitlist w
      join daycares d on d.id = w.daycare_id
      where w.user_id = ${homeId}
      order by w.joined_at desc
    `;
    const offers = await sql<OfferRow>`
      select id, waitlist_id, daycare_id, user_id, age_group, status, offered_at, expires_at
      from spot_offers
      where user_id = ${homeId}
      order by offered_at desc
    `;
    const byWaitlist = new Map<string, OfferRow>();
    for (const offer of offers) {
      if (!byWaitlist.has(offer.waitlist_id)) byWaitlist.set(offer.waitlist_id, offer);
    }
    const daycareIds = [...new Set(entries.map((row) => row.daycare_id))];
    // Same order the owner sees: staff child, sibling rule, saved order, then sign-up date.
    const places = new Map<string, number>();
    for (const daycareId of daycareIds) {
      const state = await loadState(sql, daycareId);
      const inLine = fairOfferOrder(
        state.entries.filter((row) => row.status === "waiting" || row.status === "offered"),
        { siblingPriority: state.siblingPriority === true, spotAge: "any" },
      );
      inLine.forEach((row, index) => places.set(row.id, index + 1));
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
        place: places.get(row.id) ?? null,
        offerId: offer?.id ?? null,
        offerStatus: offer ? asOfferStatus(offer.status) : null,
        expiresAt: offer ? iso(offer.expires_at) : null,
      };
    });
    return { rows: mine, emailEnabled: spotOfferMailEnabled() };
  });

export const listCentreWaitlist = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { includeTest?: boolean } | undefined) => input ?? {})
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const { lookupUser } = await import("@/lib/server/notify");
    const viewer = await lookupUser(context.userId);
    const includeTest = data?.includeTest === true && isKidEaseOperatorEmail(viewer.email);
    const accessIds = await listAccessibleDaycareIds(sql, context.userId);
    const owned = accessIds.length
      ? await sql.query<{
          id: string;
          name: string;
          slug: string;
          license_number: string | null;
          address: string | null;
          visibility: string | null;
          is_test: number | boolean | null;
          claim_status: string | null;
        }>(
          `select d.id, d.name, d.slug, d.license_number, d.address, d.visibility, d.is_test, d.claim_status
           from daycares d
           where d.id = any($1::text[])`,
          [accessIds],
        )
      : [];
    const centres = new Map<string, { id: string; name: string; slug: string }>();
    for (const row of owned) {
      if (
        !deskWaitlistVisible(listingVisibilityInputFromDb(row), {
          ownedByViewer: true,
          viewerEmail: viewer.email,
        }, includeTest)
      ) {
        continue;
      }
      centres.set(row.id, row);
    }
    const cards: CentreWaitlistCard[] = [];
    for (const centre of centres.values()) {
      if (!(await canCentreWriteLeadsFor(sql, context.userId, centre.id))) continue;
      const state = await loadState(sql, centre.id);
      const events = await readWaitlistEvents(sql, centre.id);
      const people = await sql<EntryRow & { parent_name: string | null }>`
        select w.id, w.daycare_id, w.user_id, w.age_group, w.child_label, w.note, w.status, w.joined_at,
               u.name as parent_name
        from daycare_waitlist w
        left join "user" u on u.id = w.user_id
        where w.daycare_id = ${centre.id}
        order by w.joined_at asc
      `;
      const open = state.offers.find((row) => row.status === "open");
      const byId = new Map(state.entries.map((row) => [row.id, row]));
      const inLine = fairOfferOrder(
        state.entries.filter((row) => row.status === "waiting" || row.status === "offered"),
        { siblingPriority: state.siblingPriority === true, spotAge: "any" },
      );
      const placeById = new Map(inLine.map((row, index) => [row.id, index + 1]));
      const families: CentreWaitlistFamily[] = people.map((row) => {
        const entry = byId.get(row.id);
        return {
          id: row.id,
          userId: row.user_id,
          parentName: String(row.parent_name || "Parent").trim() || "Parent",
          childLabel: String(row.child_label || "").trim(),
          ageGroup: parseSpotAge(row.age_group) ?? "any",
          note: String(row.note || "").trim(),
          status: asStatus(row.status),
          joinedAt: iso(row.joined_at),
          place: placeById.get(row.id) ?? null,
          sibling: entry?.sibling === true,
          staffChild: entry?.staffChild === true,
          rank: entry?.rank ?? null,
        };
      });
      families.sort((a, b) => {
        const pa = a.place ?? 1_000_000;
        const pb = b.place ?? 1_000_000;
        if (pa !== pb) return pa - pb;
        return a.joinedAt.localeCompare(b.joinedAt);
      });
      cards.push({
        daycareId: centre.id,
        daycareName: centre.name,
        slug: centre.slug,
        openOfferId: open?.id ?? null,
        openOfferWaitlistId: open?.waitlistId ?? null,
        openOfferExpiresAt: open?.expiresAt ?? null,
        siblingPriority: state.siblingPriority === true,
        waitlistOpen: waitlistOpenFromEvents(events),
        families,
      });
    }
    // Owner order and tags are free tools on every plan, so they no longer wait on FEATURE_WAITLIST_TOOLS.
    return { centres: cards, emailEnabled: spotOfferMailEnabled(), toolsEnabled: true };
  });

export const sendCentreSpotOffer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { waitlistId?: string; fee?: unknown }) => input)
  .handler(async ({ context, data }) => {
    const { assertRuntimeSwitch } = await import("@/lib/runtime-switches");
    assertRuntimeSwitch("FEATURE_WAITLIST_SPOTS");
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
    const { assertRuntimeSwitch } = await import("@/lib/runtime-switches");
    assertRuntimeSwitch("FEATURE_WAITLIST_SPOTS");
    const offerId = String(data.offerId || "").trim();
    const decision = data.decision === "accept" || data.decision === "decline" ? data.decision : null;
    if (!offerId || !decision) throw new Error("This offer has ended.");
    const { assertFamilyWrite } = await import("@/lib/server/coparent");
    const homeId = (await assertFamilyWrite(context.userId)).dataUserId;
    return respondAsUser({ offerId, userId: homeId, decision });
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

export const rankWaitlistEntry = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; direction?: string }) => ({
    id: String(input?.id || "").trim(),
    direction: input?.direction === "down" ? ("down" as const) : ("up" as const),
  }))
  .handler(async ({ context, data }) => {
    if (!data.id) throw new Error("That family is not waiting.");
    const sql = await getSql();
    const rows = await sql<{ daycare_id: string }>`
      select daycare_id from daycare_waitlist where id = ${data.id} limit 1
    `;
    const daycareId = rows[0]?.daycare_id;
    if (!daycareId || !(await canCentreWriteLeadsFor(sql, context.userId, daycareId))) {
      throw new Error("This listing is not on your desk.");
    }
    const state = await loadState(sql, daycareId);
    const shown = fairOfferOrder(
      state.entries.filter((row) => row.status === "waiting" || row.status === "offered"),
      { siblingPriority: state.siblingPriority === true, spotAge: "any" },
    );
    const next = moveInLine(
      shown.map((row, index) => ({ id: row.id, status: row.status, joinedAt: row.joinedAt, rank: index + 1 })),
      data.id,
      data.direction,
    );
    if (!next) return { ok: false as const, reason: "edge" as const };
    for (const row of next) {
      await sql`update daycare_waitlist set rank_order = ${row.rank}, updated_at = now() where id = ${row.id}`;
    }
    return { ok: true as const };
  });

async function assertDeskWaitlist(sql: Sql, userId: string, daycareId: string) {
  if (!daycareId || !(await canCentreWriteLeadsFor(sql, userId, daycareId))) {
    throw new Error("This listing is not on your desk.");
  }
}

async function logWaitlistEvent(sql: Sql, daycareId: string, action: string, entryId: string | null) {
  await ensureAuditTable(sql);
  await sql`
    insert into waitlist_audit (id, daycare_id, entry_id, place, action, detail)
    values (${nid("wla")}, ${daycareId}, ${entryId}, ${null}, ${action}, ${""})
  `;
}

/** Listing page: is this waitlist open, and may this viewer use a hidden QA listing? */
export const getListingPipelineState = createServerFn({ method: "GET" })
  .validator((input: { daycareId?: string } | undefined) => ({ daycareId: String(input?.daycareId || "").trim() }))
  .handler(async ({ data }) => {
    if (!data.daycareId) return { waitlistOpen: false, fixtureUsable: false };
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
      from daycares where id = ${data.daycareId} limit 1
    `.catch(() => []);
    const row = rows[0];
    const waitlistOpen = waitlistOpenFromEvents(await readWaitlistEvents(sql, data.daycareId));
    if (!row) return { waitlistOpen, fixtureUsable: false };
    const visibility = listingVisibilityInputFromDb(row);
    if (!isHiddenTestListing(visibility)) return { waitlistOpen, fixtureUsable: false };
    const { callerIsTestAccount } = await import("@/lib/server/public-listing");
    return { waitlistOpen, fixtureUsable: await callerIsTestAccount() };
  });

export const setCentreWaitlistOpen = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; open?: boolean }) => ({
    daycareId: String(input?.daycareId || "").trim(),
    open: input?.open !== false,
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await assertDeskWaitlist(sql, context.userId, data.daycareId);
    await logWaitlistEvent(sql, data.daycareId, data.open ? WAITLIST_EVENT.opened : WAITLIST_EVENT.closed, null);
    return { ok: true as const, open: data.open };
  });

export const tagWaitlistFamily = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; tag?: string; on?: boolean }) => ({
    id: String(input?.id || "").trim(),
    tag: input?.tag === "staff_child" ? ("staff_child" as const) : ("sibling" as const),
    on: input?.on === true,
  }))
  .handler(async ({ context, data }) => {
    if (!data.id) throw new Error("That family is not waiting.");
    const sql = await getSql();
    const rows = await sql<{ daycare_id: string }>`
      select daycare_id from daycare_waitlist where id = ${data.id} limit 1
    `;
    const daycareId = rows[0]?.daycare_id || "";
    await assertDeskWaitlist(sql, context.userId, daycareId);
    if (data.tag === "sibling") {
      await sql`update daycare_waitlist set sibling = ${data.on ? 1 : 0}, updated_at = now() where id = ${data.id}`;
    } else {
      await logWaitlistEvent(sql, daycareId, data.on ? WAITLIST_EVENT.staffOn : WAITLIST_EVENT.staffOff, data.id);
    }
    return { ok: true as const };
  });

/** Save the whole order at once (drag or up/down on the desk). */
export const saveWaitlistOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; ids?: unknown }) => ({
    daycareId: String(input?.daycareId || "").trim(),
    ids: Array.isArray(input?.ids) ? input.ids.slice(0, 500).map((id) => String(id || "")) : [],
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await assertDeskWaitlist(sql, context.userId, data.daycareId);
    const line = await sql<{ id: string }>`
      select id from daycare_waitlist
      where daycare_id = ${data.daycareId} and status in ('waiting', 'offered')
    `;
    const order = orderFromIds(data.ids, new Set(line.map((row) => row.id)));
    for (const row of order) {
      await sql`update daycare_waitlist set rank_order = ${row.rank}, updated_at = now() where id = ${row.id}`;
    }
    return { ok: true as const, saved: order.length };
  });

/** Open spot for one age: offer it to the top waiting family for 48 hours. */
export const offerSpotToNextFamily = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; ageGroup?: string; fee?: unknown }) => input)
  .handler(async ({ context, data }) => {
    const { assertRuntimeSwitch } = await import("@/lib/runtime-switches");
    assertRuntimeSwitch("FEATURE_WAITLIST_SPOTS");
    const blocked = rejectWaitlistFee(data);
    if (blocked) throw new Error(blocked);
    const daycareId = String(data.daycareId || "").trim();
    const age = parseSpotAge(data.ageGroup);
    if (!age) throw new Error("Choose an age group.");
    const sql = await getSql();
    await assertDeskWaitlist(sql, context.userId, daycareId);
    const before = await loadState(sql, daycareId);
    const step = offerNextForAge(before, daycareId, age, Date.now(), () => nid("so"));
    await persistStep(sql, before, step.state, step.createdOffers);
    const sent = await notifyCreated(sql, step.createdOffers);
    if (!step.ok) throw new Error(step.error || "No family is waiting for this age group.");
    const offer = step.createdOffers[step.createdOffers.length - 1];
    return {
      ok: true as const,
      waitlistId: offer?.waitlistId ?? null,
      expiresAt: offer?.expiresAt ?? null,
      emailed: sent,
      emailEnabled: spotOfferMailEnabled(),
    };
  });
