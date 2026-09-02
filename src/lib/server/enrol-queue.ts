import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { mapChild, type ChildRow } from "@/lib/child-profile";
import type { AgeGroup, BookingStatus, Child, Schedule, SpotRequest } from "@/lib/types";
import { createSpotRequest, updateRequestStatus } from "@/lib/server/family";

const OPEN: BookingStatus[] = ["requested", "under_review", "waitlist"];

type IncomingRow = {
  id: string;
  daycare_id: string;
  daycare_name: string;
  slug: string;
  child_id: string | null;
  child_name: string | null;
  birthdate: string | null;
  start_month: string;
  start_date: string | null;
  schedule: Schedule;
  days: string | null;
  parent_note: string | null;
  parent_name: string | null;
  conversation_id: string | null;
  age_group: AgeGroup;
  status: BookingStatus;
  monthly_amount: number;
  created_at: string;
  payment_status: string | null;
  allergies: string | null;
  epi_pen: boolean | number | string | null;
};

function mapRequest(b: IncomingRow, child: Child | null): SpotRequest {
  return {
    id: b.id,
    daycareId: b.daycare_id,
    daycareName: b.daycare_name,
    daycareSlug: b.slug,
    childId: b.child_id,
    childName: b.child_name,
    startMonth: b.start_month,
    startDate: b.start_date,
    schedule: b.schedule,
    days: b.days,
    parentNote: b.parent_note,
    parentName: b.parent_name,
    conversationId: b.conversation_id,
    ageGroup: b.age_group,
    status: b.status,
    monthlyAmount: b.monthly_amount,
    createdAt: String(b.created_at),
    paymentStatus: b.payment_status,
    birthdate: b.birthdate,
    allergies: b.allergies ?? child?.allergies ?? "",
    epiPen: Boolean(
      b.epi_pen === true || b.epi_pen === 1 || b.epi_pen === "t" || b.epi_pen === "true" || child?.epiPen,
    ),
    child,
  };
}

export const listDaycareIncoming = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const owned = await sql<{ daycare_id: string }>`
      select daycare_id from provider_daycares where user_id = ${context.userId}
    `;
    if (!owned.length) return [] as SpotRequest[];

    const rows = await sql<IncomingRow>`
      select b.id, b.daycare_id, d.name as daycare_name, d.slug, b.child_id,
             ch.name as child_name, ch.birthdate, ch.allergies, ch.epi_pen,
             b.start_month, b.start_date, b.schedule, b.days, b.parent_note, b.parent_name,
             b.conversation_id, b.age_group, b.status, b.monthly_amount, b.created_at,
             (select p.status from payments p where p.booking_id = b.id order by p.created_at desc limit 1) as payment_status
      from bookings b
      join daycares d on d.id = b.daycare_id
      join provider_daycares pd on pd.daycare_id = b.daycare_id and pd.user_id = ${context.userId}
      left join children ch on ch.id = b.child_id
      order by
        case when b.status in ('requested','under_review') then 0 else 1 end,
        b.created_at desc
      limit 80
    `;

    const childIds = [...new Set(rows.map((r) => r.child_id).filter(Boolean))] as string[];
    const kids = childIds.length
      ? await sql.query<ChildRow>(
          `select id, name, preferred_name, birthdate, allergies, epi_pen, medical_notes, medications,
                  doctor_name, doctor_phone, foods_like, foods_avoid, diet, likes, comfort_item, nap_routine,
                  toilet, home_language, soothes, fears, emergency_name, emergency_phone, pickup_people,
                  photo_ok, sunscreen_ok, notes
           from children where id = any($1::text[])`,
          [childIds],
        )
      : [];
    const byId = new Map(kids.map((k) => [k.id, mapChild(k)]));
    return rows.map((r) => mapRequest(r, r.child_id ? byId.get(r.child_id) ?? null : null));
  });

export const decideParentRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { bookingId: string; decision: "approve" | "decline" | "waiting" }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ id: string; daycare_id: string }>`
      select b.id, b.daycare_id from bookings b
      join provider_daycares p on p.daycare_id = b.daycare_id
      where b.id = ${data.bookingId} and p.user_id = ${context.userId}
      limit 1
    `;
    if (!rows[0]) throw new Error("Request not found for this centre");
    const status: BookingStatus =
      data.decision === "approve" ? "accepted" : data.decision === "decline" ? "declined" : "under_review";
    return updateRequestStatus({ data: { bookingId: data.bookingId, status } });
  });

export const shareChildWithCentres = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { childId: string; daycareIds: string[]; startDate?: string; message?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const kids = await sql<ChildRow>`
      select id, name, preferred_name, birthdate, allergies, epi_pen, medical_notes, medications,
             doctor_name, doctor_phone, foods_like, foods_avoid, diet, likes, comfort_item, nap_routine,
             toilet, home_language, soothes, fears, emergency_name, emergency_phone, pickup_people,
             photo_ok, sunscreen_ok, notes
      from children where id = ${data.childId} and user_id = ${context.userId} limit 1
    `;
    const kid = kids[0];
    if (!kid) throw new Error("Child not found");
    const child = mapChild(kid);
    const parent = await sql<{ name: string | null }>`select name from "user" where id = ${context.userId} limit 1`;
    const start =
      data.startDate && /^\d{4}-\d{2}-\d{2}$/.test(data.startDate) ? data.startDate : defaultStart();
    const noteBits = [
      data.message?.trim(),
      child.allergies ? `Allergies: ${child.allergies}` : "",
      child.epiPen ? "Carries an EpiPen" : "",
      child.medicalNotes ? `Medical: ${child.medicalNotes}` : "",
      child.emergencyName ? `Emergency: ${child.emergencyName} ${child.emergencyPhone}` : "",
    ].filter(Boolean);
    const sent: Array<{ daycareId: string; bookingId: string; conversationId: string; reused: boolean }> = [];

    for (const daycareId of [...new Set(data.daycareIds.map((id) => id.trim()).filter(Boolean))]) {
      const existing = await sql<{ id: string; conversation_id: string | null; status: BookingStatus }>`
        select id, conversation_id, status from bookings
        where user_id = ${context.userId} and daycare_id = ${daycareId} and child_id = ${child.id}
          and status in ('requested','under_review','waitlist','accepted')
        order by created_at desc limit 1
      `;
      if (existing[0]) {
        sent.push({
          daycareId,
          bookingId: existing[0].id,
          conversationId: existing[0].conversation_id ?? "",
          reused: true,
        });
        continue;
      }
      const res = await createSpotRequest({
        data: {
          daycareId,
          childId: child.id,
          childName: child.name,
          birthdate: child.birthdate,
          startDate: start,
          schedule: "full",
          days: [],
          message: noteBits.join(" · ") || undefined,
          parentName: parent[0]?.name ?? undefined,
        },
      });
      sent.push({
        daycareId,
        bookingId: res.id,
        conversationId: res.conversationId,
        reused: false,
      });
    }
    return { ok: true as const, sent, childName: child.name };
  });

export function isWaitingOnDaycare(status: BookingStatus) {
  return OPEN.includes(status);
}

function defaultStart() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
