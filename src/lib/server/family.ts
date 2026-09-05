import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "@/lib/utils";
import { ensureSeed, upsertDaycare } from "./seed";
import { lookupUser, notifyAccountCreated, notifyPlatform, notifyProviderJoined } from "./notify";
import { resolveSessionDesks, writeProfileRole } from "./roles";
import { catalogByIdGet } from "@/lib/catalog";
import { isAdminOnlyListing } from "@/lib/listing-visibility";
import { callerIsAdmin } from "@/lib/server/public-listing";
import { fromPrice, mapDaycare, spotsTotal, type DaycareRow } from "./map-row";
import { emptyChild, mapChild, type ChildRow } from "@/lib/child-profile";
import type { AgeGroup, Booking, BookingStatus, Child, Conversation, Locale, Message, Payment, PayMethod, Schedule } from "@/lib/types";
import {
  centreAckMessage,
  emailBodyNewRequest,
  emailSubjectNewRequest,
  formatAgeLabel,
  formatStart,
  pushNewRequest,
  scheduleLabel,
  spotConfirmedMessage,
  statusUpdateMessage,
  systemRequestMessage,
} from "@/lib/templates";
import { ageGroupFromMonths, monthsBetween } from "@/lib/utils";
import { stripeChargesLive } from "@/lib/stripe-live";

async function ensureProfile(sql: Awaited<ReturnType<typeof getSql>>, userId: string) {
  const inserted = await sql<{ user_id: string }>`
    insert into profiles (user_id, role) values (${userId}, 'parent')
    on conflict (user_id) do nothing
    returning user_id
  `;
  return Boolean(inserted[0]);
}

async function pingNewAccount(userId: string, role: "parent" | "provider") {
  const actor = await lookupUser(userId);
  try {
    if (role === "provider") {
      await notifyProviderJoined({
        kind: "signup",
        providerName: actor.name,
        providerEmail: actor.email,
      });
      return;
    }
    await notifyAccountCreated({
      name: actor.name,
      email: actor.email,
      role: "parent",
    });
  } catch (err) {
    console.error("[kidease-mail] account notify failed", err);
  }
}

export const getFamily = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await ensureSeed(sql);
    const isNew = await ensureProfile(sql, context.userId);
    if (isNew) await pingNewAccount(context.userId, "parent");
    const children = await sql<ChildRow>`
      select id, name, preferred_name, birthdate, allergies, epi_pen, medical_notes, medications,
             doctor_name, doctor_phone, foods_like, foods_avoid, diet, likes, comfort_item, nap_routine,
             toilet, home_language, soothes, fears, emergency_name, emergency_phone, pickup_people,
             photo_ok, sunscreen_ok, notes
      from children where user_id = ${context.userId} order by created_at
    `;
    const saved = await sql<DaycareRow>`
      select d.* from daycares d
      join saved_daycares s on s.daycare_id = d.id
      where s.user_id = ${context.userId}
      order by s.created_at desc
    `;
    const bookings = await sql<{
      id: string;
      daycare_id: string;
      name: string;
      slug: string;
      child_id: string | null;
      child_name: string | null;
      start_month: string;
      start_date: string | null;
      schedule: Schedule;
      days: string | null;
      parent_note: string | null;
      parent_name: string | null;
      conversation_id: string | null;
      age_group: AgeGroup;
      status: Booking["status"];
      monthly_amount: number;
      created_at: string;
      payment_status: string | null;
    }>`
      select b.id, b.daycare_id, d.name, d.slug, b.child_id, ch.name as child_name,
             b.start_month, b.start_date, b.schedule, b.days, b.parent_note, b.parent_name,
             b.conversation_id, b.age_group, b.status, b.monthly_amount, b.created_at,
             (select p.status from payments p where p.booking_id = b.id order by p.created_at desc limit 1) as payment_status
      from bookings b
      join daycares d on d.id = b.daycare_id
      left join children ch on ch.id = b.child_id
      where b.user_id = ${context.userId}
      order by b.created_at desc
    `;
    const payments = await sql<{
      id: string;
      daycare_id: string;
      name: string;
      amount: number;
      method: PayMethod;
      status: string;
      reference: string | null;
      created_at: string;
      invoice_id: string | null;
    }>`
      select p.id, p.daycare_id, d.name, p.amount, p.method, p.status, p.reference, p.created_at, p.invoice_id
      from payments p join daycares d on d.id = p.daycare_id
      where p.user_id = ${context.userId}
      order by p.created_at desc
    `.catch(async () =>
      sql<{
        id: string;
        daycare_id: string;
        name: string;
        amount: number;
        method: PayMethod;
        status: string;
        reference: string | null;
        created_at: string;
        invoice_id: string | null;
      }>`
        select p.id, p.daycare_id, d.name, p.amount, p.method, p.status, p.reference, p.created_at,
               null as invoice_id
        from payments p join daycares d on d.id = p.daycare_id
        where p.user_id = ${context.userId}
        order by p.created_at desc
      `,
    );
    const profile = await sql<{ role: string }>`
      select role from profiles where user_id = ${context.userId}
    `;
    const admin = await callerIsAdmin();
    return {
      role: (profile[0]?.role === "admin" ? "admin" : profile[0]?.role === "provider" ? "provider" : "parent") as
        | "parent"
        | "provider"
        | "admin",
      children: children.map(mapChild),
      saved: saved
        .map((r) => {
          const d = mapDaycare(r);
          return { ...d, spotsTotal: spotsTotal(d), fromPrice: fromPrice(d), distanceKm: 0 };
        })
        .filter((d) => admin || !isAdminOnlyListing(d)),
      bookings: bookings.map((b) => ({
        id: b.id,
        daycareId: b.daycare_id,
        daycareName: b.name,
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
      })),
      payments: payments.map((p) => ({
        id: p.id,
        daycareId: p.daycare_id,
        daycareName: p.name,
        amount: p.amount,
        method: p.method,
        status: p.status,
        reference: p.reference,
        createdAt: String(p.created_at),
        invoiceId: p.invoice_id,
      })),
    };
  });

type ChildWrite = Omit<Child, "id">;

function childFields(data: ChildWrite) {
  return {
    name: data.name.trim(),
    preferredName: data.preferredName?.trim() || null,
    birthdate: data.birthdate,
    allergies: data.allergies?.trim() || null,
    epiPen: Boolean(data.epiPen),
    medicalNotes: data.medicalNotes?.trim() || null,
    medications: data.medications?.trim() || null,
    doctorName: data.doctorName?.trim() || null,
    doctorPhone: data.doctorPhone?.trim() || null,
    foodsLike: data.foodsLike?.trim() || null,
    foodsAvoid: data.foodsAvoid?.trim() || null,
    diet: data.diet?.trim() || null,
    likes: data.likes?.trim() || null,
    comfortItem: data.comfortItem?.trim() || null,
    napRoutine: data.napRoutine?.trim() || null,
    toilet: data.toilet || null,
    homeLanguage: data.homeLanguage?.trim() || null,
    soothes: data.soothes?.trim() || null,
    fears: data.fears?.trim() || null,
    emergencyName: data.emergencyName?.trim() || null,
    emergencyPhone: data.emergencyPhone?.trim() || null,
    pickupPeople: data.pickupPeople?.trim() || null,
    photoOk: Boolean(data.photoOk),
    sunscreenOk: data.sunscreenOk !== false,
    notes: data.notes?.trim() || null,
  };
}

export const addChild = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: ChildWrite) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = nid("ch");
    const f = childFields({ ...emptyChild(), ...data });
    if (!f.name || !f.birthdate) throw new Error("Name and birthdate are required");
    await sql`
      insert into children (
        id, user_id, name, preferred_name, birthdate, allergies, epi_pen, medical_notes, medications,
        doctor_name, doctor_phone, foods_like, foods_avoid, diet, likes, comfort_item, nap_routine,
        toilet, home_language, soothes, fears, emergency_name, emergency_phone, pickup_people,
        photo_ok, sunscreen_ok, notes
      ) values (
        ${id}, ${context.userId}, ${f.name}, ${f.preferredName}, ${f.birthdate}, ${f.allergies},
        ${f.epiPen}, ${f.medicalNotes}, ${f.medications}, ${f.doctorName}, ${f.doctorPhone},
        ${f.foodsLike}, ${f.foodsAvoid}, ${f.diet}, ${f.likes}, ${f.comfortItem}, ${f.napRoutine},
        ${f.toilet}, ${f.homeLanguage}, ${f.soothes}, ${f.fears}, ${f.emergencyName}, ${f.emergencyPhone},
        ${f.pickupPeople}, ${f.photoOk}, ${f.sunscreenOk}, ${f.notes}
      )
    `;
    return { id };
  });

export const updateChild = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Child) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const f = childFields(data);
    if (!f.name || !f.birthdate) throw new Error("Name and birthdate are required");
    const rows = await sql<{ id: string }>`
      update children set
        name = ${f.name},
        preferred_name = ${f.preferredName},
        birthdate = ${f.birthdate},
        allergies = ${f.allergies},
        epi_pen = ${f.epiPen},
        medical_notes = ${f.medicalNotes},
        medications = ${f.medications},
        doctor_name = ${f.doctorName},
        doctor_phone = ${f.doctorPhone},
        foods_like = ${f.foodsLike},
        foods_avoid = ${f.foodsAvoid},
        diet = ${f.diet},
        likes = ${f.likes},
        comfort_item = ${f.comfortItem},
        nap_routine = ${f.napRoutine},
        toilet = ${f.toilet},
        home_language = ${f.homeLanguage},
        soothes = ${f.soothes},
        fears = ${f.fears},
        emergency_name = ${f.emergencyName},
        emergency_phone = ${f.emergencyPhone},
        pickup_people = ${f.pickupPeople},
        photo_ok = ${f.photoOk},
        sunscreen_ok = ${f.sunscreenOk},
        notes = ${f.notes}
      where id = ${data.id} and user_id = ${context.userId}
      returning id
    `;
    if (!rows[0]) throw new Error("Child not found");
    return { id: rows[0].id };
  });

export const toggleSave = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((daycareId: string) => daycareId)
  .handler(async ({ context, data: daycareId }) => {
    const sql = await getSql();
    const listed = await catalogByIdGet(daycareId);
    if (isAdminOnlyListing(listed ?? { id: daycareId }) && !(await callerIsAdmin())) {
      throw new Error("Listing not found");
    }
    if (listed) await upsertDaycare(sql, listed);
    const existing = await sql<{ user_id: string }>`
      select user_id from saved_daycares where user_id = ${context.userId} and daycare_id = ${daycareId}
    `;
    if (existing.length) {
      await sql`delete from saved_daycares where user_id = ${context.userId} and daycare_id = ${daycareId}`;
      return { saved: false };
    }
    await sql`insert into saved_daycares (user_id, daycare_id) values (${context.userId}, ${daycareId})`;
    return { saved: true };
  });

export const isSaved = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((daycareId: string) => daycareId)
  .handler(async ({ context, data: daycareId }) => {
    const sql = await getSql();
    const rows = await sql<{ n: number }>`
      select count(*)::int as n from saved_daycares
      where user_id = ${context.userId} and daycare_id = ${daycareId}
    `;
    return { saved: (rows[0]?.n ?? 0) > 0 };
  });

export const createBooking = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      daycareId: string;
      childId: string | null;
      startMonth: string;
      schedule: Schedule;
      ageGroup: AgeGroup;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const listed = await catalogByIdGet(data.daycareId);
    if (isAdminOnlyListing(listed ?? { id: data.daycareId }) && !(await callerIsAdmin())) {
      throw new Error("Listing not found");
    }
    if (listed) await upsertDaycare(sql, listed);
    const rows = await sql<DaycareRow>`select * from daycares where id = ${data.daycareId} limit 1`;
    const row = rows[0];
    if (!row) throw new Error("Centre not found");
    const d = mapDaycare(row);
    const priceMap = {
      infant: d.infantMonthly,
      toddler: d.toddlerMonthly,
      preschool: d.preschoolMonthly,
    };
    let amount = priceMap[data.ageGroup] ?? fromPrice(d);
    if (data.schedule === "part") amount = d.partTimeMonthly ?? Math.round(amount * 0.6);
    const spots =
      data.ageGroup === "infant"
        ? d.spotsInfant
        : data.ageGroup === "toddler"
          ? d.spotsToddler
          : d.spotsPreschool;
    const status = spots > 0 ? "accepted" : "waitlist";
    const id = nid("bk");
    await sql`
      insert into bookings (
        id, user_id, daycare_id, child_id, start_month, schedule, age_group, status, monthly_amount
      ) values (
        ${id}, ${context.userId}, ${data.daycareId}, ${data.childId},
        ${data.startMonth}, ${data.schedule}, ${data.ageGroup}, ${status}, ${amount}
      )
    `;
    if (status === "accepted") {
      if (data.ageGroup === "infant") {
        await sql`update daycares set spots_infant = spots_infant - 1 where id = ${data.daycareId} and spots_infant > 0`;
      } else if (data.ageGroup === "toddler") {
        await sql`update daycares set spots_toddler = spots_toddler - 1 where id = ${data.daycareId} and spots_toddler > 0`;
      } else {
        await sql`update daycares set spots_preschool = spots_preschool - 1 where id = ${data.daycareId} and spots_preschool > 0`;
      }
    } else {
      await sql`update daycares set waitlist = waitlist + 1 where id = ${data.daycareId}`;
    }
    const convoId = nid("cv");
    await sql`
      insert into conversations (id, user_id, daycare_id)
      values (${convoId}, ${context.userId}, ${data.daycareId})
      on conflict (user_id, daycare_id) do nothing
    `;
    const convos = await sql<{ id: string }>`
      select id from conversations where user_id = ${context.userId} and daycare_id = ${data.daycareId}
    `;
    const cid = convos[0]?.id ?? convoId;
    const body =
      status === "accepted"
        ? `Enrolment request received for ${data.startMonth}. A spot is held — please pay the first-month deposit to confirm.`
        : `We've added you to the waitlist for ${data.startMonth}. We'll message you when a spot opens.`;
    await sql`
      insert into messages (id, conversation_id, sender, body)
      values (${nid("msg")}, ${cid}, 'provider', ${body})
    `;
    const actor = await lookupUser(context.userId);
    try {
      await notifyPlatform({
        kind: "enroll",
        title: "New enrolment",
        daycareName: d.name,
        address: d.address,
        city: d.city,
        province: d.province,
        slug: d.slug,
        actorName: actor.name,
        actorEmail: actor.email,
        detail: [`Start: ${data.startMonth}`, `Schedule: ${data.schedule}`].join("\n"),
      });
    } catch (err) {
      console.error("[kidease-mail] enrol notify failed", err);
    }
    return { id, status, amount, conversationId: cid };
  });

export const createSpotRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      daycareId: string;
      childId?: string;
      childName: string;
      birthdate: string;
      startDate: string;
      schedule: Schedule;
      days?: string[];
      message?: string;
      parentName?: string;
      locale?: Locale;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureProfile(sql, context.userId);
    const listed = await catalogByIdGet(data.daycareId);
    if (isAdminOnlyListing(listed ?? { id: data.daycareId }) && !(await callerIsAdmin())) {
      throw new Error("Listing not found");
    }
    if (listed) await upsertDaycare(sql, listed);
    const rows = await sql<DaycareRow>`select * from daycares where id = ${data.daycareId} limit 1`;
    const row = rows[0];
    if (!row) throw new Error("Centre not found");
    const d = mapDaycare(row);

    const childName = data.childName.trim();
    if (!childName || !data.birthdate || !data.startDate) throw new Error("Missing details");
    const days = (data.days ?? []).filter(Boolean).join(",");
    const ageGroup = ageGroupFromMonths(monthsBetween(data.birthdate));
    const priceMap = {
      infant: d.infantMonthly,
      toddler: d.toddlerMonthly,
      preschool: d.preschoolMonthly,
    };
    let amount = priceMap[ageGroup] ?? fromPrice(d);
    if (data.schedule === "part") amount = d.partTimeMonthly ?? Math.round(amount * 0.6);

    let childId = data.childId?.trim() || "";
    if (childId) {
      const owned = await sql<{ id: string }>`
        select id from children where id = ${childId} and user_id = ${context.userId} limit 1
      `;
      if (!owned[0]) childId = "";
    }
    if (!childId) {
      childId = nid("ch");
      await sql`
        insert into children (id, user_id, name, birthdate, notes)
        values (${childId}, ${context.userId}, ${childName}, ${data.birthdate}, ${data.message?.trim() || null})
      `;
    } else {
      await sql`
        update children set name = ${childName}, birthdate = ${data.birthdate}
        where id = ${childId} and user_id = ${context.userId}
      `;
    }

    const users = await sql<{ name: string }>`
      select name from "user" where id = ${context.userId} limit 1
    `;
    const parentName = (data.parentName ?? users[0]?.name ?? "A parent").trim() || "A parent";
    const locale = data.locale === "fr" ? "fr" : "en";
    const copy = {
      parentName,
      childName,
      age: formatAgeLabel(data.birthdate, locale),
      dob: data.birthdate,
      daycareName: d.name,
      start: formatStart(data.startDate, locale),
      schedule: scheduleLabel(data.schedule, days || null, locale),
      note: data.message?.trim() || null,
    };

    const convoId = nid("cv");
    await sql`
      insert into conversations (id, user_id, daycare_id)
      values (${convoId}, ${context.userId}, ${data.daycareId})
      on conflict (user_id, daycare_id) do nothing
    `;
    const convos = await sql<{ id: string }>`
      select id from conversations where user_id = ${context.userId} and daycare_id = ${data.daycareId}
    `;
    const cid = convos[0]?.id ?? convoId;

    const bookingId = nid("bk");
    const startMonth = data.startDate.slice(0, 7);
    await sql`
      insert into bookings (
        id, user_id, daycare_id, child_id, start_month, schedule, age_group, status, monthly_amount,
        parent_note, days, conversation_id, start_date, parent_name
      ) values (
        ${bookingId}, ${context.userId}, ${data.daycareId}, ${childId},
        ${startMonth}, ${data.schedule}, ${ageGroup}, ${"requested"}, ${amount},
        ${copy.note}, ${days || null}, ${cid}, ${data.startDate}, ${parentName}
      )
    `;

    const notify = pushNewRequest(copy, locale);
    const systemBody = systemRequestMessage(copy, locale);
    const emailBody = `${emailSubjectNewRequest(copy, locale)}\n\n${emailBodyNewRequest(copy, locale)}`;
    await sql`
      insert into messages (id, conversation_id, sender, body, kind)
      values (${nid("msg")}, ${cid}, ${"system"}, ${systemBody}, ${"system"})
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

    const actor = await lookupUser(context.userId);
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
        detail: [
          `Child: ${childName}`,
          `Start: ${data.startDate}`,
          `Schedule: ${data.schedule}`,
          data.message?.trim() ? `Message: ${data.message.trim()}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      });
    } catch (err) {
      console.error("[kidease-mail] spot request notify failed", err);
    }

    return {
      id: bookingId,
      status: "requested" as const,
      amount,
      conversationId: cid,
      notify,
      emailPreview: emailBody,
    };
  });


export const listInbox = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      daycare_id: string;
      name: string;
      slug: string;
      photos: string;
      last_at: string;
      phone: string | null;
      status: BookingStatus | null;
    }>`
      select c.id, c.daycare_id, d.name, d.slug, d.photos, c.last_at, d.phone,
             (
               select b.status from bookings b
               where b.conversation_id = c.id or (b.user_id = c.user_id and b.daycare_id = c.daycare_id)
               order by b.created_at desc limit 1
             ) as status
      from conversations c join daycares d on d.id = c.daycare_id
      where c.user_id = ${context.userId}
      order by c.last_at desc
    `;
    const out: Conversation[] = [];
    for (const r of rows) {
      const last = await sql<{ body: string }>`
        select body from messages where conversation_id = ${r.id} order by created_at desc limit 1
      `;
      out.push({
        id: r.id,
        daycareId: r.daycare_id,
        daycareName: r.name,
        daycareSlug: r.slug,
        photo: r.photos.split(",")[0] ?? "/photos/cottage.jpg",
        lastAt: String(r.last_at),
        lastBody: last[0]?.body ?? "",
        status: r.status,
        phone: r.phone,
      });
    }
    return out;
  });

export const getThread = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((conversationId: string) => conversationId)
  .handler(async ({ context, data: conversationId }) => {
    const sql = await getSql();
    const conv = await sql<{
      id: string;
      user_id: string;
      daycare_id: string;
      name: string;
      slug: string;
      photos: string;
      phone: string | null;
    }>`
      select c.id, c.user_id, c.daycare_id, d.name, d.slug, d.photos, d.phone
      from conversations c join daycares d on d.id = c.daycare_id
      where c.id = ${conversationId}
        and (
          c.user_id = ${context.userId}
          or exists (select 1 from profiles where user_id = ${context.userId} and role in ('provider', 'admin'))
        )
      limit 1
    `;
    if (!conv[0]) return null;
    const messages = await sql<{
      id: string;
      sender: "parent" | "provider" | "system";
      body: string;
      created_at: string;
      kind: "chat" | "system" | "notify" | "status";
    }>`
      select id, sender, body, created_at, kind from messages
      where conversation_id = ${conversationId} order by created_at
    `;
    const booking = await sql<{
      id: string;
      status: BookingStatus;
      child_id: string | null;
      child_name: string | null;
      birthdate: string | null;
      start_date: string | null;
      start_month: string;
      schedule: Schedule;
      days: string | null;
      parent_note: string | null;
      parent_name: string | null;
      monthly_amount: number;
      payment_status: string | null;
    }>`
      select b.id, b.status, b.child_id, ch.name as child_name, ch.birthdate, b.start_date, b.start_month,
             b.schedule, b.days, b.parent_note, b.parent_name, b.monthly_amount,
             (select p.status from payments p where p.booking_id = b.id order by p.created_at desc limit 1) as payment_status
      from bookings b
      left join children ch on ch.id = b.child_id
      where b.conversation_id = ${conversationId}
         or (b.user_id = ${conv[0].user_id} and b.daycare_id = ${conv[0].daycare_id})
      order by b.created_at desc
      limit 1
    `;
    const b = booking[0];
    let child: Child | null = null;
    if (b?.child_id) {
      const kids = await sql<ChildRow>`
        select id, name, preferred_name, birthdate, allergies, epi_pen, medical_notes, medications,
               doctor_name, doctor_phone, foods_like, foods_avoid, diet, likes, comfort_item, nap_routine,
               toilet, home_language, soothes, fears, emergency_name, emergency_phone, pickup_people,
               photo_ok, sunscreen_ok, notes
        from children where id = ${b.child_id} limit 1
      `;
      if (kids[0]) child = mapChild(kids[0]);
    }
    const mapped: Message[] = messages.map((m) => ({
      id: m.id,
      sender: m.sender,
      body: m.body,
      createdAt: String(m.created_at),
      kind: m.kind ?? "chat",
    }));
    if (b && !mapped.some((m) => m.kind === "system" || m.sender === "system")) {
      const locale = "en" as const;
      const copy = {
        parentName: b.parent_name ?? "A parent",
        childName: b.child_name ?? "child",
        age: b.birthdate ? formatAgeLabel(b.birthdate, locale) : "",
        daycareName: conv[0].name,
        start: formatStart(b.start_date ?? b.start_month, locale),
        schedule: scheduleLabel(b.schedule, b.days, locale),
        note: b.parent_note,
      };
      const notify = pushNewRequest(copy, locale);
      mapped.unshift(
        {
          id: `${b.id}-sys`,
          sender: "system",
          body: systemRequestMessage(copy, locale),
          createdAt: String(messages[0]?.created_at ?? Date.now()),
          kind: "system",
        },
        {
          id: `${b.id}-push`,
          sender: "system",
          body: `${notify.title}\n${notify.body}`,
          createdAt: String(messages[0]?.created_at ?? Date.now()),
          kind: "notify",
        },
      );
    }
    return {
      id: conv[0].id,
      daycareId: conv[0].daycare_id,
      daycareName: conv[0].name,
      daycareSlug: conv[0].slug,
      photo: conv[0].photos.split(",")[0] ?? "/photos/cottage.jpg",
      phone: conv[0].phone,
      isParent: conv[0].user_id === context.userId,
      booking: b
        ? {
            id: b.id,
            status: b.status,
            childName: b.child_name,
            birthdate: b.birthdate,
            startDate: b.start_date,
            startMonth: b.start_month,
            schedule: b.schedule,
            days: b.days,
            parentNote: b.parent_note,
            parentName: b.parent_name,
            monthlyAmount: b.monthly_amount,
            paymentStatus: b.payment_status,
          }
        : null,
      child,
      messages: mapped,
    };
  });

export const openConversation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((daycareId: string) => daycareId)
  .handler(async ({ context, data: daycareId }) => {
    const sql = await getSql();
    const listed = await catalogByIdGet(daycareId);
    if (isAdminOnlyListing(listed ?? { id: daycareId }) && !(await callerIsAdmin())) {
      throw new Error("Listing not found");
    }
    if (listed) await upsertDaycare(sql, listed);
    const existing = await sql<{ id: string }>`
      select id from conversations where user_id = ${context.userId} and daycare_id = ${daycareId}
    `;
    if (existing[0]) return { id: existing[0].id };
    const id = nid("cv");
    await sql`insert into conversations (id, user_id, daycare_id) values (${id}, ${context.userId}, ${daycareId})`;
    const d = await sql<{ name: string }>`select name from daycares where id = ${daycareId}`;
    await sql`
      insert into messages (id, conversation_id, sender, body)
      values (${nid("msg")}, ${id}, 'provider', ${`Hi — this is ${d[0]?.name ?? "the centre"}. How can we help?`})
    `;
    return { id };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId: string; body: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const conv = await sql<{ id: string; user_id: string; name: string }>`
      select c.id, c.user_id, d.name from conversations c
      join daycares d on d.id = c.daycare_id
      where c.id = ${data.conversationId}
        and (
          c.user_id = ${context.userId}
          or exists (select 1 from profiles where user_id = ${context.userId} and role in ('provider', 'admin'))
        )
    `;
    if (!conv[0]) throw new Error("Conversation not found");
    const body = data.body.trim();
    if (!body) return { ok: false };
    const sender = conv[0].user_id === context.userId ? "parent" : "provider";
    await sql`
      insert into messages (id, conversation_id, sender, body, kind)
      values (${nid("msg")}, ${data.conversationId}, ${sender}, ${body}, ${"chat"})
    `;
    await sql`update conversations set last_at = now() where id = ${data.conversationId}`;
    if (sender === "parent") {
      const reply = autoReply(body, conv[0].name);
      await sql`
        insert into messages (id, conversation_id, sender, body, kind)
        values (${nid("msg")}, ${data.conversationId}, ${"provider"}, ${reply}, ${"chat"})
      `;
    }
    return { ok: true };
  });

function autoReply(body: string, centre: string) {
  const q = body.toLowerCase();
  if (q.includes("tour") || q.includes("visit") || q.includes("visite")) {
    return `${centre}: We tour Thursday mornings at 9:30. Reply with a date and we'll hold a slot.`;
  }
  if (q.includes("wait") || q.includes("attente")) {
    return `${centre}: Waitlist movement is usually 4–8 weeks for toddler rooms, longer for infants. We'll email the moment a spot opens.`;
  }
  if (q.includes("subsidy") || q.includes("subvention")) {
    return `${centre}: We bill the parent fee after the provincial subsidy. Bring your subsidy letter to enrolment and we'll set the monthly amount.`;
  }
  return `${centre}: Thanks — an educator will follow up during office hours. If this is about a held spot, you can pay the deposit from My requests.`;
}

export const updateRequestStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { bookingId: string; status: BookingStatus }) => input)
  .handler(async ({ context, data }) => {
    const allowed: BookingStatus[] = ["under_review", "accepted", "waitlist", "declined"];
    if (!allowed.includes(data.status)) throw new Error("Invalid status");
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      user_id: string;
      daycare_id: string;
      status: BookingStatus;
      age_group: AgeGroup;
      conversation_id: string | null;
      start_date: string | null;
      start_month: string;
      schedule: Schedule;
      days: string | null;
      parent_name: string | null;
      child_name: string | null;
      birthdate: string | null;
      daycare_name: string;
    }>`
      select b.id, b.user_id, b.daycare_id, b.status, b.age_group, b.conversation_id,
             b.start_date, b.start_month, b.schedule, b.days, b.parent_name,
             ch.name as child_name, ch.birthdate, d.name as daycare_name
      from bookings b
      join daycares d on d.id = b.daycare_id
      left join children ch on ch.id = b.child_id
      where b.id = ${data.bookingId}
      limit 1
    `;
    const b = rows[0];
    if (!b) throw new Error("Request not found");
    const prev = b.status;
    await sql`update bookings set status = ${data.status} where id = ${b.id}`;

    if (data.status === "waitlist" && prev !== "waitlist") {
      await sql`update daycares set waitlist = waitlist + 1 where id = ${b.daycare_id}`;
    }
    if (data.status === "accepted" && prev !== "accepted" && prev !== "active") {
      if (b.age_group === "infant") {
        await sql`update daycares set spots_infant = spots_infant - 1 where id = ${b.daycare_id} and spots_infant > 0`;
      } else if (b.age_group === "toddler") {
        await sql`update daycares set spots_toddler = spots_toddler - 1 where id = ${b.daycare_id} and spots_toddler > 0`;
      } else {
        await sql`update daycares set spots_preschool = spots_preschool - 1 where id = ${b.daycare_id} and spots_preschool > 0`;
      }
    }

    let cid = b.conversation_id;
    if (!cid) {
      const existing = await sql<{ id: string }>`
        select id from conversations where user_id = ${b.user_id} and daycare_id = ${b.daycare_id}
      `;
      cid = existing[0]?.id ?? null;
    }
    if (cid && data.status !== "requested") {
      const locale = "en" as const;
      const copy = {
        parentName: b.parent_name ?? "Parent",
        childName: b.child_name ?? "your child",
        age: b.birthdate ? formatAgeLabel(b.birthdate, locale) : "",
        daycareName: b.daycare_name,
        start: formatStart(b.start_date ?? b.start_month, locale),
        schedule: scheduleLabel(b.schedule, b.days, locale),
      };
      const body = statusUpdateMessage(
        data.status as "under_review" | "accepted" | "waitlist" | "declined",
        copy,
        locale,
      );
      await sql`
        insert into messages (id, conversation_id, sender, body, kind)
        values (${nid("msg")}, ${cid}, ${"system"}, ${body}, ${"status"})
      `;
      await sql`update conversations set last_at = now() where id = ${cid}`;
    }
    return { ok: true as const, status: data.status, conversationId: cid };
  });


async function postSpotConfirmed(
  sql: Awaited<ReturnType<typeof getSql>>,
  bookingId: string,
  locale: "en" | "fr",
) {
  const rows = await sql<{
    conversation_id: string | null;
    user_id: string;
    daycare_id: string;
    parent_name: string | null;
    child_name: string | null;
    daycare_name: string;
    start_date: string | null;
    start_month: string;
  }>`
    select b.conversation_id, b.user_id, b.daycare_id, b.parent_name,
           ch.name as child_name, d.name as daycare_name,
           b.start_date, b.start_month
    from bookings b
    join daycares d on d.id = b.daycare_id
    left join children ch on ch.id = b.child_id
    where b.id = ${bookingId}
    limit 1
  `;
  const b = rows[0];
  if (!b) return;
  let cid = b.conversation_id;
  if (!cid) {
    const existing = await sql<{ id: string }>`
      select id from conversations where user_id = ${b.user_id} and daycare_id = ${b.daycare_id}
    `;
    cid = existing[0]?.id ?? null;
  }
  if (!cid) return;
  const body = spotConfirmedMessage(
    {
      parentName: b.parent_name ?? "Parent",
      childName: b.child_name ?? "your child",
      age: "",
      daycareName: b.daycare_name,
      start: formatStart(b.start_date ?? b.start_month, locale),
      schedule: "",
    },
    locale,
  );
  await sql`
    insert into messages (id, conversation_id, sender, body, kind)
    values (${nid("msg")}, ${cid}, ${"system"}, ${body}, ${"status"})
  `;
  await sql`update conversations set last_at = now() where id = ${cid}`;
}

export const createPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { bookingId: string; method: PayMethod; locale?: Locale }) => input,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      daycare_id: string;
      monthly_amount: number;
      status: string;
    }>`
      select id, daycare_id, monthly_amount, status from bookings
      where id = ${data.bookingId} and user_id = ${context.userId}
    `;
    const b = rows[0];
    if (!b) throw new Error("Booking not found");
    if (!stripeChargesLive()) {
      throw new Error("Card Pay stays off until Stripe live keys are on. This is an internal ledger (not charged).");
    }
    if (b.status !== "accepted") {
      throw new Error("Payment is available after the daycare approves your request.");
    }
    const existing = await sql<{ id: string; status: string; reference: string | null; amount: number }>`
      select id, status, reference, amount from payments
      where booking_id = ${b.id} and user_id = ${context.userId} and status in ('paid','pending')
      order by created_at desc limit 1
    `;
    if (existing[0]?.status === "paid") {
      return { id: existing[0].id, status: existing[0].status, reference: existing[0].reference, amount: existing[0].amount };
    }
    const id = nid("pay");
    const reference = `KE-${id.slice(-8).toUpperCase()}`;
    const status = data.method === "interac" ? "pending" : "paid";
    await sql`
      insert into payments (id, user_id, booking_id, daycare_id, amount, method, status, reference)
      values (${id}, ${context.userId}, ${b.id}, ${b.daycare_id}, ${b.monthly_amount}, ${data.method}, ${status}, ${reference})
    `;
    if (status === "paid") {
      await sql`update bookings set status = 'active' where id = ${b.id} and user_id = ${context.userId}`;
      await postSpotConfirmed(sql, b.id, data.locale === "fr" ? "fr" : "en");
      const actor = await lookupUser(context.userId);
      void notifyPlatform({
        kind: "payment",
        daycareName: b.daycare_id,
        actorName: actor.name,
        actorEmail: actor.email,
        detail: `Amount: $${b.monthly_amount} · ${data.method} · ${reference}`,
      });
    }
    return { id, status, reference, amount: b.monthly_amount };
  });

export const confirmInterac = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { paymentId: string; locale?: Locale } | string) =>
    typeof input === "string" ? { paymentId: input } : input,
  )
  .handler(async ({ context, data }) => {
    const paymentId = data.paymentId;
    const sql = await getSql();
    const rows = await sql<{ booking_id: string | null }>`
      select booking_id from payments where id = ${paymentId} and user_id = ${context.userId}
    `;
    if (!rows[0]) throw new Error("Payment not found");
    await sql`update payments set status = 'paid' where id = ${paymentId} and user_id = ${context.userId}`;
    if (rows[0].booking_id) {
      await sql`update bookings set status = 'active' where id = ${rows[0].booking_id} and user_id = ${context.userId}`;
      await postSpotConfirmed(sql, rows[0].booking_id, data.locale === "fr" ? "fr" : "en");
      const actor = await lookupUser(context.userId);
      void notifyPlatform({
        kind: "payment",
        actorName: actor.name,
        actorEmail: actor.email,
        detail: `Interac confirmed · payment ${paymentId}`,
      });
    }
    return { ok: true };
  });

export const getMyRole = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const session = await resolveSessionDesks(context.userId);
    return {
      role: session.role,
      desks: session.desks,
      home: session.home,
      unread: session.unread,
      stripeLive: session.stripeLive,
      ledgerLabel: session.ledgerLabel,
    };
  });

export const setRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((role: "parent" | "provider") => role)
  .handler(async ({ context, data: role }) => {
    const written = await writeProfileRole(context.userId, role);
    if (!written.previous) {
      await pingNewAccount(context.userId, written.role === "admin" ? "parent" : written.role);
    } else if (role === "provider" && written.previous !== "provider" && written.role === "provider") {
      await pingNewAccount(context.userId, "provider");
    }
    return { role: written.role };
  });

export const getProvider = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await ensureSeed(sql);
    const owned = await sql<DaycareRow>`
      select d.* from daycares d
      join provider_daycares p on p.daycare_id = d.id
      where p.user_id = ${context.userId}
    `;
    const listings = owned.map(mapDaycare);
    const stats = [];
    for (const d of listings) {
      const views = await sql<{ n: number }>`
        select coalesce(sum(count),0)::int as n from daycare_views where daycare_id = ${d.id}
      `;
      const inquiries = await sql<{ n: number }>`
        select count(*)::int as n from conversations where daycare_id = ${d.id}
      `;
      const requests = await sql<{ n: number }>`
        select count(*)::int as n from bookings where daycare_id = ${d.id}
      `;
      stats.push({
        daycareId: d.id,
        views: views[0]?.n ?? 0,
        inquiries: inquiries[0]?.n ?? 0,
        requests: requests[0]?.n ?? 0,
      });
    }
    const inbox = await sql<{
      id: string;
      user_id: string;
      daycare_id: string;
      name: string;
      last_at: string;
    }>`
      select c.id, c.user_id, c.daycare_id, d.name, c.last_at
      from conversations c
      join provider_daycares p on p.daycare_id = c.daycare_id
      join daycares d on d.id = c.daycare_id
      where p.user_id = ${context.userId}
      order by c.last_at desc
    `;
    const requests = await sql<{
      id: string;
      daycare_id: string;
      daycare_name: string;
      slug: string;
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
      allergies: string | null;
      epi_pen: boolean | number | string | null;
      payment_status: string | null;
    }>`
      select b.id, b.daycare_id, d.name as daycare_name, d.slug, ch.name as child_name, ch.birthdate,
             ch.allergies, ch.epi_pen,
             b.start_month, b.start_date, b.schedule, b.days, b.parent_note, b.parent_name,
             b.conversation_id, b.age_group, b.status, b.monthly_amount, b.created_at,
             (select p.status from payments p where p.booking_id = b.id order by p.created_at desc limit 1) as payment_status
      from bookings b
      join daycares d on d.id = b.daycare_id
      left join children ch on ch.id = b.child_id
      where exists (select 1 from provider_daycares p where p.user_id = ${context.userId} and p.daycare_id = b.daycare_id)
         or not exists (select 1 from provider_daycares p where p.user_id = ${context.userId})
      order by b.created_at desc
      limit 40
    `;
    return {
      listings,
      stats,
      inbox,
      requests: requests.map((b) => ({
        id: b.id,
        daycareId: b.daycare_id,
        daycareName: b.daycare_name,
        daycareSlug: b.slug,
        childId: null,
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
        allergies: b.allergies ?? "",
        epiPen: Boolean(b.epi_pen === true || b.epi_pen === 1 || b.epi_pen === "t" || b.epi_pen === "true"),
      })),
    };
  });

export const createListing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      name: string;
      address: string;
      city: string;
      postalCode: string;
      licenseNumber: string;
      infantMonthly: number;
      toddlerMonthly: number;
      preschoolMonthly: number;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = nid("d");
    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) + "-" + id.slice(-4);
    await sql`
      insert into daycares (
        id, slug, name, name_fr, tagline, tagline_fr, description, description_fr,
        address, city, province, postal_code, lat, lng, phone, hours, hours_fr,
        age_min_months, age_max_months, infant_monthly, toddler_monthly, preschool_monthly,
        part_time_monthly, spots_infant, spots_toddler, spots_preschool, waitlist,
        rating_x10, review_count, license_number, languages, amenities, photos, verified
      ) values (
        ${id}, ${slug}, ${data.name}, ${data.name},
        ${"Newly listed licensed centre."}, ${"Nouveau centre permis."},
        ${"This centre was listed by a provider on KidEase. Update the description from the provider dashboard."},
        ${"Ce centre a été inscrit par un fournisseur. Mettez à jour la description."},
        ${data.address}, ${data.city}, ${"MB"}, ${data.postalCode},
        ${49.8951}, ${-97.1384}, ${null},
        ${"7:30 a.m. – 5:30 p.m., Monday to Friday"},
        ${"7 h 30 – 17 h 30, du lundi au vendredi"},
        ${6}, ${72}, ${data.infantMonthly}, ${data.toddlerMonthly}, ${data.preschoolMonthly},
        ${Math.round(data.toddlerMonthly * 0.6)}, 2, 2, 2, 0, 40, 0,
        ${data.licenseNumber}, ${"en"}, ${"meals,inclusive"},
        ${"/photos/community.jpg,/photos/playroom.jpg"}, 0
      )
    `;
    await sql`insert into provider_daycares (user_id, daycare_id) values (${context.userId}, ${id})`;
    await writeProfileRole(context.userId, "provider");
    const actor = await lookupUser(context.userId);
    try {
      await notifyProviderJoined({
        kind: "listing",
        daycareName: data.name,
        address: data.address,
        city: data.city,
        province: "MB",
        slug,
        providerName: actor.name,
        providerEmail: actor.email,
      });
    } catch (err) {
      console.error("[kidease-mail] listing notify failed", err);
    }
    return { id, slug };
  });

export const updateCapacity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      daycareId: string;
      spotsInfant: number;
      spotsToddler: number;
      spotsPreschool: number;
      infantMonthly: number;
      toddlerMonthly: number;
      preschoolMonthly: number;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const own = await sql<{ user_id: string }>`
      select user_id from provider_daycares
      where user_id = ${context.userId} and daycare_id = ${data.daycareId}
    `;
    if (!own[0]) throw new Error("Not your listing");
    await sql`
      update daycares set
        spots_infant = ${data.spotsInfant},
        spots_toddler = ${data.spotsToddler},
        spots_preschool = ${data.spotsPreschool},
        infant_monthly = ${data.infantMonthly},
        toddler_monthly = ${data.toddlerMonthly},
        preschool_monthly = ${data.preschoolMonthly}
      where id = ${data.daycareId}
    `;
    return { ok: true };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const uid = context.userId;
    await sql`delete from messages where conversation_id in (select id from conversations where user_id = ${uid})`;
    await sql`delete from conversations where user_id = ${uid}`;
    await sql`delete from payments where user_id = ${uid}`;
    await sql`delete from invoices where parent_user_id = ${uid}`.catch(() => undefined);
    await sql`delete from bookings where user_id = ${uid}`;
    await sql`delete from children where user_id = ${uid}`;
    await sql`delete from saved_daycares where user_id = ${uid}`;
    await sql`delete from provider_daycares where user_id = ${uid}`;
    await sql`delete from profiles where user_id = ${uid}`;
    await sql`delete from "session" where "userId" = ${uid}`;
    await sql`delete from "account" where "userId" = ${uid}`;
    await sql`delete from "user" where "id" = ${uid}`;
    return { ok: true as const };
  });
