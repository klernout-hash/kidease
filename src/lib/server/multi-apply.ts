import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { catalogByIdGet } from "@/lib/catalog";
import { getSql } from "@/lib/db";
import { isAdminOnlyListing } from "@/lib/listing-visibility";
import {
  MULTI_APPLY_MAX,
  childKey,
  planMultiApply,
  type MultiSkipReason,
} from "@/lib/multi-apply";
import { callerMayUseAdminOnlyListing } from "@/lib/server/public-listing";
import { centreCanAcceptInquiry } from "@/lib/server/provider-entitlements";
import { recordLeadRequest } from "@/lib/server/lead-requests";
import { upsertDaycare } from "@/lib/server/seed";
import { fromPrice, mapDaycare, type DaycareRow } from "@/lib/server/map-row";
import { lookupUser, notifyPlatform } from "@/lib/server/notify";
import {
  centreAckMessage,
  formatStart,
  pushNewRequest,
  scheduleLabel,
  systemRequestMessage,
} from "@/lib/templates";
import type { Locale, Schedule } from "@/lib/types";
import { ageGroupFromMonths, monthsBetween, nid } from "@/lib/utils";

type SentRow = { daycareId: string; bookingId: string; conversationId: string };
type SkipRow = { daycareId: string; reason: MultiSkipReason };

export type MultiApplyResponse = {
  ok: boolean;
  sent: SentRow[];
  skipped: SkipRow[];
  error?: "consent" | "rate" | "empty" | "too_many" | "details";
};

export const createMultiSpotRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      daycareIds: string[];
      childName?: string;
      birthdate?: string;
      ageGroup?: string;
      startDate: string;
      schedule: Schedule;
      subsidyInterest: boolean;
      message?: string;
      shareConsent: boolean;
      locale?: Locale;
    }) => input,
  )
  .handler(async ({ context, data }): Promise<MultiApplyResponse> => {
    const sql = await getSql();
    const ids = [...new Set((data.daycareIds || []).map((id) => String(id || "").trim()).filter(Boolean))].slice(
      0,
      MULTI_APPLY_MAX + 1,
    );
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recent = await sql<{ n: number }>`
      select count(*)::int as n from bookings
      where user_id = ${context.userId} and created_at >= ${since}
    `;
    const childName = String(data.childName || "").trim();
    const birthdate = String(data.birthdate || "").trim();
    const ageGroup = String(data.ageGroup || "").trim();
    const dupSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const dups = await sql<{ daycare_id: string; name: string; birthdate: string; created_at: string }>`
      select b.daycare_id, c.name, c.birthdate::text as birthdate, b.created_at
      from bookings b
      join children c on c.id = b.child_id
      where b.user_id = ${context.userId}
        and b.created_at >= ${dupSince}
        and b.status <> 'cancelled'
    `;
    const loaded: Array<{ id: string; live: boolean; row: DaycareRow | null }> = [];
    const admin = await callerMayUseAdminOnlyListing();
    for (const id of ids) {
      const listed = await catalogByIdGet(id);
      if (isAdminOnlyListing(listed ?? { id }) && !admin) {
        loaded.push({ id, live: false, row: null });
        continue;
      }
      if (listed) await upsertDaycare(sql, listed);
      const rows = await sql<DaycareRow>`select * from daycares where id = ${id} limit 1`;
      const row = rows[0] ?? null;
      loaded.push({ id, live: row ? mapDaycare(row).live : false, row });
    }
    const planned = planMultiApply({
      daycareIds: ids,
      centres: loaded.map((item) => ({ id: item.id, live: item.live })),
      shareConsent: data.shareConsent === true,
      childName,
      birthdate,
      ageGroup,
      startDate: data.startDate,
      recentRequestCount: recent[0]?.n ?? 0,
      recentChildCentres: dups.map((row) => ({
        daycareId: row.daycare_id,
        childKey: childKey(row.name || "", String(row.birthdate).slice(0, 10)),
        sentAt: row.created_at,
      })),
    });
    if (planned.error) return { ok: false, sent: [], skipped: planned.skipped, error: planned.error };

    const schedule: Schedule = data.schedule === "part" ? "part" : "full";
    const locale: Locale = data.locale === "fr" ? "fr" : "en";
    const users = await sql<{ name: string }>`select name from "user" where id = ${context.userId} limit 1`;
    const parentName = (users[0]?.name || "A parent").trim() || "A parent";
    const actor = await lookupUser(context.userId);
    const note = (data.message || "").trim();
    const subsidyLine =
      locale === "fr"
        ? data.subsidyInterest
          ? "Intérêt pour une subvention ou le 10 $ par jour : oui."
          : "Intérêt pour une subvention ou le 10 $ par jour : non."
        : data.subsidyInterest
          ? "Subsidy or $10-a-day interest: yes."
          : "Subsidy or $10-a-day interest: no.";
    const parentNote = [note, subsidyLine].filter(Boolean).join("\n");
    const batchId = nid("batch");
    const sent: SentRow[] = [];
    const skipped: SkipRow[] = [...planned.skipped];
    const childId: string | null = null;
    const { parseSpotAge, spotAgePublicLabel } = await import("@/lib/spot-offers");
    const parsedAge =
      parseSpotAge(ageGroup) ??
      (/^\d{4}-\d{2}-\d{2}$/.test(birthdate) ? ageGroupFromMonths(monthsBetween(birthdate)) : null);

    for (const daycareId of planned.sendIds) {
      const row = loaded.find((item) => item.id === daycareId)?.row;
      if (!row) {
        skipped.push({ daycareId, reason: "missing" });
        continue;
      }
      const gate = await centreCanAcceptInquiry(sql, daycareId);
      if (!gate.ok) {
        skipped.push({ daycareId, reason: "cap" });
        continue;
      }
      const d = mapDaycare(row);
      const priced = parsedAge && parsedAge !== "any" ? parsedAge : null;
      const priceMap = { infant: d.infantMonthly, toddler: d.toddlerMonthly, preschool: d.preschoolMonthly };
      let amount = (priced ? priceMap[priced] : null) ?? fromPrice(d);
      if (schedule === "part") amount = d.partTimeMonthly ?? Math.round(amount * 0.6);
      const ageLabel = parsedAge ? spotAgePublicLabel(parsedAge, locale) : locale === "fr" ? "Tout âge" : "Any age";
      const copy = {
        parentName,
        childName: ageLabel,
        age: ageLabel,
        dob: "",
        daycareName: d.name,
        start: formatStart(data.startDate, locale),
        schedule: scheduleLabel(schedule, null, locale),
        note: parentNote,
      };
      const convoId = nid("cv");
      await sql`
        insert into conversations (id, user_id, daycare_id)
        values (${convoId}, ${context.userId}, ${daycareId})
        on conflict (user_id, daycare_id) do nothing
      `;
      const convos = await sql<{ id: string }>`
        select id from conversations where user_id = ${context.userId} and daycare_id = ${daycareId}
      `;
      const cid = convos[0]?.id ?? convoId;
      const bookingId = nid("bk");
      await sql`
        insert into bookings (
          id, user_id, daycare_id, child_id, start_month, schedule, age_group, status, monthly_amount,
          parent_note, conversation_id, start_date, parent_name, subsidy_interest, share_consent_at, batch_id
        ) values (
          ${bookingId}, ${context.userId}, ${daycareId}, ${childId},
          ${data.startDate.slice(0, 7)}, ${schedule}, ${parsedAge ?? "any"}, ${"requested"}, ${amount},
          ${parentNote}, ${cid}, ${data.startDate}, ${parentName},
          ${Boolean(data.subsidyInterest)}, ${new Date().toISOString()}, ${batchId}
        )
      `;
      try {
        await recordLeadRequest(sql, {
          userId: context.userId,
          daycareId,
          kind: "spot_inquiry",
          message: parentNote,
          sourceKind: "booking",
          sourceId: bookingId,
          conversationId: cid,
          notify: false,
        });
      } catch (err) {
        console.error("[kidease-lead] multi-apply lead skipped", err);
      }
      const notify = pushNewRequest(copy, locale);
      await sql`
        insert into messages (id, conversation_id, sender, body, kind)
        values (${nid("msg")}, ${cid}, ${"system"}, ${systemRequestMessage(copy, locale)}, ${"system"})
      `;
      await sql`
        insert into messages (id, conversation_id, sender, body, kind)
        values (${nid("msg")}, ${cid}, ${"system"}, ${`${notify.title}\n${notify.body}`}, ${"notify"})
      `;
      await sql`
        insert into messages (id, conversation_id, sender, body, kind)
        values (${nid("msg")}, ${cid}, ${"provider"}, ${centreAckMessage(copy, locale)}, ${"chat"})
      `;
      await sql`update conversations set last_at = now() where id = ${cid}`;
      try {
        await notifyPlatform({
          kind: "spot_request",
          daycareName: d.name,
          address: d.address,
          city: d.city,
          province: d.province,
          slug: d.slug,
          actorName: parentName || actor.name,
          actorEmail: actor.email,
          detail: [`Age group: ${parsedAge ? spotAgePublicLabel(parsedAge, locale) : ""}`, `Start: ${data.startDate}`, `Schedule: ${schedule}`, parentNote]
            .filter(Boolean)
            .join("\n"),
        });
      } catch (err) {
        console.error("[kidease-mail] multi-apply notify failed", err);
      }
      sent.push({ daycareId, bookingId, conversationId: cid });
    }

    return { ok: sent.length > 0, sent, skipped: skipped.filter((row) => !sent.some((item) => item.daycareId === row.daycareId)) };
  });
