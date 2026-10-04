/**
 * Public reads and correction requests for Quebec home daycares.
 * Phone and email stay out of list payloads. This module does not send email or SMS.
 */

import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { qcHomeDaycaresEnabled } from "@/lib/features";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireAdmin } from "@/lib/server/roles";
import { assertTurnstileToken } from "@/lib/server/turnstile";
import {
  qcHomePreviewFixtureAllowed,
  qcHomePreviewSource,
  toPublicListing,
  type QcHomeLocale,
  type QcHomePublicListing,
} from "@/lib/qc-home-daycare";

type PublicRow = {
  id: string;
  slug: string;
  published_name: string;
  personal_name: boolean;
  municipality: string | null;
  neighbourhood: string | null;
  postal_fsa: string | null;
  bureau_name: string;
  source_url: string | null;
  verified_on: string | null;
  capacity: number | null;
  open_spots: number | null;
  open_spots_as_of: string | null;
  ages_served: string | null;
  fees_text: string | null;
  area_lat: number | null;
  area_lng: number | null;
  area_radius_m: number | null;
  has_phone: boolean;
  has_email: boolean;
  website: string | null;
};

function localeOf(value: unknown): QcHomeLocale {
  return value === "fr" ? "fr" : "en";
}

function yes(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function mapRow(row: PublicRow, locale: QcHomeLocale): QcHomePublicListing {
  return toPublicListing(
    {
      id: row.id,
      slug: row.slug,
      publishedName: row.published_name,
      personalName: row.personal_name,
      municipality: row.municipality,
      neighbourhood: row.neighbourhood,
      postalFsa: row.postal_fsa,
      bureauName: row.bureau_name,
      sourceUrl: row.source_url,
      verifiedOn: row.verified_on,
      capacity: row.capacity,
      openSpots: row.open_spots,
      openSpotsAsOf: row.open_spots_as_of,
      agesServed: row.ages_served,
      feesText: row.fees_text,
      areaLat: row.area_lat,
      areaLng: row.area_lng,
      areaRadiusM: row.area_radius_m,
      hasPhone: yes(row.has_phone),
      hasEmail: yes(row.has_email),
      website: row.website,
    },
    locale,
  );
}

function previewListing(locale: QcHomeLocale): QcHomePublicListing | null {
  if (!qcHomePreviewFixtureAllowed(process.env)) return null;
  return toPublicListing(qcHomePreviewSource(), locale);
}

export const listQcHomeDaycares = createServerFn({ method: "GET" })
  .validator((input: { q?: string; locale?: string }) => ({
    q: String(input?.q || "").trim().slice(0, 80),
    locale: localeOf(input?.locale),
  }))
  .handler(async ({ data }) => {
    if (!qcHomeDaycaresEnabled()) {
      return { enabled: false as const, rows: [] as QcHomePublicListing[], error: false };
    }
    const q = data.q.replace(/[%_\\]/g, "");
    const like = `%${q}%`;
    const fsa = q.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
    try {
      const sql = await getSql();
      const rows = await sql<PublicRow>`
        select
          id, slug, published_name, personal_name, municipality, neighbourhood, postal_fsa,
          bureau_name, source_url, verified_on::text as verified_on, capacity, open_spots,
          open_spots_as_of::text as open_spots_as_of, ages_served, fees_text,
          area_lat, area_lng, area_radius_m,
          (phone is not null and btrim(phone) <> '') as has_phone,
          (email is not null and btrim(email) <> '') as has_email,
          website
        from qc_home_daycares
        where (
          ${q} = ''
          or municipality ilike ${like}
          or neighbourhood ilike ${like}
          or postal_fsa = ${fsa}
        )
        order by municipality nulls last, slug
        limit 60
      `;
      const mapped = rows.map((row) => mapRow(row, data.locale));
      const preview = previewListing(data.locale);
      const withPreview =
        preview && (q === "" || preview.locationLabel.toLowerCase().includes(q.toLowerCase()) || preview.postalFsa === fsa)
          ? [preview, ...mapped.filter((row) => row.slug !== preview.slug)]
          : mapped;
      return { enabled: true as const, rows: withPreview, error: false };
    } catch {
      const preview = previewListing(data.locale);
      if (preview) return { enabled: true as const, rows: [preview], error: false };
      return { enabled: true as const, rows: [] as QcHomePublicListing[], error: true };
    }
  });

export const getQcHomeDaycare = createServerFn({ method: "GET" })
  .validator((input: { slug?: string; locale?: string }) => ({
    slug: String(input?.slug || "").trim().slice(0, 96),
    locale: localeOf(input?.locale),
  }))
  .handler(async ({ data }) => {
    if (!qcHomeDaycaresEnabled()) return { enabled: false as const, listing: null, error: false };
    const preview = previewListing(data.locale);
    if (preview && data.slug === preview.slug) return { enabled: true as const, listing: preview, error: false };
    try {
      const sql = await getSql();
      const rows = await sql<PublicRow>`
        select
          id, slug, published_name, personal_name, municipality, neighbourhood, postal_fsa,
          bureau_name, source_url, verified_on::text as verified_on, capacity, open_spots,
          open_spots_as_of::text as open_spots_as_of, ages_served, fees_text,
          area_lat, area_lng, area_radius_m,
          (phone is not null and btrim(phone) <> '') as has_phone,
          (email is not null and btrim(email) <> '') as has_email,
          website
        from qc_home_daycares
        where slug = ${data.slug}
        limit 1
      `;
      return { enabled: true as const, listing: rows[0] ? mapRow(rows[0], data.locale) : null, error: false };
    } catch {
      return { enabled: true as const, listing: null, error: true };
    }
  });

export const revealQcHomeContact = createServerFn({ method: "POST" })
  .validator((input: { slug?: string; channel?: string }) => ({
    slug: String(input?.slug || "").trim().slice(0, 96),
    channel: input?.channel === "email" ? "email" : "phone",
  }))
  .handler(async ({ data }) => {
    if (!qcHomeDaycaresEnabled()) throw new Error("This directory is not published.");
    if (qcHomePreviewFixtureAllowed(process.env) && data.slug === "preview-qc-home") {
      return { value: data.channel === "email" ? "preview@example.com" : "514-555-0100" };
    }
    const sql = await getSql();
    const rows = await sql<{ phone: string | null; email: string | null }>`
      select phone, email from qc_home_daycares where slug = ${data.slug} limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("Listing not found.");
    const value = data.channel === "email" ? row.email : row.phone;
    return { value: value?.trim() || "" };
  });

export const submitQcHomeRequest = createServerFn({ method: "POST" })
  .validator(
    (input: {
      slug?: string;
      kind?: string;
      name?: string;
      email?: string;
      message?: string;
      turnstileToken?: string;
    }) => ({
      slug: String(input?.slug || "").trim().slice(0, 96),
      kind: input?.kind === "removal" ? "removal" : "correction",
      name: String(input?.name || "").trim().slice(0, 80),
      email: String(input?.email || "").trim().slice(0, 160),
      message: String(input?.message || "").trim().slice(0, 2000),
      turnstileToken: String(input?.turnstileToken || ""),
    }),
  )
  .handler(async ({ data }) => {
    if (!qcHomeDaycaresEnabled()) throw new Error("This directory is not published.");
    await assertTurnstileToken(data.turnstileToken);
    if (data.name.length < 2) throw new Error("Add your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new Error("Add a valid email.");
    if (data.message.length < 10) throw new Error("Add a short note (at least a sentence).");
    if (qcHomePreviewFixtureAllowed(process.env) && data.slug === "preview-qc-home") {
      return { ok: true as const };
    }
    const sql = await getSql();
    const found = await sql<{ id: string }>`
      select id from qc_home_daycares where slug = ${data.slug} limit 1
    `;
    if (!found[0]) throw new Error("Listing not found.");
    const id = `qcr_${crypto.randomUUID()}`;
    await sql`
      insert into qc_home_daycare_requests (id, listing_id, kind, contact_name, contact_email, message)
      values (${id}, ${found[0].id}, ${data.kind}, ${data.name}, ${data.email}, ${data.message})
    `;
    return { ok: true as const };
  });

export type QcHomeAdminRequest = {
  id: string;
  kind: string;
  contactName: string;
  contactEmail: string;
  message: string;
  status: string;
  createdAt: string;
  slug: string;
  municipality: string | null;
  sourceName: string;
  personalName: boolean;
};

export const listQcHomeRequests = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      kind: string;
      contact_name: string;
      contact_email: string;
      message: string;
      status: string;
      created_at: string | Date;
      slug: string;
      municipality: string | null;
      published_name: string;
      personal_name: boolean;
    }>`
      select r.id, r.kind, r.contact_name, r.contact_email, r.message, r.status, r.created_at,
             d.slug, d.municipality, d.published_name, d.personal_name
      from qc_home_daycare_requests r
      join qc_home_daycares d on d.id = r.listing_id
      order by case when r.status = 'pending' then 0 else 1 end, r.created_at desc
      limit 100
    `;
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      contactName: row.contact_name,
      contactEmail: row.contact_email,
      message: row.message,
      status: row.status,
      createdAt: String(row.created_at),
      slug: row.slug,
      municipality: row.municipality,
      sourceName: row.published_name,
      personalName: row.personal_name,
    }));
  });

export const reviewQcHomeRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string }) => ({ id: String(input?.id || "").trim().slice(0, 80) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    if (!data.id) throw new Error("Missing request.");
    const sql = await getSql();
    await sql`
      update qc_home_daycare_requests
      set status = 'reviewed', reviewed_at = now()
      where id = ${data.id} and status = 'pending'
    `;
    return { ok: true as const };
  });
