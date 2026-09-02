import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { getCatalog, catalogByIdGet } from "@/lib/catalog";
import { nid } from "@/lib/utils";
import { upsertDaycare } from "./seed";
import { mapDaycare, type DaycareRow } from "./map-row";
import { lookupUser, notifyProviderJoined } from "./notify";

export type ClaimHit = {
  id: string;
  slug: string;
  name: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
  photo: string;
  claimed: boolean;
  licenseNumber: string;
};

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export const searchClaimable = createServerFn({ method: "POST" })
  .validator((query: string) => query)
  .handler(async ({ data: query }) => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [] as ClaimHit[];
    const sql = await getSql();
    const claimed = await sql<{ id: string }>`
      select id from daycares where claimed_at is not null
    `.catch(() => [] as { id: string }[]);
    const taken = new Set(claimed.map((r) => r.id));
    const scored: Array<ClaimHit & { score: number }> = [];
    for (const d of await getCatalog()) {
      const name = d.name.toLowerCase();
      const city = d.city.toLowerCase();
      const addr = d.address.toLowerCase();
      const postal = d.postalCode.toLowerCase();
      const lic = (d.licenseNumber || "").toLowerCase();
      let score = 0;
      if (name.startsWith(q)) score = 100;
      else if (name.includes(q)) score = 80;
      else if (city.startsWith(q) || city.includes(q)) score = 60;
      else if (addr.includes(q)) score = 40;
      else if (lic.includes(q)) score = 30;
      else if (postal.includes(q)) score = 20;
      else continue;
      scored.push({
        id: d.id,
        slug: d.slug,
        name: d.name,
        address: d.address,
        city: d.city,
        province: d.province,
        postalCode: d.postalCode,
        phone: d.phone,
        photo: d.photos[0] ?? "/photos/cottage.jpg",
        claimed: taken.has(d.id),
        licenseNumber: d.licenseNumber || "",
        score,
      });
    }
    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return scored.slice(0, 10).map(({ score: _s, ...hit }) => hit);
  });

export const startClaim = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((daycareId: string) => daycareId)
  .handler(async ({ context, data: daycareId }) => {
    const listed = await catalogByIdGet(daycareId);
    if (!listed) throw new Error("Listing not found");
    const sql = await getSql();
    const existing = await sql<{ user_id: string }>`
      select user_id from provider_daycares where daycare_id = ${daycareId} limit 1
    `;
    if (existing[0] && existing[0].user_id !== context.userId) {
      throw new Error("This listing is already claimed");
    }
    if (existing[0]?.user_id === context.userId) {
      return { alreadyOwned: true as const, daycareId, slug: listed.slug, code: "" };
    }
    await upsertDaycare(sql, listed);
    const pending = await sql<{ id: string; code: string }>`
      select id, code from listing_claims
      where user_id = ${context.userId} and daycare_id = ${daycareId} and status = 'pending'
      order by created_at desc limit 1
    `;
    const code = pending[0]?.code ?? makeCode();
    if (!pending[0]) {
      await sql`
        insert into listing_claims (id, daycare_id, user_id, code, status)
        values (${nid("cl")}, ${daycareId}, ${context.userId}, ${code}, ${"pending"})
      `;
    }
    await sql`
      update daycares set claim_status = 'pending' where id = ${daycareId} and claimed_at is null
    `;
    await sql`update profiles set role = 'provider' where user_id = ${context.userId}`;
    return {
      alreadyOwned: false as const,
      daycareId,
      slug: listed.slug,
      code,
      centreName: listed.name,
      phone: listed.phone,
    };
  });

export const verifyClaim = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; code: string; licensePhoto?: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ id: string; code: string }>`
      select id, code from listing_claims
      where user_id = ${context.userId} and daycare_id = ${data.daycareId} and status = 'pending'
      order by created_at desc limit 1
    `;
    const claim = rows[0];
    if (!claim) throw new Error("No pending claim");
    if (claim.code.toUpperCase() !== data.code.trim().toUpperCase()) {
      throw new Error("That code does not match");
    }
    const photo = data.licensePhoto?.startsWith("data:image") ? data.licensePhoto : null;
    await sql`
      update listing_claims
      set status = 'waiting', license_photo = ${photo}, verified_at = now()
      where id = ${claim.id}
    `;
    await sql`
      insert into provider_daycares (user_id, daycare_id)
      values (${context.userId}, ${data.daycareId})
      on conflict (user_id, daycare_id) do nothing
    `;
    await sql`
      update daycares
      set claim_status = 'waiting'
      where id = ${data.daycareId} and claimed_at is null
    `;
    await sql`update profiles set role = 'provider' where user_id = ${context.userId}`;
    const actor = await lookupUser(context.userId);
    const listedAfter = await catalogByIdGet(data.daycareId);
    try {
      await notifyProviderJoined({
        kind: "claim",
        daycareName: listedAfter?.name,
        address: listedAfter?.address,
        city: listedAfter?.city,
        province: listedAfter?.province,
        slug: listedAfter?.slug,
        providerName: actor.name,
        providerEmail: actor.email,
      });
    } catch (err) {
      console.error("[kidease-mail] claim notify failed", err);
    }
    return { ok: true as const, status: "waiting" as const };
  });

export const updateListing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      daycareId: string;
      name: string;
      address: string;
      city: string;
      province: string;
      postalCode: string;
      phone: string;
      email: string;
      storefront?: string;
      interiors?: string[];
      spotsInfant: number;
      spotsToddler: number;
      spotsPreschool: number;
      infantMonthly: number;
      toddlerMonthly: number;
      preschoolMonthly: number;
      ageMinMonths: number;
      ageMaxMonths: number;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const own = await sql<{ user_id: string }>`
      select user_id from provider_daycares
      where user_id = ${context.userId} and daycare_id = ${data.daycareId}
    `;
    if (!own[0]) throw new Error("Not your listing");
    const current = await sql<{ photos: string }>`select photos from daycares where id = ${data.daycareId}`;
    let photos = current[0]?.photos ?? "";
    if (data.storefront?.startsWith("data:image") || data.storefront?.startsWith("/")) {
      const rest = photos.split(",").filter((p) => p && p !== data.storefront);
      photos = [data.storefront, ...rest].join(",");
    }
    const extras = (data.interiors ?? []).filter((p) => p.startsWith("data:image") || p.startsWith("/"));
    if (extras.length) {
      const cur = photos.split(",").filter(Boolean);
      photos = [...cur, ...extras].join(",");
    }
    const minAge = Math.max(0, Math.min(216, Math.round(data.ageMinMonths)));
    const maxAge = Math.max(minAge, Math.min(216, Math.round(data.ageMaxMonths)));
    await sql`
      update daycares set
        name = ${data.name.trim()},
        name_fr = ${data.name.trim()},
        address = ${data.address.trim()},
        city = ${data.city.trim()},
        province = ${data.province.trim() || "MB"},
        postal_code = ${data.postalCode.trim()},
        phone = ${data.phone.trim() || null},
        contact_email = ${data.email.trim() || null},
        photos = ${photos},
        spots_infant = ${Math.max(0, data.spotsInfant)},
        spots_toddler = ${Math.max(0, data.spotsToddler)},
        spots_preschool = ${Math.max(0, data.spotsPreschool)},
        infant_monthly = ${data.infantMonthly},
        toddler_monthly = ${data.toddlerMonthly},
        preschool_monthly = ${data.preschoolMonthly},
        age_min_months = ${minAge},
        age_max_months = ${maxAge},
        ages_confirmed = 1
      where id = ${data.daycareId}
    `;
    return { ok: true as const };
  });

export const getMyClaims = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      daycare_id: string;
      code: string;
      status: string;
      name: string;
    }>`
      select c.id, c.daycare_id, c.code, c.status, d.name
      from listing_claims c
      join daycares d on d.id = c.daycare_id
      where c.user_id = ${context.userId}
      order by c.created_at desc
    `.catch(() => []);
    return rows;
  });

export async function overlayClaimed<T extends { id: string }>(
  items: T[],
  merge: (item: T, row: ReturnType<typeof mapDaycare>) => T,
) {
  if (!items.length) return items;
  try {
    const sql = await getSql();
    const rows = await sql<DaycareRow>`
      select * from daycares where claimed_at is not null
    `.catch(() => [] as DaycareRow[]);
    if (!rows.length) return items;
    const byId = new Map(rows.map((r) => [r.id, mapDaycare(r)]));
    return items.map((item) => {
      const claimed = byId.get(item.id);
      return claimed ? merge(item, claimed) : item;
    });
  } catch {
    return items;
  }
}
