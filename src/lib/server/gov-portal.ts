import { createServerFn } from "@tanstack/react-start";
import { sessionBearerMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { buildGovDashboard, parseGovScope, type GovLocale } from "@/lib/gov/aggregate";

type GovActor = {
  userId: string;
  orgId: string;
  orgName: string;
  province: string;
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
  const { bundleForProvince, loadGovBundle } = await import("@/lib/server/gov-data.server");
  assertGovBudget(actor, "read");
  const scope = parseGovScope({
    province: input.province || actor.province,
    region: input.region,
    city: input.city,
  });
  const bundle = await loadGovBundle();
  const raw = bundleForProvince(bundle, scope.province);
  await auditGov({ userId: actor.userId, action: "login", province: scope.province });
  return buildGovDashboard(raw, scope, localeOf(input.locale), {
    orgName: actor.orgName,
    demo: actor.demo,
    readOnly: actor.readOnly,
  });
}

export const getGovSession = createServerFn({ method: "GET" })
  .middleware([sessionBearerMiddleware])
  .handler(async ({ context }) => {
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const { loadGovActor } = await import("@/lib/server/gov-actor.server");
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
