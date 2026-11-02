/**
 * Server-side home address filter.
 * Guests receive a stable area circle. Connected parents, the verified
 * owner's public opt-in, and admin or government desks receive the street.
 * This module does not write over street, postal, or coordinates.
 */

import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import {
  addressLineForViewer,
  bookingUnlocksHomeAddress,
  enrolmentUnlocksHomeAddress,
  isHomeDaycare,
  providerReplyUnlocksAddress,
  tourUnlocksHomeAddress,
  verifiedOwnerClaim,
  waitlistUnlocksHomeAddress,
} from "@/lib/home-address-privacy";
import {
  approximateHomePoint,
  GUEST_HOME_VIEWER,
  sealHomeRecords,
  viewerSeesHome,
  type HomeViewer,
} from "@/lib/home-address-seal";
import { authMiddleware } from "@/lib/auth/middleware";
import { assertCentreCanMutateListing } from "@/lib/server/centre-access";
import { resolveAdminAccess } from "@/lib/server/roles";

export {
  approximateHomePoint,
  GUEST_HOME_VIEWER,
  presentMapView,
  presentPin,
  protectHomeRecord,
  sealHomeRecords,
  type HomeViewer,
} from "@/lib/home-address-seal";


export async function loadHomeViewer(): Promise<HomeViewer> {
  try {
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const user = await getSessionUser();
    if (!user?.id) return GUEST_HOME_VIEWER;
    const sql = await getSql();
    const [admin, profile] = await Promise.all([
      resolveAdminAccess(user.id).catch(() => ({ ok: false as const, role: "parent" })),
      sql<{ role: string | null }>`select role from profiles where user_id = ${user.id} limit 1`.catch(
        () => [] as { role: string | null }[],
      ),
    ]);
    const role = String(profile[0]?.role || "").toLowerCase();
    if (admin.ok || role === "admin" || role === "government") {
      return { userId: user.id, revealAll: true, revealIds: new Set() };
    }
    const familyId = await familyDataUserId(user.id);
    const ids = [...new Set([user.id, familyId].filter(Boolean))];
    const [owned, unlocked] = await Promise.all([ownedDaycareIds(sql, ids), unlockedDaycareIds(sql, ids)]);
    return { userId: user.id, revealAll: false, revealIds: new Set([...owned, ...unlocked]) };
  } catch {
    return GUEST_HOME_VIEWER;
  }
}

async function familyDataUserId(userId: string): Promise<string> {
  try {
    const { familyScopeFor } = await import("@/lib/server/coparent");
    const scope = await familyScopeFor(userId);
    return scope.dataUserId || userId;
  } catch {
    return userId;
  }
}

async function ownedDaycareIds(sql: Sql, ids: string[]): Promise<string[]> {
  const [a, b] = idPair(ids);
  const rows = await sql<{ daycare_id: string }>`
    select daycare_id from provider_daycares where user_id = ${a} or user_id = ${b}
    union
    select daycare_id from centre_members
    where status = 'active' and (user_id = ${a} or user_id = ${b})
  `.catch(() => [] as { daycare_id: string }[]);
  return rows.map((row) => row.daycare_id);
}

function idPair(ids: string[]): [string, string] {
  const first = ids[0] || "";
  return [first, ids[1] || first];
}

async function unlockedDaycareIds(sql: Sql, ids: string[]): Promise<string[]> {
  const [a, b] = idPair(ids);
  const rows = await sql<{ daycare_id: string }>`
    select daycare_id from tour_requests
    where (user_id = ${a} or user_id = ${b})
      and (
        status in ('accepted', 'completed', 'enrolled')
        or nullif(window_id, '') is not null
      )
    union
    select daycare_id from enrolment_handoffs
    where parent_user_id = ${a} or parent_user_id = ${b}
    union
    select daycare_id from parent_enrolment_agreements
    where (parent_user_id = ${a} or parent_user_id = ${b})
      and status in ('sent', 'parent_signed', 'completed')
    union
    select daycare_id from daycare_waitlist
    where (user_id = ${a} or user_id = ${b}) and status = 'accepted'
    union
    select daycare_id from bookings
    where (user_id = ${a} or user_id = ${b}) and status in ('accepted', 'active')
    union
    select c.daycare_id
    from conversations c
    join messages m on m.conversation_id = c.id
    where (c.user_id = ${a} or c.user_id = ${b})
      and m.sender = 'provider'
      and coalesce(m.kind, 'chat') = 'chat'
      and m.body not ilike '%We received your request%'
      and m.body not ilike '%Nous avons bien reçu la demande%'
      and m.body not ilike 'Enrolment request received%'
      and m.body not ilike '%added you to the waitlist%'
  `.catch(() => [] as { daycare_id: string }[]);
  return rows.map((row) => row.daycare_id);
}

export async function sealPublicHomes<T>(value: T): Promise<T> {
  const viewer = await loadHomeViewer();
  return sealHomeRecords(value, viewer);
}


export type HomeThreadPlace = {
  protected: boolean;
  line: string;
  lat: number;
  lng: number;
  radiusM: number | null;
};

export async function homeThreadPlace(
  sql: Sql,
  daycareId: string,
  userId: string,
  role: string,
): Promise<HomeThreadPlace | null> {
  const rows = await sql<{
    id: string;
    address: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
    lat: number | null;
    lng: number | null;
    facility_type: string | null;
    amenities: string | null;
    show_public_address: boolean | null;
  }>`
    select id, address, city, province, postal_code, lat, lng, facility_type, amenities, show_public_address
    from daycares
    where id = ${daycareId}
    limit 1
  `.catch(() => []);
  const row = rows[0];
  if (!row || row.lat == null || row.lng == null) return null;
  const home = isHomeDaycare({
    facility_type: row.facility_type,
    amenities: row.amenities,
    show_public_address: row.show_public_address,
  });
  const staff = role === "centre" || role === "admin";
  const viewer = staff
    ? { userId, revealAll: true, revealIds: new Set<string>() }
    : await loadHomeViewer();
  const seeExact = staff || viewerSeesHome(viewer, { ...row, id: row.id, show_public_address: row.show_public_address });
  if (!home || seeExact) {
    return {
      protected: false,
      line: addressLineForViewer({
        address: row.address,
        city: row.city,
        province: row.province,
        postalCode: row.postal_code,
        seeExact: true,
      }),
      lat: Number(row.lat),
      lng: Number(row.lng),
      radiusM: null,
    };
  }
  const approx = approximateHomePoint(row.id, Number(row.lat), Number(row.lng));
  return {
    protected: true,
    line: addressLineForViewer({
      address: row.address,
      city: row.city,
      province: row.province,
      postalCode: row.postal_code,
      seeExact: false,
    }),
    lat: approx.lat,
    lng: approx.lng,
    radiusM: approx.radiusM,
  };
}

export const setHomePublicAddress = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; show: boolean }) => ({
    daycareId: String(input?.daycareId || "").trim(),
    show: input?.show === true,
  }))
  .handler(async ({ context, data }) => {
    if (!data.daycareId) throw new Error("Choose a listing.");
    const sql = await getSql();
    await assertCentreCanMutateListing(sql, context.userId, data.daycareId);
    const rows = await sql<{
      id: string;
      claim_status: string | null;
      claimed_at: string | null;
      facility_type: string | null;
      amenities: string | null;
    }>`
      select id, claim_status, claimed_at, facility_type, amenities
      from daycares
      where id = ${data.daycareId}
      limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("Listing not found");
    if (!isHomeDaycare(row)) throw new Error("Centres already show their street address.");
    if (!verifiedOwnerClaim(row.claim_status, row.claimed_at)) {
      throw new Error("Verify your claim before showing the street address.");
    }
    await sql`
      update daycares
      set show_public_address = ${data.show}
      where id = ${data.daycareId}
    `;
    return { ok: true as const, showPublicAddress: data.show };
  });

export function connectionFromRow(input: {
  tourStatus?: string | null;
  windowId?: string | null;
  enrolmentStatus?: string | null;
  waitlistStatus?: string | null;
  bookingStatus?: string | null;
  providerBodies?: string[];
}) {
  return {
    tourAccepted: ["accepted", "completed", "enrolled"].includes(String(input.tourStatus || "").toLowerCase()),
    tourBooked: tourUnlocksHomeAddress({ status: input.tourStatus, windowId: input.windowId }) && Boolean(input.windowId),
    enrolled: enrolmentUnlocksHomeAddress(input.enrolmentStatus) || bookingUnlocksHomeAddress(input.bookingStatus),
    waitlistAccepted: waitlistUnlocksHomeAddress(input.waitlistStatus),
    daycareReplied: (input.providerBodies || []).some((body) => providerReplyUnlocksAddress(body)),
  };
}
