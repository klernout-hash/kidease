/**
 * Server-only PostHog switches. The personal key is never returned or logged.
 * Missing key: read-only, no error.
 */

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { requireAdmin } from "@/lib/server/roles";
import { nid } from "@/lib/utils";
import {
  FEATURE_SWITCHES,
  aiFeatureKeys,
  allowFeatureWrite,
  auditValue,
  featureFlagUrl,
  featureFlagsUrl,
  featureQueryUrl,
  featureFlagWriteBody,
  flagStatsQuery,
  isAllowedFeatureKey,
  normalizeFeatureWrite,
  parseFlagStats,
  personalApiKey,
  responseLeaksKey,
  statusFromFlag,
  type FeatureSwitch,
} from "@/lib/admin-features";

export type FeatureCard = FeatureSwitch & {
  known: boolean;
  active: boolean;
  rollout: number;
  updatedAt: string | null;
  inPostHog: boolean;
  calls: number | null;
  trues: number | null;
  history: Array<{ id: string; actor: string; oldValue: string; newValue: string; at: string }>;
};

export type FeaturePage = {
  mode: "live" | "readonly";
  reason: "ok" | "key-not-set";
  cards: FeatureCard[];
};

type RemoteFlag = {
  id?: number;
  key?: string;
  active?: boolean;
  updated_at?: string | null;
  created_at?: string | null;
  filters?: { groups?: Array<{ rollout_percentage?: number | null }> };
};

const writes = new Map<string, number[]>();

async function ensureAudit(sql: Sql) {
  if (!import.meta.env.SSR) return;
  const { ensureAdminFeatureAudit } = await import("./runtime-schema");
  await ensureAdminFeatureAudit(sql);
}

async function historyByFlag(sql: Sql) {
  const rows = await sql<{
    id: string;
    actor_user_id: string;
    flag_key: string;
    old_value: string;
    new_value: string;
    created_at: string;
  }>`
    select id, actor_user_id, flag_key, old_value, new_value, created_at
    from admin_feature_audit
    order by created_at desc
    limit 200
  `;
  const grouped = new Map<string, FeatureCard["history"]>();
  for (const row of rows) {
    const list = grouped.get(row.flag_key) ?? [];
    if (list.length < 5) {
      list.push({
        id: row.id,
        actor: row.actor_user_id,
        oldValue: row.old_value,
        newValue: row.new_value,
        at: row.created_at,
      });
    }
    grouped.set(row.flag_key, list);
  }
  return grouped;
}

function cardsFrom(input: {
  remote: Map<string, RemoteFlag>;
  stats: Record<string, { calls: number; trues: number }>;
  history: Map<string, FeatureCard["history"]>;
  known: boolean;
}): FeatureCard[] {
  return FEATURE_SWITCHES.map((row) => {
    const live = statusFromFlag(input.remote.get(row.key) ?? null);
    const stat = input.stats[row.key];
    return {
      ...row,
      known: input.known,
      active: input.known ? live.active : false,
      rollout: input.known ? live.rollout : 0,
      updatedAt: input.known ? live.updatedAt : null,
      inPostHog: input.known ? live.inPostHog : false,
      calls: input.known ? (stat?.calls ?? 0) : null,
      trues: input.known ? (stat?.trues ?? 0) : null,
      history: input.history.get(row.key) ?? [],
    };
  });
}

async function loadHistory() {
  try {
    const sql = await getSql();
    await ensureAudit(sql);
    return await historyByFlag(sql);
  } catch (err) {
    console.error("[kidease-features] audit skipped", err instanceof Error ? err.message : "failed");
    return new Map<string, FeatureCard["history"]>();
  }
}

async function posthogJson(url: string, key: string, init?: RequestInit): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function loadRemote(key: string) {
  const body = await posthogJson(featureFlagsUrl(), key);
  const remote = new Map<string, RemoteFlag>();
  const results = body && typeof body === "object" && Array.isArray((body as { results?: unknown }).results)
    ? ((body as { results: RemoteFlag[] }).results)
    : [];
  for (const row of results) {
    if (row.key && isAllowedFeatureKey(row.key)) remote.set(row.key, row);
  }
  const statsBody = await posthogJson(featureQueryUrl(), key, {
    method: "POST",
    body: JSON.stringify({ query: flagStatsQuery() }),
  });
  return { remote, stats: parseFlagStats(statsBody) };
}

export async function loadFeaturePage(env: Record<string, string | undefined> = process.env): Promise<FeaturePage> {
  const history = await loadHistory();
  const key = personalApiKey(env);
  if (!key) {
    const page: FeaturePage = {
      mode: "readonly",
      reason: "key-not-set",
      cards: cardsFrom({ remote: new Map(), stats: {}, history, known: false }),
    };
    if (responseLeaksKey(page, key)) throw new Error("refused");
    return page;
  }
  const { remote, stats } = await loadRemote(key);
  const page: FeaturePage = {
    mode: "live",
    reason: "ok",
    cards: cardsFrom({ remote, stats, history, known: true }),
  };
  if (responseLeaksKey(page, key)) throw new Error("refused");
  return page;
}

export const listFeatureSwitches = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    return loadFeaturePage();
  });

function takeWriteSlot(userId: string, now = Date.now()): boolean {
  const prior = writes.get(userId) ?? [];
  if (!allowFeatureWrite(prior, now)) return false;
  const next = [...prior.filter((stamp) => now - stamp < 60_000), now];
  writes.set(userId, next);
  return true;
}

async function writeAudit(actor: string, key: string, oldValue: string, newValue: string) {
  const sql = await getSql();
  await ensureAudit(sql);
  await sql`
    insert into admin_feature_audit (id, actor_user_id, flag_key, old_value, new_value)
    values (${nid("afa")}, ${actor}, ${key}, ${oldValue}, ${newValue})
  `;
}

async function patchFlag(input: {
  secret: string;
  key: string;
  active: boolean;
  rollout: number;
  actor: string;
}): Promise<{ ok: true } | { ok: false; error: "missing" | "posthog" | "refused" }> {
  if (!isAllowedFeatureKey(input.key)) return { ok: false, error: "refused" };
  const { remote } = await loadRemote(input.secret);
  const current = remote.get(input.key);
  const live = statusFromFlag(current ?? null);
  if (!live.inPostHog || live.id == null) return { ok: false, error: "missing" };
  const body = featureFlagWriteBody({ active: input.active, rollout: input.rollout });
  const saved = await posthogJson(featureFlagUrl(live.id), input.secret, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!saved) return { ok: false, error: "posthog" };
  await writeAudit(input.actor, input.key, auditValue(live), auditValue({ active: body.active, rollout: body.filters.groups[0].rollout_percentage }));
  return { ok: true };
}

export const updateFeatureSwitch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { key?: string; rollout?: number }) => ({
    key: String(input?.key || "").trim(),
    rollout: Number(input?.rollout),
  }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const secret = personalApiKey(process.env);
    if (!secret) return { ok: false as const, error: "key-not-set" as const };
    if (!isAllowedFeatureKey(data.key)) return { ok: false as const, error: "refused" as const };
    const next = normalizeFeatureWrite(data.rollout);
    if (!next) return { ok: false as const, error: "refused" as const };
    if (!takeWriteSlot(context.userId)) return { ok: false as const, error: "slow-down" as const };
    const result = await patchFlag({
      secret,
      key: data.key,
      active: next.active,
      rollout: next.rollout,
      actor: context.userId,
    });
    if (responseLeaksKey(result, secret)) return { ok: false as const, error: "refused" as const };
    return result;
  });

export const killAiFeatures = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const secret = personalApiKey(process.env);
    if (!secret) return { ok: false as const, error: "key-not-set" as const };
    if (!takeWriteSlot(context.userId)) return { ok: false as const, error: "slow-down" as const };
    const failed: string[] = [];
    for (const key of aiFeatureKeys()) {
      const result = await patchFlag({ secret, key, active: false, rollout: 0, actor: context.userId });
      if (!result.ok && result.error !== "missing") failed.push(key);
    }
    const out = { ok: failed.length === 0, failed };
    if (responseLeaksKey(out, secret)) return { ok: false as const, error: "refused" as const };
    return out;
  });
