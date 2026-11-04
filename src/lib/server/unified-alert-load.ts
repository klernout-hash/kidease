/**
 * Read existing KidEase tables into scan facts.
 * Each query fails closed to an empty list. No street address is selected.
 */

import { getSql } from "@/lib/db";
import { KIDEASE_OPERATOR_EMAIL } from "@/lib/admin-email";
import type { ScanFacts } from "@/lib/unified-alert-scan";

type Sql = Awaited<ReturnType<typeof getSql>>;

type People = { owners: string[]; staff: string[] };

function emptyPeople(): People {
  return { owners: [], staff: [] };
}

async function centrePeople(sql: Sql): Promise<Map<string, People>> {
  const map = new Map<string, People>();
  const put = (daycareId: string, userId: string, staff: boolean) => {
    if (!daycareId || !userId) return;
    const row = map.get(daycareId) || emptyPeople();
    const list = staff ? row.staff : row.owners;
    if (!list.includes(userId)) list.push(userId);
    if (!staff && !row.staff.includes(userId)) row.staff.push(userId);
    map.set(daycareId, row);
  };
  const members = await sql<{ daycare_id: string; user_id: string; role: string }>`
    select daycare_id, user_id, role from centre_members
    where status = 'active' and role in ('owner', 'manager', 'staff')
    limit 500
  `.catch(() => [] as Array<{ daycare_id: string; user_id: string; role: string }>);
  for (const member of members) put(member.daycare_id, member.user_id, member.role === "staff");
  const owners = await sql<{ daycare_id: string; user_id: string }>`
    select daycare_id, user_id from provider_daycares limit 500
  `.catch(() => [] as Array<{ daycare_id: string; user_id: string }>);
  for (const owner of owners) put(owner.daycare_id, owner.user_id, false);
  return map;
}

function ownersOf(map: Map<string, People>, daycareId: string): string[] {
  return map.get(daycareId)?.owners || [];
}

function staffOf(map: Map<string, People>, daycareId: string): string[] {
  return map.get(daycareId)?.staff || [];
}

function iso(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export async function loadUnifiedFacts(now = new Date()): Promise<ScanFacts> {
  const sql = await getSql();
  const people = await centrePeople(sql);
  const facts: ScanFacts = { now };

  const spots = await sql<{ id: string; name: string; spots: number; updated_at: string | Date }>`
    select id, name, confirmed_open_spots as spots, spots_updated_at as updated_at
    from daycares
    where confirmed_open_spots > 0
      and spots_updated_at > now() - interval '14 days'
    order by spots_updated_at desc
    limit 20
  `.catch(() => [] as Array<{ id: string; name: string; spots: number; updated_at: string | Date }>);
  const posts = await sql<{ daycare_id: string; name: string; spots: number; created_at: string | Date }>`
    select p.daycare_id, d.name, p.spots, p.created_at
    from open_spot_posts p
    join daycares d on d.id = p.daycare_id
    where p.spots > 0 and p.created_at > now() - interval '14 days'
    order by p.created_at desc
    limit 20
  `.catch(() => [] as Array<{ daycare_id: string; name: string; spots: number; created_at: string | Date }>);
  const spotRows = [
    ...spots.map((spot) => ({ daycareId: spot.id, name: spot.name, spots: Number(spot.spots), updatedAt: iso(spot.updated_at) })),
    ...posts.map((spot) => ({ daycareId: spot.daycare_id, name: spot.name, spots: Number(spot.spots), updatedAt: iso(spot.created_at) })),
  ];
  facts.spots = [];
  for (const spot of spotRows) {
    const saved = await sql<{ user_id: string }>`
      select user_id from saved_daycares where daycare_id = ${spot.daycareId} limit 30
    `.catch(() => [] as Array<{ user_id: string }>);
    const waiting = await sql<{ user_id: string }>`
      select user_id from daycare_waitlist
      where daycare_id = ${spot.daycareId} and status in ('waiting', 'offered')
      limit 30
    `.catch(() => [] as Array<{ user_id: string }>);
    const userIds = [...new Set([...saved, ...waiting].map((row) => row.user_id).filter(Boolean))];
    if (userIds.length) facts.spots.push({ ...spot, userIds });
  }

  const leads = await sql<{
    id: string;
    daycare_id: string;
    name: string;
    user_id: string;
    status: string;
    kind: string;
    updated_at: string | Date;
    created_at: string | Date;
    reply_note: string | null;
  }>`
    select l.id, l.daycare_id, d.name, l.user_id, l.status, l.kind, l.updated_at, l.created_at, l.reply_note
    from lead_requests l
    join daycares d on d.id = l.daycare_id
    where l.updated_at > now() - interval '8 days'
    order by l.updated_at desc
    limit 60
  `.catch(() => []);
  const toursStatus = await sql<{
    id: string;
    daycare_id: string;
    name: string;
    user_id: string;
    status: string;
    created_at: string | Date;
    responded_at: string | Date | null;
    responded_by: string | null;
    centre_note: string | null;
  }>`
    select t.id, t.daycare_id, d.name, t.user_id, t.status, t.created_at, t.responded_at, t.responded_by, t.centre_note
    from tour_requests t
    join daycares d on d.id = t.daycare_id
    where coalesce(t.responded_at, t.created_at) > now() - interval '8 days'
    order by coalesce(t.responded_at, t.created_at) desc
    limit 40
  `.catch(() => []);
  const bookings = await sql<{
    id: string;
    daycare_id: string;
    name: string;
    user_id: string;
    status: string;
    created_at: string | Date;
  }>`
    select b.id, b.daycare_id, d.name, b.user_id, b.status, b.created_at
    from bookings b
    join daycares d on d.id = b.daycare_id
    where b.status in ('accepted', 'declined')
      and b.created_at > now() - interval '2 days'
    limit 40
  `.catch(() => []);

  facts.requests = [
    ...leads.map((lead) => ({
      id: lead.id,
      daycareId: lead.daycare_id,
      name: lead.name,
      userId: lead.user_id,
      status: lead.status,
      kind: lead.kind,
      updatedAt: iso(lead.updated_at),
      createdAt: iso(lead.created_at),
      replyNote: lead.reply_note,
      ownerUserIds: ownersOf(people, lead.daycare_id),
      source: "lead" as const,
    })),
    ...toursStatus.map((tour) => ({
      id: tour.id,
      daycareId: tour.daycare_id,
      name: tour.name,
      userId: tour.user_id,
      status: tour.status,
      kind: "tour",
      updatedAt: iso(tour.responded_at || tour.created_at),
      createdAt: iso(tour.created_at),
      replyNote: tour.centre_note,
      ownerUserIds: ownersOf(people, tour.daycare_id),
      source: "tour" as const,
    })),
    ...bookings.map((booking) => ({
      id: booking.id,
      daycareId: booking.daycare_id,
      name: booking.name,
      userId: booking.user_id,
      status: booking.status,
      kind: "enrolment",
      updatedAt: iso(booking.created_at),
      createdAt: iso(booking.created_at),
      replyNote: "",
      ownerUserIds: ownersOf(people, booking.daycare_id),
      source: "booking" as const,
    })),
  ];

  facts.left = toursStatus
    .filter((tour) => tour.status === "declined" && tour.responded_by && tour.responded_by === tour.user_id)
    .map((tour) => ({
      id: tour.id,
      daycareId: tour.daycare_id,
      name: tour.name,
      ownerUserIds: ownersOf(people, tour.daycare_id),
      kind: "tour" as const,
    }));

  const windows = await sql<{ id: string; user_id: string; daycare_id: string; name: string; start_at: string | Date }>`
    select t.id, t.user_id, t.daycare_id, d.name, w.start_at
    from tour_requests t
    join tour_windows w on w.id = t.window_id
    join daycares d on d.id = t.daycare_id
    where t.status = 'accepted'
      and w.start_at > now()
      and w.start_at < now() + interval '26 hours'
    limit 40
  `.catch(() => []);
  facts.tours = windows.map((tour) => ({
    id: tour.id,
    userId: tour.user_id,
    daycareId: tour.daycare_id,
    name: tour.name,
    startAt: iso(tour.start_at),
  }));

  const waitlist = await sql<{
    id: string;
    user_id: string;
    daycare_id: string;
    name: string;
    rank_order: number | null;
    status: string;
  }>`
    select w.id, w.user_id, w.daycare_id, d.name, w.rank_order, w.status
    from daycare_waitlist w
    join daycares d on d.id = w.daycare_id
    where w.updated_at > now() - interval '2 days'
      and w.status in ('waiting', 'offered', 'withdrawn')
    limit 40
  `.catch(() => []);
  facts.waitlist = waitlist
    .filter((item) => item.status !== "withdrawn")
    .map((item) => ({
      id: item.id,
      userId: item.user_id,
      daycareId: item.daycare_id,
      name: item.name,
      rank: item.rank_order == null ? null : Number(item.rank_order),
      status: item.status,
    }));
  facts.left = [
    ...(facts.left || []),
    ...waitlist
      .filter((item) => item.status === "withdrawn")
      .map((item) => ({
        id: item.id,
        daycareId: item.daycare_id,
        name: item.name,
        ownerUserIds: ownersOf(people, item.daycare_id),
        kind: "waitlist" as const,
      })),
  ];

  const messages = await sql<{
    id: string;
    sender: string;
    parent_user_id: string;
    daycare_id: string;
    name: string;
  }>`
    select m.id, m.sender, c.user_id as parent_user_id, c.daycare_id, d.name
    from messages m
    join conversations c on c.id = m.conversation_id
    join daycares d on d.id = c.daycare_id
    where m.created_at > now() - interval '3 hours'
      and m.sender in ('parent', 'provider')
    order by m.created_at desc
    limit 40
  `.catch(() => []);
  facts.messages = messages
    .filter((message) => message.sender === "parent" || message.sender === "provider")
    .map((message) => ({
      id: message.id,
      daycareId: message.daycare_id,
      name: message.name,
      sender: message.sender as "parent" | "provider",
      parentUserId: message.parent_user_id,
      ownerUserIds: ownersOf(people, message.daycare_id),
    }));

  const immunizations = await sql<{ id: string; user_id: string; expires_on: string }>`
    select id, user_id, expires_on
    from family_documents
    where kind = 'immunization' and expires_on is not null
      and expires_on <= current_date + 60
    limit 40
  `.catch(() => [] as Array<{ id: string; user_id: string; expires_on: string }>);
  const allergies = await sql<{ id: string; user_id: string; allergy_plan_expires_on: string }>`
    select id, user_id, allergy_plan_expires_on
    from children
    where allergy_plan_expires_on is not null
      and allergy_plan_expires_on <= current_date + 60
    limit 40
  `.catch(() => [] as Array<{ id: string; user_id: string; allergy_plan_expires_on: string }>);
  facts.documents = [
    ...immunizations.map((doc) => ({
      id: doc.id,
      userId: doc.user_id,
      kind: "immunization" as const,
      expiresOn: iso(doc.expires_on).slice(0, 10),
    })),
    ...allergies.map((doc) => ({
      id: doc.id,
      userId: doc.user_id,
      kind: "allergy" as const,
      expiresOn: iso(doc.allergy_plan_expires_on).slice(0, 10),
    })),
  ];

  const licences = await sql<{ id: string; name: string; license_expiry: string | null; first_aid_expiry: string | null }>`
    select id, name, license_expiry, first_aid_expiry
    from daycares
    where license_expiry <= current_date + 60
       or first_aid_expiry <= current_date + 60
    limit 30
  `.catch(() => []);
  const screening = await sql<{ id: string; daycare_id: string; name: string }>`
    select s.id, s.daycare_id, d.name
    from provider_screening_documents s
    join daycares d on d.id = s.daycare_id
    where s.expires_on <= current_date + 60
       or s.status in ('expired', 'rejected', 'admin_review')
    limit 30
  `.catch(() => []);
  facts.licences = [
    ...licences.map((row) => ({ id: `licence:${row.id}`, daycareId: row.id, name: row.name, ownerUserIds: ownersOf(people, row.id) })),
    ...screening.map((row) => ({
      id: `screen:${row.id}`,
      daycareId: row.daycare_id,
      name: row.name,
      ownerUserIds: ownersOf(people, row.daycare_id),
    })),
  ];

  const claimed = await sql<{ id: string; name: string }>`
    select d.id, d.name
    from daycares d
    where exists (select 1 from provider_daycares p where p.daycare_id = d.id)
    limit 40
  `.catch(() => [] as Array<{ id: string; name: string }>);
  facts.spotCheckins = [];
  for (const centre of claimed) {
    const recent = await sql<{ id: string }>`
      select id from open_spots_checkins
      where daycare_id = ${centre.id} and created_at > now() - interval '7 days'
      limit 1
    `.catch(() => [] as Array<{ id: string }>);
    facts.spotCheckins.push({
      daycareId: centre.id,
      name: centre.name,
      ownerUserIds: ownersOf(people, centre.id),
      checkedThisWeek: recent.length > 0,
    });
  }

  const reviews = await sql<{ id: string; daycare_id: string; name: string }>`
    select r.id, r.daycare_id, d.name
    from reviews r
    join daycares d on d.id = r.daycare_id
    where r.created_at > now() - interval '2 days'
    limit 20
  `.catch(() => []);
  facts.reviews = reviews.map((review) => ({
    id: review.id,
    daycareId: review.daycare_id,
    name: review.name,
    ownerUserIds: ownersOf(people, review.daycare_id),
  }));

  const shifts = await sql<{
    id: string;
    daycare_id: string;
    name: string;
    staff_user_id: string | null;
    starts_at: string | Date;
    ends_at: string | Date;
    created_at: string | Date;
  }>`
    select s.id, s.daycare_id, d.name, s.staff_user_id, s.starts_at, s.ends_at, s.created_at
    from staff_shifts s
    join daycares d on d.id = s.daycare_id
    where s.ends_at > now() - interval '2 hours'
      and s.starts_at < now() + interval '36 hours'
    limit 40
  `.catch(() => []);
  facts.shifts = shifts.map((shift) => ({
    id: shift.id,
    daycareId: shift.daycare_id,
    name: shift.name,
    staffUserId: shift.staff_user_id,
    startsAt: iso(shift.starts_at),
    endsAt: iso(shift.ends_at),
    createdAt: iso(shift.created_at),
  }));

  const ratios = await sql<{
    id: string;
    daycare_id: string;
    name: string;
    children: number;
    staff_count: number;
    age_key: string;
    province: string;
  }>`
    select c.id, c.daycare_id, d.name, c.children, c.staff_count, c.age_key, c.province
    from ratio_checks c
    join daycares d on d.id = c.daycare_id
    where c.checked_at > now() - interval '6 hours'
    limit 30
  `.catch(() => []);
  const rules = await sql<{ province: string; age_key: string; staff_per_block: number; children_per_block: number }>`
    select province, age_key, staff_per_block, children_per_block from ratio_rules
  `.catch(() => [] as Array<{ province: string; age_key: string; staff_per_block: number; children_per_block: number }>);
  facts.ratios = ratios.map((ratio) => {
    const rule = rules.find((item) => item.province === ratio.province && item.age_key === ratio.age_key);
    return {
      id: ratio.id,
      daycareId: ratio.daycare_id,
      name: ratio.name,
      children: Number(ratio.children),
      staff: Number(ratio.staff_count),
      childrenPer: Number(rule?.children_per_block || 0),
      staffPer: Number(rule?.staff_per_block || 0),
      staffUserIds: staffOf(people, ratio.daycare_id),
    };
  });

  const sheets = await sql<{
    id: string;
    daycare_id: string;
    name: string;
    timezone: string | null;
    drop_off: string | null;
    pick_up: string | null;
    child_name: string;
    day: string;
  }>`
    select a.id, a.daycare_id, d.name, d.timezone, a.drop_off, a.pick_up, a.child_name, a.day
    from attendance a
    join daycares d on d.id = a.daycare_id
    where a.day = current_date
    limit 40
  `.catch(() => []);
  const checks = await sql<{ daycare_id: string; child_name: string; action: string }>`
    select daycare_id, child_name, action
    from child_check_events
    where at > now() - interval '30 hours'
    order by at asc
    limit 200
  `.catch(() => [] as Array<{ daycare_id: string; child_name: string; action: string }>);
  facts.attendance = sheets.map((sheet) => {
    const events = checks.filter((item) => item.daycare_id === sheet.daycare_id && item.child_name === sheet.child_name);
    const last = events[events.length - 1];
    return {
      id: sheet.id,
      daycareId: sheet.daycare_id,
      name: sheet.name,
      dropOff: sheet.drop_off,
      pickUp: sheet.pick_up,
      checkedIn: last?.action === "check_in",
      checkedOut: last?.action === "check_out",
      staffUserIds: staffOf(people, sheet.daycare_id),
      timeZone: sheet.timezone || "America/Winnipeg",
    };
  });

  const pickups = await sql<{
    id: string;
    daycare_id: string;
    name: string;
    pickup_name: string;
    child_name: string;
    parent_user_id: string | null;
  }>`
    select e.id, e.daycare_id, d.name, e.pickup_name, e.child_name, e.parent_user_id
    from child_check_events e
    join daycares d on d.id = e.daycare_id
    where e.action = 'check_out'
      and e.pickup_name <> ''
      and e.at > now() - interval '3 hours'
    limit 30
  `.catch(() => []);
  facts.pickups = [];
  for (const pickup of pickups) {
    const knownNames = await sql<{ name: string }>`
      select p.name
      from child_care_people p
      join children c on c.id = p.child_id
      where p.kind = 'pickup'
        and c.user_id = ${pickup.parent_user_id || ""}
        and lower(c.name) = lower(${pickup.child_name})
      limit 12
    `.catch(() => [] as Array<{ name: string }>);
    const listed = knownNames.length > 0;
    const needle = pickup.pickup_name.trim().toLowerCase();
    const known = knownNames.some((person) => person.name.trim().toLowerCase() === needle);
    facts.pickups.push({
      id: pickup.id,
      daycareId: pickup.daycare_id,
      name: pickup.name,
      listed,
      known,
      staffUserIds: staffOf(people, pickup.daycare_id),
    });
  }

  const meds = await sql<{
    id: string;
    daycare_id: string;
    name: string;
    timezone: string | null;
    schedule_times: unknown;
  }>`
    select m.id, m.daycare_id, d.name, d.timezone, m.schedule_times
    from care_medications m
    join daycares d on d.id = m.daycare_id
    where m.archived_at is null
      and (m.end_day is null or m.end_day >= current_date)
      and m.start_day <= current_date
    limit 40
  `.catch(() => []);
  facts.meds = [];
  for (const med of meds) {
    const times = Array.isArray(med.schedule_times) ? med.schedule_times : [];
    const logged = await sql<{ id: string }>`
      select id from care_medication_logs
      where medication_id = ${med.id} and day = current_date
      limit 1
    `.catch(() => [] as Array<{ id: string }>);
    for (const time of times) {
      if (typeof time !== "string") continue;
      facts.meds.push({
        id: med.id,
        daycareId: med.daycare_id,
        name: med.name,
        time,
        logged: logged.length > 0,
        staffUserIds: staffOf(people, med.daycare_id),
        timeZone: med.timezone || "America/Winnipeg",
      });
    }
  }

  const certs = await sql<{ id: string; daycare_id: string; name: string; expires_on: string }>`
    select c.id, c.daycare_id, d.name, c.expires_on
    from ece_certificates c
    join daycares d on d.id = c.daycare_id
    where c.expires_on <= current_date + 60
    limit 30
  `.catch(() => []);
  const credentials = await sql<{ id: string; daycare_id: string; name: string; expires_on: string }>`
    select c.id, c.daycare_id, d.name, c.expires_on
    from staff_credentials c
    join daycares d on d.id = c.daycare_id
    where c.expires_on is not null and c.expires_on <= current_date + 60
    limit 30
  `.catch(() => []);
  facts.certs = [...certs, ...credentials].map((cert) => ({
    id: cert.id,
    daycareId: cert.daycare_id,
    name: cert.name,
    expiresOn: iso(cert.expires_on).slice(0, 10),
    userIds: ownersOf(people, cert.daycare_id),
  }));

  const checksDue = await sql<{ daycare_id: string; name: string; last_at: string | Date | null }>`
    select d.id as daycare_id, d.name, max(r.created_at) as last_at
    from daycares d
    join centre_tool_records r on r.daycare_id = d.id and r.kind in ('maintenance', 'cleaning')
    group by d.id, d.name
    limit 40
  `.catch(() => [] as Array<{ daycare_id: string; name: string; last_at: string | Date | null }>);
  facts.safetyChecks = checksDue.map((check) => ({
    daycareId: check.daycare_id,
    name: check.name,
    lastAt: check.last_at ? iso(check.last_at) : null,
    ever: Boolean(check.last_at),
    ownerUserIds: ownersOf(people, check.daycare_id),
  }));

  const serious = await sql<{ id: string; daycare_id: string; name: string }>`
    select i.id, i.daycare_id, d.name
    from serious_incidents i
    join daycares d on d.id = i.daycare_id
    where i.filed_at is null and i.aware_at > now() - interval '7 days'
    limit 20
  `.catch(() => []);
  const care = await sql<{ id: string; daycare_id: string; name: string }>`
    select i.id, i.daycare_id, d.name
    from care_incidents i
    join daycares d on d.id = i.daycare_id
    where i.parent_notified_at is null and i.created_at > now() - interval '3 days'
    limit 20
  `.catch(() => []);
  facts.incidents = [...serious, ...care].map((incident) => ({
    id: incident.id,
    daycareId: incident.daycare_id,
    name: incident.name,
    open: true,
    staffUserIds: staffOf(people, incident.daycare_id),
  }));

  const notes = await sql<{ id: string; daycare_id: string; name: string }>`
    select c.id, c.daycare_id, d.name
    from conversations c
    join daycares d on d.id = c.daycare_id
    where c.staff_note is not null
      and btrim(c.staff_note) <> ''
      and c.last_at > now() - interval '1 day'
    limit 20
  `.catch(() => []);
  facts.notes = notes.map((note) => ({
    id: note.id,
    daycareId: note.daycare_id,
    name: note.name,
    staffUserIds: staffOf(people, note.daycare_id),
  }));

  const children = await sql<{ id: string; daycare_id: string; name: string; start_month: string }>`
    select b.id, b.daycare_id, d.name, b.start_month
    from bookings b
    join daycares d on d.id = b.daycare_id
    where b.status in ('accepted', 'active')
      and b.start_month = to_char(current_date, 'YYYY-MM')
    limit 30
  `.catch(() => [] as Array<{ id: string; daycare_id: string; name: string; start_month: string }>);
  facts.children = children.map((child) => ({
    id: child.id,
    daycareId: child.daycare_id,
    name: child.name,
    startMonth: child.start_month,
    staffUserIds: staffOf(people, child.daycare_id),
  }));

  const operator = await sql<{ id: string }>`
    select id from "user" where lower(email) = ${KIDEASE_OPERATOR_EMAIL} limit 1
  `.catch(() => [] as Array<{ id: string }>);
  const operatorId = operator[0]?.id || "";
  const signups = await sql<{ id: string; created_at: string | Date }>`
    select id, created_at from platform_events
    where kind in ('account', 'signup', 'listing')
      and created_at > now() - interval '1 day'
    limit 40
  `.catch(() => [] as Array<{ id: string; created_at: string | Date }>);
  facts.signups = signups.map((signup) => ({ id: signup.id, createdAt: iso(signup.created_at) }));
  facts.signupAdmins = operatorId ? [operatorId] : [];

  const gov = await sql<{ user_id: string; province: string }>`
    select m.user_id, upper(o.province) as province
    from government_members m
    join government_orgs o on o.id = m.org_id
    where m.status = 'active'
    limit 40
  `.catch(() => [] as Array<{ user_id: string; province: string }>);
  const reports = await sql<{ id: string; province: string | null }>`
    select r.id, upper(d.province) as province
    from safety_reports r
    left join daycares d on d.id = r.daycare_id
    where r.status = 'open'
    order by r.created_at desc
    limit 30
  `.catch(() => [] as Array<{ id: string; province: string | null }>);
  facts.safetyReports = [];
  for (const report of reports) {
    if (operatorId) facts.safetyReports.push({ id: report.id, userId: operatorId, href: "/admin" });
    for (const member of gov) {
      if (report.province && member.province === report.province) {
        facts.safetyReports.push({ id: report.id, userId: member.user_id, href: "/gov" });
      }
    }
  }

  const blocks = await sql<{ id: string }>`
    select id from safety_blocks
    where created_at > now() - interval '1 day'
    limit 20
  `.catch(() => [] as Array<{ id: string }>);
  facts.safetyBlocks = operatorId ? blocks.map((block) => ({ id: block.id, userId: operatorId, href: "/admin" })) : [];

  return facts;
}
