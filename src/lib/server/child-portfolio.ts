import type { Sql } from "@/lib/db";
import { emptyChild } from "@/lib/child-profile";
import {
  approvalDecision,
  daycarePortfolioView,
  portfolioGaps,
  portfolioSharedWithDaycare,
  scrubPickupList,
  type PortfolioGap,
  type PortfolioInput,
} from "@/lib/child-portfolio";
import { openHealth, revealChildHealth } from "@/lib/child-health-crypto";
import { anyGuardianBlocked, guardianCentreAccess, type RestrictionMode } from "@/lib/coparent-custody";
import type { FamilyScope } from "@/lib/coparent";
import { childPortfolioGateEnabled, coparentEmailEnabled } from "@/lib/features";
import type { Child, SpotRequest } from "@/lib/types";

type ChildFileRow = {
  id: string;
  name: string | null;
  birthdate: string | null;
  allergies: string | null;
  medical_notes: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  pickup_people: string | null;
  immunization_status: string | null;
  immunization_note: string | null;
  doctor_name: string | null;
  doctor_phone: string | null;
  home_address: string | null;
};

function asPortfolio(row: ChildFileRow | undefined, province: string): PortfolioInput | null {
  if (!row) return null;
  const open = revealChildHealth(row);
  return {
    name: open.name,
    birthdate: open.birthdate,
    allergies: openHealth(open.allergies),
    medicalNotes: openHealth(open.medical_notes),
    emergencyName: openHealth(open.emergency_name),
    emergencyPhone: openHealth(open.emergency_phone),
    pickupPeople: open.pickup_people,
    immunizationStatus: open.immunization_status,
    immunizationNote: openHealth(open.immunization_note),
    doctorName: openHealth(open.doctor_name),
    doctorPhone: openHealth(open.doctor_phone),
    homeAddress: open.home_address,
    province,
  };
}

async function loadChildFile(sql: Sql, childId: string | null, province: string) {
  if (!childId) return null;
  const rows = await sql<ChildFileRow>`
    select id, name, birthdate, allergies, medical_notes, emergency_name, emergency_phone,
           pickup_people, immunization_status, immunization_note, doctor_name, doctor_phone, home_address
    from children where id = ${childId} limit 1
  `.catch(() => []);
  return asPortfolio(rows[0], province);
}

export async function holdIncompleteBooking(sql: Sql, childId: string | null, province: string) {
  if (!childPortfolioGateEnabled()) return false;
  const child = await loadChildFile(sql, childId, province);
  return portfolioGaps(child).length > 0;
}

export async function assertEnrolmentApproval(
  sql: Sql,
  booking: { child_id: string | null; daycare_id: string; user_id: string; province: string },
) {
  if (childPortfolioGateEnabled()) {
    const child = await loadChildFile(sql, booking.child_id, booking.province);
    const decision = approvalDecision({ enabled: true, nextStatus: "accepted", child });
    if (!decision.ok) {
      const error = new Error("portfolio:incomplete");
      throw error;
    }
  }
  if (!coparentEmailEnabled()) return;
  const guardians = await guardianIds(sql, booking.user_id);
  const blocks = await blocksFor(sql, guardians, booking.daycare_id);
  const centres = await centreUserIds(sql, booking.daycare_id);
  if (
    anyGuardianBlocked({
      guardianIds: guardians,
      daycareId: booking.daycare_id,
      centreUserIds: centres,
      blocks,
    })
  ) {
    throw new Error("safety_blocked");
  }
}

export function lockedChild(child: Child): Child {
  return { ...emptyChild(), id: child.id, name: child.name, preferredName: child.preferredName || "" };
}

export async function childrenForViewer(sql: Sql, actorId: string, scope: FamilyScope, children: Child[]) {
  if (!coparentEmailEnabled()) return { children, fileLocked: false };
  const locked = await portfolioLockedFor(sql, actorId, scope);
  if (!locked) return { children, fileLocked: false };
  return { children: children.map(lockedChild), fileLocked: true };
}

async function portfolioLockedFor(sql: Sql, actorId: string, scope: FamilyScope) {
  const restricted = await sql<{ mode: string }>`
    select mode from custody_restrictions
    where guardian_user_id = ${actorId} and lifted_at is null and mode in ('restrict', 'block')
    limit 1
  `.catch(() => []);
  if (restricted[0]) return true;
  if (!scope.linked || scope.actorId === scope.dataUserId) return false;
  const verified = await sql<{ id: string }>`
    select v.id
    from coparent_verifications v
    join coparent_links l on l.id = v.link_id
    join bookings b on b.user_id = l.owner_user_id and b.daycare_id = v.daycare_id
    where l.member_user_id = ${actorId}
      and l.status = 'active'
      and v.status = 'verified'
      and b.status in ('requested', 'under_review', 'waitlist', 'accepted', 'active')
    limit 1
  `.catch(() => []);
  return !verified[0];
}

export async function assertChildFileWrite(sql: Sql, actorId: string, scope: FamilyScope) {
  if (!coparentEmailEnabled()) return;
  if (scope.access === "owner" && scope.actorId === scope.dataUserId) return;
  if (await portfolioLockedFor(sql, actorId, scope)) {
    throw new Error("A daycare must confirm you before you can change this child's file.");
  }
}

export type CentreGuardianView = {
  userId: string;
  name: string;
  role: "owner" | "member";
  verified: boolean;
  pickup: boolean;
  messaging: boolean;
  restriction: RestrictionMode | null;
  restrictionId: string | null;
  linkId: string | null;
};

async function guardianIds(sql: Sql, ownerId: string) {
  const links = await sql<{ owner_user_id: string; member_user_id: string | null }>`
    select owner_user_id, member_user_id from coparent_links
    where status = 'active' and (owner_user_id = ${ownerId} or member_user_id = ${ownerId})
  `.catch(() => []);
  const ids = new Set<string>([ownerId]);
  for (const link of links) {
    if (link.owner_user_id) ids.add(link.owner_user_id);
    if (link.member_user_id) ids.add(link.member_user_id);
  }
  return [...ids];
}

async function centreUserIds(sql: Sql, daycareId: string) {
  const owners = await sql<{ user_id: string }>`
    select user_id from provider_daycares where daycare_id = ${daycareId}
  `.catch(() => []);
  const staff = await sql<{ user_id: string }>`
    select user_id from centre_members where daycare_id = ${daycareId} and status = 'active'
  `.catch(() => []);
  return [...new Set([...owners, ...staff].map((row) => row.user_id).filter(Boolean))];
}

async function blocksFor(sql: Sql, guardianIds: string[], daycareId: string) {
  if (!guardianIds.length) return [];
  const first = guardianIds[0] || "";
  const second = guardianIds[1] || "";
  const rows = await sql<{
    blocker_user_id: string;
    blocked_user_id: string | null;
    daycare_id: string | null;
  }>`
    select blocker_user_id, blocked_user_id, daycare_id
    from safety_blocks
    where daycare_id = ${daycareId}
       or blocker_user_id = ${first}
       or blocked_user_id = ${first}
       or blocker_user_id = ${second}
       or blocked_user_id = ${second}
  `.catch(() => []);
  return rows.map((row) => ({
    blockerUserId: row.blocker_user_id,
    blockedUserId: row.blocked_user_id,
    daycareId: row.daycare_id,
  }));
}

export async function decorateCentreRequests(sql: Sql, rows: SpotRequest[]): Promise<SpotRequest[]> {
  const portfolioOn = childPortfolioGateEnabled();
  const custodyOn = coparentEmailEnabled();
  if (!portfolioOn && !custodyOn) return rows;
  const next: SpotRequest[] = [];
  for (const row of rows) {
    const shared = portfolioSharedWithDaycare(row.status);
    let child = row.child ?? null;
    let gaps: PortfolioGap[] = [];
    if (portfolioOn) {
      const input: PortfolioInput = {
        name: child?.name || row.childName,
        birthdate: child?.birthdate || row.birthdate,
        allergies: child?.allergies || row.allergies,
        medicalNotes: child?.medicalNotes,
        emergencyName: child?.emergencyName,
        emergencyPhone: child?.emergencyPhone,
        pickupPeople: child?.pickupPeople,
        immunizationStatus: child?.immunizationStatus,
        immunizationNote: child?.immunizationNote,
        doctorName: child?.doctorName,
        doctorPhone: child?.doctorPhone,
        homeAddress: child?.homeAddress,
        province: row.province,
      };
      gaps = portfolioGaps(input);
      if (!shared) {
        child = null;
      } else if (child) {
        const view = daycarePortfolioView(input);
        child = {
          ...emptyChild(),
          id: child.id,
          name: view.name,
          birthdate: view.birthdate,
          allergies: view.allergies,
          medicalNotes: view.medicalNotes,
          emergencyName: view.emergencyName,
          emergencyPhone: view.emergencyPhone,
          pickupPeople: view.pickupPeople,
          immunizationStatus: view.immunizationStatus,
          immunizationNote: view.immunizationNote,
          doctorName: view.doctorName,
          doctorPhone: view.doctorPhone,
          homeAddress: view.homeAddress,
        };
      }
    }
    let guardians: CentreGuardianView[] | undefined;
    let familyBlocked = false;
    if (custodyOn && row.parentUserId) {
      const packed = await guardiansFor(sql, row.parentUserId, row.daycareId, row.childId);
      guardians = packed.guardians;
      familyBlocked = packed.blocked;
      if (child && shared) {
        const hidden = packed.guardians.filter((person) => !person.pickup).map((person) => person.name);
        child = { ...child, pickupPeople: scrubPickupList(child.pickupPeople, hidden) };
      }
    }
    next.push({
      ...row,
      child: shared ? child : portfolioOn ? null : row.child,
      allergies: shared ? child?.allergies || "" : portfolioOn ? "" : row.allergies,
      epiPen: shared ? row.epiPen : portfolioOn ? false : row.epiPen,
      portfolioComplete: portfolioOn ? gaps.length === 0 && shared : undefined,
      portfolioGaps: portfolioOn ? gaps : undefined,
      guardians,
      familyBlocked: custodyOn ? familyBlocked : undefined,
      custodyOn: custodyOn || undefined,
    });
  }
  return next;
}

async function guardiansFor(sql: Sql, ownerId: string, daycareId: string, childId: string | null) {
  const links = await sql<{ id: string; owner_user_id: string; member_user_id: string | null }>`
    select id, owner_user_id, member_user_id from coparent_links
    where status = 'active' and owner_user_id = ${ownerId}
  `.catch(() => []);
  const link = links[0];
  const ids = [ownerId, link?.member_user_id].filter((id): id is string => Boolean(id));
  const names = await displayNames(sql, ids);
  const verified = link
    ? await sql<{ status: string }>`
        select status from coparent_verifications
        where link_id = ${link.id} and daycare_id = ${daycareId}
        limit 1
      `.catch(() => [])
    : [];
  const restrictions = childId
    ? await sql<{ id: string; guardian_user_id: string; mode: string }>`
        select id, guardian_user_id, mode from custody_restrictions
        where daycare_id = ${daycareId} and child_id = ${childId} and lifted_at is null
      `.catch(() => [])
    : [];
  const limitFor = (userId: string) => restrictions.find((row) => row.guardian_user_id === userId);
  const modeFor = (userId: string): RestrictionMode | null => {
    const mode = limitFor(userId)?.mode;
    return mode === "restrict" || mode === "block" ? mode : null;
  };
  const memberVerified = verified[0]?.status === "verified";
  const guardians: CentreGuardianView[] = [
    {
      userId: ownerId,
      name: names.get(ownerId) || "Parent",
      role: "owner",
      ...accessFields(true, modeFor(ownerId)),
      restrictionId: limitFor(ownerId)?.id || null,
      linkId: link?.id || null,
    },
  ];
  if (link?.member_user_id) {
    guardians.push({
      userId: link.member_user_id,
      name: names.get(link.member_user_id) || "Parent",
      role: "member",
      ...accessFields(memberVerified, modeFor(link.member_user_id)),
      restrictionId: limitFor(link.member_user_id)?.id || null,
      linkId: link.id,
    });
  }
  const blocks = await blocksFor(sql, ids, daycareId);
  const centres = await centreUserIds(sql, daycareId);
  const blocked = anyGuardianBlocked({
    guardianIds: ids,
    daycareId,
    centreUserIds: centres,
    blocks,
  });
  return { guardians, blocked };
}

function accessFields(verified: boolean, restriction: RestrictionMode | null) {
  const access = guardianCentreAccess({ verified, restriction });
  return {
    verified: restriction ? false : verified,
    pickup: access.pickup,
    messaging: access.messaging,
    restriction,
  };
}

async function displayNames(sql: Sql, ids: string[]) {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const rows = await sql<{ id: string; name: string | null }>`
    select id, name from "user" where id = ${ids[0] || ""} or id = ${ids[1] || ""}
  `.catch(() => []);
  for (const row of rows) map.set(row.id, (row.name || "").trim());
  return map;
}
