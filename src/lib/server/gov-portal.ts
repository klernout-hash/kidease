import { createServerFn } from "@tanstack/react-start";
import { sessionBearerMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { buildGovDashboard, parseGovScope, type GovLocale } from "@/lib/gov/aggregate";
import { children0to5, childrenPerLicensedSpace, CHILDREN_0_TO_5_SOURCE } from "@/lib/gov/places";
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
  const { bundleForProvince, loadGovBundle, loadStoredLicenceFlags } = await import("@/lib/server/gov-data.server");
  assertGovBudget(actor, "read");
  // A province account stays in that province and cannot widen. All of Canada is only for an org stored as Canada.
  const scope = parseGovScope({
    province: govScopeProvince(actor, input.province),
    region: input.region,
    city: input.city,
  });
  const bundle = await loadGovBundle();
  const raw = bundleForProvince(bundle, scope.province);
  await auditGov({ userId: actor.userId, action: "login", province: scope.province });
  const view = buildGovDashboard(raw, scope, localeOf(input.locale), {
    orgName: actor.orgName,
    demo: actor.demo,
    readOnly: actor.readOnly,
  });
  const children = children0to5(scope.province);
  const spaces = typeof view.kpis.capacity === "number" ? view.kpis.capacity : null;
  return {
    ...view,
    selectors: {
      ...view.selectors,
      provinces: govProvinceChoices(view.selectors.provinces, actor),
    },
    licenceFlags: await loadStoredLicenceFlags(scope.province),
    childPopulation: children,
    childPerSpace: childrenPerLicensedSpace(children, spaces),
    childSource: CHILDREN_0_TO_5_SOURCE,
    childRatioIsProvince: scope.city !== "ALL",
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
