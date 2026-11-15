import { createServerFn } from "@tanstack/react-start";
import { sessionBearerMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { buildGovDashboard, parseGovScope, type GovLocale } from "@/lib/gov/aggregate";
import { children0to5, childRatioForView, canonicalGovCity, CHILDREN_0_TO_5_SOURCE } from "@/lib/gov/places";
import { bundleForScope } from "@/lib/gov/bundle";
import { govProvinceChoices, govScopeProvince } from "@/lib/gov/province-choice";
import { govPortalFooterEnabled } from "@/lib/features";

type GovActor = {
  userId: string;
  orgId: string;
  orgName: string;
  province: string;
  national: boolean;
  demo: boolean;
  readOnly: boolean;
};

function localeOf(value: string | null | undefined): GovLocale {
  return value === "fr" ? "fr" : "en";
}

export async function dashboardForActor(
  actor: GovActor,
  input: { province?: string | null; region?: string | null; city?: string | null; locale?: string | null },
) {
  const { assertGovBudget, auditGov } = await import("@/lib/server/gov-actor.server");
  const { loadGovBundle, loadStoredLicenceFlags } = await import("@/lib/server/gov-data.server");
  assertGovBudget(actor, "read");
  // A province account stays in that province and cannot widen. All of Canada is only for an org stored as Canada.
  const scope = parseGovScope({
    province: govScopeProvince(actor, input.province),
    region: input.region,
    city: input.city,
  });
  const bundle = await loadGovBundle();
  const raw = bundleForScope(bundle, scope);
  await auditGov({ userId: actor.userId, action: "login", province: scope.province });
  const view = buildGovDashboard(raw, scope, localeOf(input.locale), {
    orgName: actor.orgName,
    demo: actor.demo,
    readOnly: actor.readOnly,
  });
  // Census children are counted province-wide, so the ratio only applies to a whole province or Canada.
  const wholeView = scope.city === "ALL" && scope.region === "ALL";
  const spaces = typeof view.kpis.capacity === "number" ? view.kpis.capacity : null;
  return {
    ...view,
    selectors: {
      ...view.selectors,
      provinces: govProvinceChoices(view.selectors.provinces, actor),
    },
    licenceFlags: await loadStoredLicenceFlags(scope.province),
    childPopulation: wholeView ? children0to5(scope.province) : null,
    childPerSpace: childRatioForView(scope.province, wholeView, spaces),
    childSource: CHILDREN_0_TO_5_SOURCE,
    childRatioNarrowView: !wholeView,
  };
}

export const getGovSession = createServerFn({ method: "GET" })
  .middleware([sessionBearerMiddleware])
  .handler(async ({ context }) => {
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const { loadGovActor } = await import("@/lib/server/gov-actor.server");
    if (!govPortalFooterEnabled()) return { ok: false as const, closed: true as const };
    const user = await getSessionUser(context.bearerToken);
    if (!user) return { ok: false as const };
    const actor = await loadGovActor(user.id);
    if (!actor) return { ok: false as const };
    return {
      ok: true as const,
      orgName: actor.orgName,
      province: actor.province,
      demo: actor.demo,
      readOnly: actor.readOnly,
    };
  });

export type GovCentreLine = {
  slug: string;
  name: string;
  city: string;
  licensed: boolean;
};

export type GovCentreDetail = {
  slug: string;
  name: string;
  city: string;
  province: string;
  licenceNumber: string | null;
  capacity: number | null;
  claimed: boolean;
};

function cityNames(province: string, city: string): string[] {
  const canon = canonicalGovCity(province, city);
  if (canon === "Winnipeg") return ["winnipeg", "wpg", "winnpeg"];
  return [canon.toLowerCase()];
}

export const listGovCentres = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .validator((input: { province?: string; city?: string } | undefined) => ({
    province: String(input?.province || "").trim().slice(0, 8).toUpperCase(),
    city: String(input?.city || "").trim().slice(0, 80),
  }))
  .handler(async ({ data }): Promise<GovCentreLine[]> => {
    if (!data.province || !data.city || data.city === "ALL") return [];
    const { getSql } = await import("@/lib/db");
    const { PUBLIC_LISTING_SQL } = await import("@/lib/listing-visibility");
    const sql = await getSql();
    const names = cityNames(data.province, data.city);
    const rows = await sql
      .query<{ slug: string; name: string; city: string; license_number: string | null }>(
        `select slug, name, btrim(city) as city, license_number
         from daycares
         where ${PUBLIC_LISTING_SQL}
           and upper(btrim(coalesce(province, ''))) = $1
           and lower(btrim(coalesce(city, ''))) = any($2::text[])
         order by name
         limit 200`,
        [data.province, names],
      )
      .catch(() => []);
    return rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      city: row.city,
      licensed: Boolean(String(row.license_number || "").trim()),
    }));
  });

export const getGovCentre = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .validator((slug: string) => String(slug || "").trim().slice(0, 140))
  .handler(async ({ data: slug }): Promise<GovCentreDetail | null> => {
    if (!slug) return null;
    const { getSql } = await import("@/lib/db");
    const { PUBLIC_LISTING_SQL } = await import("@/lib/listing-visibility");
    const sql = await getSql();
    const rows = await sql
      .query<{
        slug: string;
        name: string;
        city: string | null;
        province: string | null;
        license_number: string | null;
        licensed_capacity: number | null;
        claimed_at: string | null;
        claim_status: string | null;
      }>(
        `select slug, name, city, province, license_number, licensed_capacity, claimed_at::text as claimed_at, claim_status
         from daycares
         where slug = $1 and ${PUBLIC_LISTING_SQL}
         limit 1`,
        [slug],
      )
      .catch(() => []);
    const row = rows[0];
    if (!row) return null;
    const status = String(row.claim_status || "").trim().toLowerCase();
    return {
      slug: row.slug,
      name: row.name,
      city: row.city || "",
      province: row.province || "",
      licenceNumber: String(row.license_number || "").trim() || null,
      capacity: row.licensed_capacity == null ? null : Number(row.licensed_capacity),
      claimed: Boolean(row.claimed_at) || ["approved", "live", "active", "published"].includes(status),
    };
  });

export const getGovDashboard = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .validator((input: { province?: string; region?: string; city?: string; locale?: string } | undefined) => ({
    province: String(input?.province || "").slice(0, 8),
    region: String(input?.region || "").slice(0, 80),
    city: String(input?.city || "").slice(0, 80),
    locale: input?.locale === "fr" ? "fr" : "en",
  }))
  .handler(async ({ data, context }) => {
    const gov = context.gov as GovActor;
    return dashboardForActor(gov, data);
  });
