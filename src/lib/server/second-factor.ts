import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { healthFactorDecision, type HealthFactorDecision } from "@/lib/second-factor-policy";
import { grantsForMember, allows } from "@/lib/staff-permissions";

export class SecondFactorRequiredError extends Error {
  readonly status = 401;
  constructor() {
    super("Not authorized to open health documents until you add an email code.");
    this.name = "SecondFactorRequiredError";
  }
}

type Prefs = { parent_opt_in: boolean; provider_grace_started_at: string | null };

function asJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function readPrefs(userId: string): Promise<Prefs | null> {
  const sql = await getSql();
  const rows = await sql<Prefs>`
    select parent_opt_in, provider_grace_started_at::text as provider_grace_started_at
    from second_factor_prefs
    where user_id = ${userId}
    limit 1
  `.catch((err) => {
    console.error("[second-factor] preference table is not ready", err instanceof Error ? err.name : "error");
    return [] as Prefs[];
  });
  return rows[0] ?? null;
}

async function seesProviderHealth(userId: string): Promise<boolean> {
  const sql = await getSql();
  const owned = await sql<{ ok: number }>`
    select 1 as ok from provider_daycares where user_id = ${userId} limit 1
  `.catch(() => []);
  if (owned.length) return true;
  const members = await sql<{ role: string | null; permission_preset: string | null; permissions: unknown }>`
    select role, permission_preset, permissions
    from centre_members
    where user_id = ${userId} and status = 'active'
  `.catch(() => []);
  return members.some((row) => {
    const grants = grantsForMember({
      role: row.role,
      preset: row.permission_preset,
      permissions: asJson(row.permissions),
    });
    return allows(grants, "children", "view") || allows(grants, "documents", "view");
  });
}

async function verified(userId: string): Promise<boolean> {
  const { isCurrentUserTwoFactorVerified } = await import("@/lib/server/two-factor.server");
  return isCurrentUserTwoFactorVerified(userId);
}

async function startProviderGrace(userId: string): Promise<number> {
  const sql = await getSql();
  const now = new Date();
  await sql`
    insert into second_factor_prefs (user_id, provider_grace_started_at)
    values (${userId}, ${now.toISOString()})
    on conflict (user_id) do update
      set provider_grace_started_at = coalesce(second_factor_prefs.provider_grace_started_at, excluded.provider_grace_started_at)
  `;
  const prefs = await readPrefs(userId);
  const started = prefs?.provider_grace_started_at ? new Date(prefs.provider_grace_started_at).getTime() : now.getTime();
  return Number.isFinite(started) ? started : now.getTime();
}

export async function healthAccessDecision(userId: string, audience: "parent" | "provider"): Promise<HealthFactorDecision> {
  const prefs = await readPrefs(userId);
  const optedIn = prefs?.parent_opt_in === true;
  const now = Date.now();
  if (audience === "parent" && !optedIn) {
    return healthFactorDecision({
      audience,
      seesHealth: false,
      optedIn: false,
      verified: false,
      now,
      graceStartedAt: null,
    });
  }
  const seesHealth = audience === "provider" ? await seesProviderHealth(userId) : false;
  if (audience === "provider" && !seesHealth) {
    return healthFactorDecision({
      audience,
      seesHealth: false,
      optedIn,
      verified: false,
      now,
      graceStartedAt: null,
    });
  }
  let isVerified = false;
  try {
    isVerified = await verified(userId);
  } catch {
    isVerified = false;
  }
  let graceStartedAt = prefs?.provider_grace_started_at ? new Date(prefs.provider_grace_started_at).getTime() : null;
  if (audience === "provider" && seesHealth && !isVerified && graceStartedAt == null) {
    try {
      graceStartedAt = await startProviderGrace(userId);
    } catch (err) {
      console.error("[second-factor] could not start the grace period", err instanceof Error ? err.name : "error");
      graceStartedAt = Date.now();
    }
  }
  return healthFactorDecision({
    audience,
    seesHealth,
    optedIn: prefs?.parent_opt_in === true,
    verified: isVerified,
    now,
    graceStartedAt: Number.isFinite(graceStartedAt) ? graceStartedAt : null,
  });
}

export async function assertSensitiveFileAccess(userId: string, audience: "parent" | "provider"): Promise<void> {
  const decision = await healthAccessDecision(userId, audience);
  if (decision.redact) throw new SecondFactorRequiredError();
}

export const getEmailCodePreference = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const prefs = await readPrefs(context.userId);
    const provider = await healthAccessDecision(context.userId, "provider");
    return {
      optedIn: prefs?.parent_opt_in === true,
      providerPrompt: provider.prompt,
      providerLocked: provider.redact,
      graceEndsAt: provider.graceEndsAt,
    };
  });

export const setParentEmailCode = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { enabled?: boolean }) => ({ enabled: input?.enabled === true }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      insert into second_factor_prefs (user_id, parent_opt_in)
      values (${context.userId}, ${data.enabled})
      on conflict (user_id) do update set parent_opt_in = excluded.parent_opt_in
    `;
    return { ok: true as const, optedIn: data.enabled };
  });
