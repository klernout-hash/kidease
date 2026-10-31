import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { centreCanWriteCare } from "@/lib/centre-roles";
import {
  careStatusBody,
  isEnrolledBookingStatus,
  journalPostReady,
  normalizeJournalBody,
  parseJournalPhotos,
  serializeJournalPhotos,
  todayYmd,
  type JournalPhoto,
} from "@/lib/daily-care";
import { privatePhotoFeedEnabled } from "@/lib/features";
import { classroomPhotoAllowed } from "@/lib/private-photo-feed";
import { nid } from "@/lib/utils";
import { loadCentreRole } from "./centre-access";
import { lookupUser, notifyThreadParty } from "./notify";
import { markConversationRead } from "./thread-access";

export type DailyJournalRow = {
  id: string;
  daycareId: string;
  daycareName: string;
  bookingId: string | null;
  conversationId: string | null;
  childId: string | null;
  childName: string;
  parentUserId: string | null;
  authorUserId: string;
  day: string;
  body: string;
  photos: JournalPhoto[];
  createdAt: string;
};

async function ensureJournalTable(sql: Awaited<ReturnType<typeof getSql>>) {
  if (!import.meta.env.SSR) return;
  const { ensureDailyJournals } = await import("./runtime-schema");
  await ensureDailyJournals(sql);
}

async function postCareThreadNotice(input: {
  sql: Awaited<ReturnType<typeof getSql>>;
  conversationId: string | null;
  daycareId: string;
  daycareName: string;
  parentUserId: string | null;
  body: string;
  actorUserId: string;
}) {
  const conversationId = (input.conversationId || "").trim();
  if (!conversationId) return;
  await input.sql`
    insert into messages (id, conversation_id, sender, body, kind)
    values (${nid("msg")}, ${conversationId}, ${"system"}, ${input.body}, ${"status"})
  `.catch(() => undefined);
  await input.sql`update conversations set last_at = now() where id = ${conversationId}`.catch(() => undefined);
  await markConversationRead(input.sql, conversationId, input.actorUserId).catch(() => undefined);

  const origin = process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://kidease.ca";
  const threadUrl = `${origin}/inbox/${conversationId}`;
  const parent = input.parentUserId ? await lookupUser(input.parentUserId).catch(() => ({ email: null, name: null })) : null;
  if (parent?.email) {
    void notifyThreadParty({
      to: parent.email,
      name: parent.name,
      subject: `Daily care update from ${input.daycareName}`,
      preview: input.body.slice(0, 240),
      threadUrl,
      daycareName: input.daycareName,
    }).catch(() => undefined);
  }
}

export async function insertCareStatusMessage(input: {
  conversationId: string | null;
  daycareId: string;
  daycareName: string;
  parentUserId: string | null;
  body: string;
  actorUserId: string;
}) {
  const sql = await getSql();
  await postCareThreadNotice({ sql, ...input });
}

export const listDailyJournals = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input?: { daycareId?: string; day?: string; bookingId?: string }) => ({
    daycareId: String(input?.daycareId || "").trim() || undefined,
    day: String(input?.day || "").trim() || undefined,
    bookingId: String(input?.bookingId || "").trim() || undefined,
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureJournalTable(sql);
    const day = data.day && /^\d{4}-\d{2}-\d{2}$/.test(data.day) ? data.day : todayYmd();
    const params: unknown[] = [day, context.userId];
    let extra = "";
    if (data.daycareId) {
      params.push(data.daycareId);
      extra += ` and j.daycare_id = $${params.length}`;
    }
    if (data.bookingId) {
      params.push(data.bookingId);
      extra += ` and j.booking_id = $${params.length}`;
    }
    const parentClause = privatePhotoFeedEnabled()
      ? `j.parent_user_id = $2
             and exists (
               select 1 from bookings b
               where b.user_id = $2
                 and b.daycare_id = j.daycare_id
                 and b.status in ('accepted', 'active')
             )`
      : `j.parent_user_id = $2`;
    const rows = await sql
      .query<{
        id: string;
        daycare_id: string;
        daycare_name: string;
        booking_id: string | null;
        conversation_id: string | null;
        child_id: string | null;
        child_name: string;
        parent_user_id: string | null;
        author_user_id: string;
        day: string;
        body: string;
        photos: unknown;
        created_at: string;
      }>(
        `select j.id, j.daycare_id, d.name as daycare_name, j.booking_id, j.conversation_id,
                j.child_id, j.child_name, j.parent_user_id, j.author_user_id,
                j.day::text as day, j.body, j.photos, j.created_at::text as created_at
         from daily_journals j
         join daycares d on d.id = j.daycare_id
         where j.day = $1
           and (
             ${parentClause}
             or j.author_user_id = $2
             or j.daycare_id in (select daycare_id from provider_daycares where user_id = $2)
             or j.daycare_id in (
               select daycare_id from centre_members
               where user_id = $2 and status = 'active'
             )
           )${extra}
         order by j.created_at desc`,
        params,
      )
      .catch(() => []);

    const items: DailyJournalRow[] = rows.map((r) => ({
      id: r.id,
      daycareId: r.daycare_id,
      daycareName: r.daycare_name,
      bookingId: r.booking_id,
      conversationId: r.conversation_id,
      childId: r.child_id,
      childName: r.child_name,
      parentUserId: r.parent_user_id,
      authorUserId: r.author_user_id,
      day: r.day,
      body: r.body || "",
      photos: parseJournalPhotos(r.photos),
      createdAt: r.created_at,
    }));
    return { day, items };
  });

export const postDailyJournal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      daycareId: string;
      bookingId?: string | null;
      conversationId?: string | null;
      childId?: string | null;
      childName: string;
      parentUserId?: string | null;
      day?: string;
      body: string;
      photos?: JournalPhoto[];
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureJournalTable(sql);
    const daycareId = String(data.daycareId || "").trim();
    const childName = String(data.childName || "").trim();
    if (!daycareId || !childName) throw new Error("Pick a child");
    const role = await loadCentreRole(sql, context.userId, daycareId);
    if (!centreCanWriteCare(role)) throw new Error("Staff only");

    const bookingId = String(data.bookingId || "").trim() || null;
    if (bookingId) {
      const booking = await sql<{ id: string; user_id: string; status: string; conversation_id: string | null; child_id: string | null }>`
        select id, user_id, status, conversation_id, child_id
        from bookings
        where id = ${bookingId} and daycare_id = ${daycareId}
        limit 1
      `;
      if (!booking[0] || !isEnrolledBookingStatus(booking[0].status)) {
        throw new Error("Journal is for enrolled children");
      }
    }

    const photos = parseJournalPhotos(data.photos ?? []);
    const body = normalizeJournalBody(data.body);
    if (privatePhotoFeedEnabled() && photos.length) {
      const bookingIdForPhoto = String(data.bookingId || "").trim();
      const consent = bookingIdForPhoto
        ? await sql<{ status: string; photo_consent_at: string | Date | null }>`
            select status, photo_consent_at from bookings
            where id = ${bookingIdForPhoto} and daycare_id = ${daycareId}
            limit 1
          `.catch(() => [])
        : [];
      const row = consent[0];
      const consentAt = row?.photo_consent_at instanceof Date ? row.photo_consent_at.toISOString() : row?.photo_consent_at || null;
      const allowed = classroomPhotoAllowed({
        enabled: true,
        enrolled: Boolean(row && isEnrolledBookingStatus(row.status)),
        consentAt,
        photoCount: photos.length,
      });
      if (!allowed.ok) {
        throw new Error(allowed.reason === "consent" ? "Photo consent is needed first" : "Photos are for enrolled children");
      }
    }
    if (!journalPostReady({ body, photos })) throw new Error("Add a note or a photo");

    const day = data.day && /^\d{4}-\d{2}-\d{2}$/.test(data.day) ? data.day : todayYmd();
    const id = nid("dj");
    const parentUserId = String(data.parentUserId || "").trim() || null;
    const conversationId = String(data.conversationId || "").trim() || null;
    const childId = String(data.childId || "").trim() || null;

    await sql`
      insert into daily_journals (
        id, daycare_id, booking_id, conversation_id, child_id, child_name,
        parent_user_id, author_user_id, day, body, photos
      )
      values (
        ${id}, ${daycareId}, ${bookingId}, ${conversationId}, ${childId}, ${childName},
        ${parentUserId}, ${context.userId}, ${day}, ${body}, ${serializeJournalPhotos(photos)}::jsonb
      )
    `;

    const centre = await sql<{ name: string }>`select name from daycares where id = ${daycareId} limit 1`;
    const daycareName = centre[0]?.name || "the centre";
    await postCareThreadNotice({
      sql,
      conversationId,
      daycareId,
      daycareName,
      parentUserId,
      body: careStatusBody({ kind: "journal", childName, daycareName }),
      actorUserId: context.userId,
    });

    return { ok: true as const, id };
  });

export const photoFeedGate = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!privatePhotoFeedEnabled()) return { enabled: false as const, bookingId: null };
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      select id from bookings
      where user_id = ${context.userId} and status in ('accepted', 'active')
      order by created_at desc
      limit 1
    `.catch(() => [] as { id: string }[]);
    return { enabled: true as const, bookingId: rows[0]?.id ?? null };
  });

export const grantPhotoConsent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { bookingId: string }) => input)
  .handler(async ({ context, data }) => {
    if (!privatePhotoFeedEnabled()) return { ok: false as const };
    const sql = await getSql();
    const wrote = await sql<{ id: string }>`
      update bookings
      set photo_consent_at = now()
      where id = ${data.bookingId}
        and user_id = ${context.userId}
        and status in ('accepted', 'active')
      returning id
    `.catch(() => [] as { id: string }[]);
    if (!wrote[0]) throw new Error("Enrolment not found");
    return { ok: true as const };
  });
