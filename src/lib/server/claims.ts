import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { getCatalog, catalogByIdGet } from "@/lib/catalog";
import { isAdminOnlyListing } from "@/lib/listing-visibility";
import { nid } from "@/lib/utils";
import { upsertDaycare } from "./seed";
import { callerIsAdmin } from "./public-listing";
import { mapDaycare, type DaycareRow } from "./map-row";
import { lookupUser, notifyPlatform, notifyProviderJoined } from "./notify";
import { writeProfileRole } from "./roles";
import { applyStorefrontPhoto } from "@/lib/listing-photo";

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

function asImage(raw?: string | null) {
  const v = (raw || "").trim();
  return v.startsWith("data:image") ? v : null;
}

async function storeLicensePhoto(sql: Awaited<ReturnType<typeof getSql>>, daycareId: string | null, photo: string) {
  if (daycareId) {
    await sql`update daycares set license_photo = ${photo} where id = ${daycareId}`.catch(() => undefined);
  }
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
    const admin = await callerIsAdmin();
    for (const d of await getCatalog()) {
      if (isAdminOnlyListing(d) && !admin) continue;
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
    if (isAdminOnlyListing(listed) && !(await callerIsAdmin())) {
      throw new Error("Listing not found");
    }
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
    await writeProfileRole(context.userId, "provider");
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
  .validator((input: { daycareId: string; code: string; licensePhoto?: string; turnstileToken?: string }) => input)
  .handler(async ({ context, data }) => {
    const { assertTurnstileToken } = await import("@/lib/server/turnstile");
    await assertTurnstileToken(data.turnstileToken);
    const photo = asImage(data.licensePhoto);
    if (!photo) throw new Error("Upload a photo of your provincial licence");
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
    await sql`
      update listing_claims
      set status = 'waiting', license_photo = ${photo}, verified_at = now()
      where id = ${claim.id}
    `;
    await storeLicensePhoto(sql, data.daycareId, photo);
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
    await writeProfileRole(context.userId, "provider");
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

export const submitEnrollLicense = createServerFn({ method: "POST" })
  .validator((input: {
    name: string;
    email: string;
    centre: string;
    city: string;
    phone?: string;
    body: string;
    licensePhoto: string;
    daycareId?: string;
    turnstileToken?: string;
  }) => input)
  .handler(async ({ data }) => {
    const { assertTurnstileToken } = await import("@/lib/server/turnstile");
    await assertTurnstileToken(data.turnstileToken);
    const name = data.name.trim();
    const email = data.email.trim();
    const centre = data.centre.trim();
    const city = data.city.trim();
    const body = data.body.trim();
    const photo = asImage(data.licensePhoto);
    if (!name || !email || !centre || !city || !body) throw new Error("Missing fields");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email");
    if (!photo) throw new Error("Upload a photo of your provincial licence");
    if (data.daycareId) {
      const listed = await catalogByIdGet(data.daycareId);
      if (isAdminOnlyListing(listed ?? { id: data.daycareId }) && !(await callerIsAdmin())) {
        throw new Error("Listing not found");
      }
    }
    const sql = await getSql();
    const id = nid("lic");
    await sql`
      insert into license_uploads (
        id, daycare_id, centre_name, contact_name, contact_email, city, phone, note, license_photo
      ) values (
        ${id}, ${data.daycareId || null}, ${centre.slice(0, 160)}, ${name.slice(0, 120)},
        ${email.slice(0, 200)}, ${city.slice(0, 80)}, ${(data.phone || "").trim().slice(0, 40) || null},
        ${body.slice(0, 4000)}, ${photo}
      )
    `.catch(async () => {
      await sql`
        insert into license_uploads (id, centre_name, contact_email, license_photo)
        values (${id}, ${centre.slice(0, 160)}, ${email.slice(0, 200)}, ${photo})
      `;
    });
    if (data.daycareId) await storeLicensePhoto(sql, data.daycareId, photo);
    await notifyPlatform({
      kind: "enroll",
      title: `Enroll Now: ${centre}`,
      actorName: name,
      actorEmail: email,
      daycareName: centre,
      city,
      slug: undefined,
      detail: [`Licence photo attached`, data.phone && `Phone: ${data.phone}`, body].filter(Boolean).join("\n"),
    });
    return { ok: true as const };
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
      licensePhoto?: string;
      spotsInfant: number;
      spotsToddler: number;
      spotsPreschool: number;
      infantMonthly: number;
      toddlerMonthly: number;
      preschoolMonthly: number;
      ageMinMonths: number;
      ageMaxMonths: number;
      hours?: string;
      licenseNumber?: string;
      licenseExpiry?: string;
      licensedCapacity?: number;
      touchVacancy?: boolean;
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
    let photos = applyStorefrontPhoto(current[0]?.photos ?? "", data.storefront);
    const extras = (data.interiors ?? []).filter((p) => p.startsWith("data:image") || p.startsWith("/"));
    if (extras.length) {
      const cur = photos.split(",").filter(Boolean);
      photos = [...cur, ...extras].join(",");
    }
    const minAge = Math.max(0, Math.min(216, Math.round(data.ageMinMonths)));
    const maxAge = Math.max(minAge, Math.min(216, Math.round(data.ageMaxMonths)));
    const license = asImage(data.licensePhoto);
    const hours = (data.hours ?? "").trim();
    const licenseNumber = (data.licenseNumber ?? "").trim().slice(0, 80);
    const licenseExpiry = (data.licenseExpiry ?? "").trim().slice(0, 10) || null;
    const licensedCapacity =
      typeof data.licensedCapacity === "number" && data.licensedCapacity > 0
        ? Math.min(400, Math.round(data.licensedCapacity))
        : null;
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
        ages_confirmed = 1,
        hours = case when ${hours} = '' then hours else ${hours} end,
        hours_fr = case when ${hours} = '' then hours_fr else ${hours} end,
        license_number = coalesce(${licenseNumber || null}, license_number),
        license_expiry = coalesce(${licenseExpiry}, license_expiry),
        licensed_capacity = coalesce(${licensedCapacity}, licensed_capacity),
        last_vacancy_updated_at = case
          when ${Boolean(data.touchVacancy)} then now()
          else last_vacancy_updated_at
        end
      where id = ${data.daycareId}
    `.catch(async () => {
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
    });
    if (license) {
      await storeLicensePhoto(sql, data.daycareId, license);
      await sql`
        update listing_claims set license_photo = ${license}
        where daycare_id = ${data.daycareId} and user_id = ${context.userId}
      `.catch(() => undefined);
    }
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

export const refreshVacancy = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const own = await sql<{ user_id: string }>`
      select user_id from provider_daycares
      where user_id = ${context.userId} and daycare_id = ${data.daycareId}
    `;
    if (!own[0]) throw new Error("Not your listing");
    await sql`
      update daycares
      set last_vacancy_updated_at = now()
      where id = ${data.daycareId}
    `;
    return { ok: true as const, lastVacancyUpdatedAt: new Date().toISOString() };
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
