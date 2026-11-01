import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { openHealth, sealHealth } from "@/lib/child-health-crypto";
import { listAccessibleDaycareIds } from "@/lib/server/centre-access";
import { ENROLLED_BOOKING_STATUSES } from "@/lib/review-gate";
import {
  childProfileEnabled,
  childProfileMode,
  daycareMaySeeProfile,
  parseCarePeople,
  pickupAllowed,
  type CarePerson,
} from "@/lib/wiring/child-profile";
import { daycareUserIds, deliverNotice, newId } from "@/lib/server/wiring/runtime";

const ENROLLED = ENROLLED_BOOKING_STATUSES;

async function ownsChild(userId: string, childId: string) {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    select id from children where id = ${childId} and user_id = ${userId} limit 1
  `;
  return Boolean(rows[0]);
}

export const childProfileDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { childId?: string; daycareId?: string } | undefined) => ({
    childId: String(input?.childId || "").slice(0, 80),
    daycareId: String(input?.daycareId || "").slice(0, 80),
  }))
  .handler(async ({ context, data }) => {
    if (!childProfileEnabled()) return { enabled: false as const };
    const sql = await getSql();
    const children = await sql<{ id: string; name: string }>`
      select id, name from children where user_id = ${context.userId} order by created_at desc limit 12
    `;
    if (!data.childId) return { enabled: true as const, mode: childProfileMode(), children, profile: null };
    if (!(await ownsChild(context.userId, data.childId))) return { enabled: true as const, error: "child" as const, children };
    const health = await sql<{ allergies: string | null; medical_notes: string | null }>`
      select allergies, medical_notes from children where id = ${data.childId} limit 1
    `;
    const people = await sql<{ kind: string; name: string; phone: string; relationship: string }>`
      select kind, name, phone, relationship from child_care_people where child_id = ${data.childId}
    `.catch(() => []);
    return {
      enabled: true as const,
      mode: childProfileMode(),
      children,
      profile: {
        allergies: openHealth(health[0]?.allergies),
        medical: openHealth(health[0]?.medical_notes),
        pickups: people.filter((row) => row.kind === "pickup"),
        emergency: people.filter((row) => row.kind === "emergency"),
      },
    };
  });

export const saveChildProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    childId?: string;
    daycareId?: string;
    allergies?: string;
    medical?: string;
    pickups?: CarePerson[];
    emergency?: CarePerson[];
    shared?: boolean;
  }) => input)
  .handler(async ({ context, data }) => {
    if (!childProfileEnabled()) return { ok: false as const, error: "off" };
    const childId = String(data.childId || "").slice(0, 80);
    const daycareId = String(data.daycareId || "").slice(0, 80);
    if (!(await ownsChild(context.userId, childId))) return { ok: false as const, error: "child" };
    const pickups = parseCarePeople(data.pickups);
    const emergency = parseCarePeople(data.emergency);
    if ("error" in pickups || "error" in emergency) return { ok: false as const, error: "people" };
    const sql = await getSql();
    await sql`
      update children
      set allergies = ${sealHealth(data.allergies || null)},
          medical_notes = ${sealHealth(data.medical || null)}
      where id = ${childId} and user_id = ${context.userId}
    `;
    await sql`delete from child_care_people where child_id = ${childId}`;
    for (const person of pickups) {
      await sql`
        insert into child_care_people (id, child_id, kind, name, phone, relationship)
        values (${newId("cp")}, ${childId}, ${"pickup"}, ${person.name}, ${person.phone}, ${person.relationship})
      `;
    }
    for (const person of emergency) {
      await sql`
        insert into child_care_people (id, child_id, kind, name, phone, relationship)
        values (${newId("ce")}, ${childId}, ${"emergency"}, ${person.name}, ${person.phone}, ${person.relationship})
      `;
    }
    if (daycareId) {
      const enrolled = await sql<{ id: string }>`
        select id from bookings
        where user_id = ${context.userId} and daycare_id = ${daycareId}
          and status in (${ENROLLED[0]}, ${ENROLLED[1]})
        limit 1
      `;
      if (!enrolled[0]) return { ok: false as const, error: "enrol" };
      await sql`
        insert into child_profile_shares (child_id, daycare_id, shared)
        values (${childId}, ${daycareId}, ${data.shared ? 1 : 0})
        on conflict (child_id, daycare_id) do update set shared = excluded.shared
      `;
      if (data.shared) {
        const mode = childProfileMode();
        for (const userId of await daycareUserIds(daycareId)) {
          await deliverNotice({
            feature: "child_profile",
            flag: "FEATURE_CHILD_PROFILE",
            mode,
            userId,
            role: "provider",
            title: "Child profile updated",
            body: "A parent updated care details for an enrolled child.",
            href: "/provider/child-profile",
            senderUserId: context.userId,
            wantSms: true,
          });
        }
      }
    }
    await sql`
      insert into child_profile_access (id, child_id, actor_id, action, daycare_id)
      values (${newId("cpa")}, ${childId}, ${context.userId}, ${"save"}, ${daycareId || null})
    `.catch(() => undefined);
    return { ok: true as const };
  });

export const centreChildProfiles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string }) => ({ daycareId: String(input?.daycareId || "").slice(0, 80) }))
  .handler(async ({ context, data }) => {
    if (!childProfileEnabled()) return { enabled: false as const, rows: [] };
    const sql = await getSql();
    const ids = await listAccessibleDaycareIds(sql, context.userId);
    if (!ids.includes(data.daycareId)) return { enabled: true as const, rows: [] };
    const rows = await sql<{
      child_id: string;
      allergies: string | null;
      medical_notes: string | null;
    }>`
      select s.child_id, c.allergies, c.medical_notes
      from child_profile_shares s
      join children c on c.id = s.child_id
      join bookings b on b.user_id = c.user_id and b.daycare_id = s.daycare_id
      where s.daycare_id = ${data.daycareId} and s.shared = 1
        and b.status in (${ENROLLED[0]}, ${ENROLLED[1]})
    `.catch(() => []);
    const visible = [];
    for (const row of rows) {
      if (!daycareMaySeeProfile({ enrolled: true, shared: true })) continue;
      const people = await sql<{ kind: string; name: string; phone: string; relationship: string }>`
        select kind, name, phone, relationship from child_care_people where child_id = ${row.child_id}
      `;
      visible.push({
        childId: row.child_id,
        allergies: openHealth(row.allergies),
        medical: openHealth(row.medical_notes),
        pickups: people.filter((person) => person.kind === "pickup"),
        emergency: people.filter((person) => person.kind === "emergency"),
      });
    }
    return { enabled: true as const, rows: visible };
  });

export const checkPickup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; childId?: string; name?: string }) => ({
    daycareId: String(input?.daycareId || "").slice(0, 80),
    childId: String(input?.childId || "").slice(0, 80),
    name: String(input?.name || "").slice(0, 80),
  }))
  .handler(async ({ context, data }) => {
    if (!childProfileEnabled()) return { ok: false as const, error: "off" };
    const sql = await getSql();
    const ids = await listAccessibleDaycareIds(sql, context.userId);
    if (!ids.includes(data.daycareId)) return { ok: false as const, error: "centre" };
    const share = await sql<{ shared: number; user_id: string }>`
      select s.shared, c.user_id
      from child_profile_shares s
      join children c on c.id = s.child_id
      where s.child_id = ${data.childId} and s.daycare_id = ${data.daycareId}
      limit 1
    `;
    if (!share[0] || !daycareMaySeeProfile({ enrolled: true, shared: Number(share[0].shared) === 1 })) {
      return { ok: false as const, error: "hidden" };
    }
    const people = await sql<CarePerson>`
      select name, phone, relationship from child_care_people
      where child_id = ${data.childId} and kind = 'pickup'
    `;
    const decision = pickupAllowed(data.name, people);
    await sql`
      insert into child_pickup_checks (id, child_id, daycare_id, person_name, ok)
      values (${newId("pk")}, ${data.childId}, ${data.daycareId}, ${data.name}, ${decision.ok ? 1 : 0})
    `;
    const mode = childProfileMode();
    await deliverNotice({
      feature: "child_profile",
      flag: "FEATURE_CHILD_PROFILE",
      mode,
      userId: share[0].user_id,
      role: "parent",
      title: decision.ok ? "Pickup checked" : "Pickup needs a check",
      body: decision.ok
        ? "The daycare checked an authorized pickup person."
        : "The daycare could not match the pickup person to your list.",
      href: "/parent/child-profile",
      senderUserId: context.userId,
      wantSms: true,
    });
    return { ok: decision.ok, reason: decision.ok ? undefined : decision.reason };
  });
