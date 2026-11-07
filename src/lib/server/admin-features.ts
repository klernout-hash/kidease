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
import {
  dependencyNote,
  featureControlRegistry,
  isSensitiveControl,
  paymentHoldNote,
  presentProductFlag,
  presentSwitch,
  productFlagRows,
  validateControlReason,
  validateRequestId,
  type ControlReading,
  type FeatureCategory,
} from "@/lib/admin-feature-registry";
import { FEATURE_FLAG_KEYS, FLAG_DEFAULTS, envFlagOn, envFlagSet, peekRemoteSnapshot, remoteFlagsConfigured, type FeatureFlagKey } from "@/lib/flags";

export type FeatureCard = FeatureSwitch & {
  known: boolean;
  active: boolean;
  rollout: number;
  updatedAt: string | null;
  inPostHog: boolean;
  calls: number | null;
  trues: number | null;
  history: Array<{ id: string; actor: string; oldValue: string; newValue: string; at: string; reason?: string; source?: string }>;
};

export type FeatureControlCard = {
  id: string;
  key: string;
  name: string;
  purpose: string;
  category: FeatureCategory;
  roles: string[];
  writable: boolean;
  sensitive: boolean;
  dependencies: string[];
  dependencyNote: string | null;
  paymentHold: string | null;
  reading: ControlReading;
};

export type FeaturePage = {
  mode: "live" | "readonly";
  reason: "ok" | "key-not-set" | "unverified";
  cards: FeatureCard[];
  controls: FeatureControlCard[];
  counts: { readable: number; writable: number };
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
    reason: string | null;
    source: string | null;
    created_at: string;
  }>`
    select id, actor_user_id, flag_key, old_value, new_value, reason, source, created_at
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
        reason: "reason" in row ? String((row as { reason?: string }).reason || "") : "",
        source: "source" in row ? String((row as { source?: string }).source || "") : "",
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
  if (body == null) return { remote: new Map<string, RemoteFlag>(), stats: {}, error: "Could not read the switch service." };
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
  return { remote, stats: parseFlagStats(statsBody), error: null as string | null };
}

export function productControlCards(env: Record<string, string | undefined>): FeatureControlCard[] {
  const configured = remoteFlagsConfigured(env);
  const snap = peekRemoteSnapshot();
  const remoteState = !configured ? "missing" : snap?.ok ? "ready" : "unverified";
  return productFlagRows().map((row) => {
    const key = row.key as FeatureFlagKey;
    const raw = env[key];
    const remoteValue =
      remoteState === "ready" && snap?.flags && Object.prototype.hasOwnProperty.call(snap.flags, key)
        ? snap.flags[key]
        : undefined;
    const reading = presentProductFlag({
      envSet: envFlagSet(raw),
      envOn: envFlagSet(raw) ? envFlagOn(raw) : null,
      remoteConfigured: configured,
      remote: remoteState === "unverified" ? "unverified" : remoteValue === true || remoteValue === false ? remoteValue : "missing",
      codeDefault: FLAG_DEFAULTS[key],
    });
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      purpose: row.purpose,
      category: row.category,
      roles: row.roles,
      writable: false,
      sensitive: row.sensitive,
      dependencies: [...row.dependencies],
      dependencyNote: dependencyNote(row.key),
      paymentHold: paymentHoldNote(row.key),
      reading,
    };
  });
}

function switchControlCards(cards: FeatureCard[], error: string | null): FeatureControlCard[] {
  return featureControlRegistry()
    .filter((row) => row.kind === "posthog-switch")
    .map((row) => {
      const card = cards.find((item) => item.key === row.key);
      const reading = presentSwitch({
        known: Boolean(card?.known) && !error,
        error,
        inPostHog: Boolean(card?.inPostHog),
        active: Boolean(card?.active),
        rollout: card?.rollout ?? 0,
      });
      return {
        id: row.id,
        key: row.key,
        name: row.name,
        purpose: row.purpose,
        category: row.category,
        roles: row.roles,
        writable: row.writable && reading.effective !== "unverified" && reading.effectiveSource === "remote",
        sensitive: row.sensitive,
        dependencies: [],
        dependencyNote: null,
        paymentHold: paymentHoldNote(row.key),
        reading,
      };
    });
}

function withControls(page: Omit<FeaturePage, "controls" | "counts">, env: Record<string, string | undefined>, error: string | null): FeaturePage {
  const controls = [...productControlCards(env), ...switchControlCards(page.cards, error)];
  return {
    ...page,
    controls,
    counts: {
      readable: controls.length,
      writable: controls.filter((row) => row.writable).length,
    },
  };
}

export async function loadFeaturePage(env: Record<string, string | undefined> = process.env): Promise<FeaturePage> {
  const history = await loadHistory();
  const key = personalApiKey(env);
  if (!key) {
    const page = withControls(
      {
        mode: "readonly",
        reason: "key-not-set",
        cards: cardsFrom({ remote: new Map(), stats: {}, history, known: false }),
      },
      env,
      null,
    );
    if (responseLeaksKey(page, key)) throw new Error("refused");
    return page;
  }
  const { remote, stats, error } = await loadRemote(key);
  const page = withControls(
    {
      mode: error ? "readonly" : "live",
      reason: error ? "unverified" : "ok",
      cards: cardsFrom({ remote, stats, history, known: !error }),
    },
    env,
    error,
  );
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

async function writeAudit(actor: string, key: string, oldValue: string, newValue: string, reason: string, source: string) {
  const sql = await getSql();
  await ensureAudit(sql);
  const safeReason = reason.replace(/\s+/g, " ").trim().slice(0, 200);
  await sql`
    insert into admin_feature_audit (id, actor_user_id, flag_key, old_value, new_value, reason, source)
    values (${nid("afa")}, ${actor}, ${key}, ${oldValue}, ${newValue}, ${safeReason}, ${source})
  `;
}

const idempotentWrites = new Map<string, { ok: true } | { ok: false; error: string }>();

async function patchFlag(input: {
  secret: string;
  key: string;
  active: boolean;
  rollout: number;
  actor: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: "missing" | "posthog" | "refused" }> {
  if (!isAllowedFeatureKey(input.key)) return { ok: false, error: "refused" };
  const { remote, error } = await loadRemote(input.secret);
  if (error) return { ok: false, error: "posthog" };
  const current = remote.get(input.key);
  const live = statusFromFlag(current ?? null);
  if (!live.inPostHog || live.id == null) return { ok: false, error: "missing" };
  const body = featureFlagWriteBody({ active: input.active, rollout: input.rollout });
  const saved = await posthogJson(featureFlagUrl(live.id), input.secret, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!saved) return { ok: false, error: "posthog" };
  const nextValue = auditValue({ active: body.active, rollout: body.filters.groups[0].rollout_percentage });
  await writeAudit(input.actor, input.key, auditValue(live), nextValue, input.reason, "posthog");
  return { ok: true };
}

export const updateFeatureSwitch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { key?: string; rollout?: number; reason?: string; requestId?: string }) => ({
    key: String(input?.key || "").trim(),
    rollout: Number(input?.rollout),
    reason: String(input?.reason || ""),
    requestId: String(input?.requestId || ""),
  }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    if (!validateRequestId(data.requestId)) return { ok: false as const, error: "refused" as const };
    const idemKey = `${context.userId}:${data.requestId}`;
    const prior = idempotentWrites.get(idemKey);
    if (prior) return prior;
    if (!isAllowedFeatureKey(data.key)) return { ok: false as const, error: "refused" as const };
    const reason = validateControlReason(data.reason, isSensitiveControl(data.key));
    if (!reason.ok) return { ok: false as const, error: "refused" as const };
    const next = normalizeFeatureWrite(data.rollout);
    if (!next) return { ok: false as const, error: "refused" as const };
    const secret = personalApiKey(process.env);
    if (!secret) return { ok: false as const, error: "key-not-set" as const };
    if (!takeWriteSlot(context.userId)) return { ok: false as const, error: "slow-down" as const };
    const result = await patchFlag({
      secret,
      key: data.key,
      active: next.active,
      rollout: next.rollout,
      actor: context.userId,
      reason: reason.reason,
    });
    if (responseLeaksKey(result, secret)) return { ok: false as const, error: "refused" as const };
    idempotentWrites.set(idemKey, result);
    return result;
  });

export const saveProductFlagControl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { key?: string }) => ({ key: String(input?.key || "").trim() }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    if ((FEATURE_FLAG_KEYS as readonly string[]).includes(data.key) || data.key) {
      return { ok: false as const, error: "deployment-configuration-required" as const };
    }
    return { ok: false as const, error: "refused" as const };
  });

export const killAiFeatures = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { reason?: string; requestId?: string }) => ({
    reason: String(input?.reason || ""),
    requestId: String(input?.requestId || ""),
  }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const reason = validateControlReason(data.reason, true);
    if (!reason.ok || !validateRequestId(data.requestId)) return { ok: false as const, error: "refused" as const };
    const secret = personalApiKey(process.env);
    if (!secret) return { ok: false as const, error: "key-not-set" as const };
    if (!takeWriteSlot(context.userId)) return { ok: false as const, error: "slow-down" as const };
    const failed: string[] = [];
    for (const key of aiFeatureKeys()) {
      const result = await patchFlag({ secret, key, active: false, rollout: 0, actor: context.userId, reason: reason.reason });
      if (!result.ok && result.error !== "missing") failed.push(key);
    }
    const out = { ok: failed.length === 0, failed };
    if (responseLeaksKey(out, secret)) return { ok: false as const, error: "refused" as const };
    return out;
  });
