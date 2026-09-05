/**
 * Device-token register + dry-run send. No live FCM / APNs HTTP.
 * Flag / token helpers are duplicated from src/lib/push.ts so Node tests resolve.
 *
 * FEATURE_PUSH defaults off. Register refuses to persist when the flag is off.
 * send / dry-run never leave this process.
 */

export const PUSH_SCAFFOLD_MESSAGE =
  "Push is scaffolded only. FEATURE_PUSH is off until Kyle adds Firebase and Apple credentials.";

export const PUSH_DISABLED_MESSAGE =
  "Push registration is off. FEATURE_PUSH is unset or 0 — www and production stay silent.";

export const PUSH_DRY_RUN_MESSAGE =
  "Dry-run only. No notification was sent. Live send is not wired.";

export const PUSH_WEB_BLOCKED_MESSAGE =
  "Push registration is native-only (iOS / Android). www does not collect tokens.";

type EnvMap = Record<string, string | undefined>;

export type PushPlatform = "ios" | "android";
export type PushProvider = "fcm" | "apns";

export type PushRegisterInput = {
  token: string;
  platform: string;
  provider?: string;
  deviceId?: string;
  locale?: string;
};

export type ValidPushRegister = {
  token: string;
  platform: PushPlatform;
  provider: PushProvider;
  deviceId: string;
  locale: string;
};

export type PushRegisterResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; skipped: true; error: string };

export type PushTokenRow = {
  id: string;
  user_id: string;
  token: string;
  platform: PushPlatform;
  provider: PushProvider;
};

export type PushDryRunResult = {
  ok: false;
  skipped: true;
  dryRun: true;
  tokenCount: number;
  platforms: { ios: number; android: number };
  error: string;
};

type Sql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

function flagOn(raw: string | undefined | null): boolean {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function pushEnabled(env: EnvMap = process.env): boolean {
  return flagOn(env.FEATURE_PUSH);
}

export function isPushToken(value: string): boolean {
  return /^[\x21-\x7E]{16,4096}$/.test(value);
}

export function parsePushPlatform(raw: unknown): PushPlatform | null {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (v === "ios" || v === "android") return v;
  return null;
}

export function parsePushProvider(raw: unknown, platform?: PushPlatform | null): PushProvider | null {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (v === "fcm" || v === "apns") return v;
  if (!v && platform === "ios") return "apns";
  if (!v && platform === "android") return "fcm";
  return null;
}

export function validateRegisterInput(input: PushRegisterInput): { ok: true; data: ValidPushRegister } | { ok: false; error: string } {
  const token = String(input.token || "").trim();
  if (!isPushToken(token)) return { ok: false, error: "A valid device token is required." };
  const platform = parsePushPlatform(input.platform);
  if (!platform) return { ok: false, error: PUSH_WEB_BLOCKED_MESSAGE };
  const provider = parsePushProvider(input.provider, platform);
  if (!provider) return { ok: false, error: "provider must be fcm or apns." };
  const deviceId = String(input.deviceId || "")
    .trim()
    .slice(0, 120);
  const localeRaw = String(input.locale || "")
    .trim()
    .toLowerCase()
    .slice(0, 12);
  const locale = localeRaw === "fr" || localeRaw.startsWith("fr-") ? "fr" : localeRaw === "en" || localeRaw.startsWith("en-") ? "en" : "";
  return { ok: true, data: { token, platform, provider, deviceId, locale } };
}

export function newPushTokenId(): string {
  return `pt_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/**
 * Persist a device token for the signed-in user. No-ops when FEATURE_PUSH is off.
 * Upserts on token so a reinstall / re-login moves the row to the current user.
 */
export async function upsertPushDeviceToken(
  sql: Sql,
  userId: string,
  input: PushRegisterInput,
  env: EnvMap = process.env,
): Promise<PushRegisterResult> {
  if (!pushEnabled(env)) {
    return { ok: false, skipped: true, error: PUSH_DISABLED_MESSAGE };
  }
  const parsed = validateRegisterInput(input);
  if (!parsed.ok) return { ok: false, skipped: true, error: parsed.error };

  const existing = await sql.query<{ id: string }>(
    `select id from push_device_tokens where token = $1 limit 1`,
    [parsed.data.token],
  );
  if (existing[0]) {
    await sql.query(
      `update push_device_tokens
       set user_id = $1, platform = $2, provider = $3, device_id = $4, locale = $5, last_seen_at = now()
       where id = $6`,
      [
        userId,
        parsed.data.platform,
        parsed.data.provider,
        parsed.data.deviceId || null,
        parsed.data.locale || null,
        existing[0].id,
      ],
    );
    return { ok: true, id: existing[0].id, created: false };
  }

  const id = newPushTokenId();
  await sql.query(
    `insert into push_device_tokens (id, user_id, token, platform, provider, device_id, locale)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      userId,
      parsed.data.token,
      parsed.data.platform,
      parsed.data.provider,
      parsed.data.deviceId || null,
      parsed.data.locale || null,
    ],
  );
  return { ok: true, id, created: true };
}

export async function listPushDeviceTokens(sql: Sql, userId?: string): Promise<PushTokenRow[]> {
  if (userId) {
    return sql.query<PushTokenRow>(
      `select id, user_id, token, platform, provider from push_device_tokens where user_id = $1`,
      [userId],
    );
  }
  return sql.query<PushTokenRow>(`select id, user_id, token, platform, provider from push_device_tokens`);
}

export async function countPushDeviceTokens(sql: Sql): Promise<number> {
  const rows = await sql.query<{ n: number }>(`select count(*)::int as n from push_device_tokens`).catch(() => [{ n: 0 }]);
  return rows[0]?.n ?? 0;
}

/**
 * Admin / server dry-run. Looks up stored tokens and returns counts.
 * Never calls a vendor. FEATURE_PUSH off still returns a skipped dry-run.
 */
export async function dryRunPushNotification(
  input: { userId?: string; title?: string; body?: string },
  opts: { sql: Sql; env?: EnvMap },
): Promise<PushDryRunResult> {
  const env = opts.env || process.env;
  void String(input.title || "").slice(0, 80);
  void String(input.body || "").slice(0, 160);
  if (!pushEnabled(env)) {
    return {
      ok: false,
      skipped: true,
      dryRun: true,
      tokenCount: 0,
      platforms: { ios: 0, android: 0 },
      error: PUSH_SCAFFOLD_MESSAGE,
    };
  }
  const rows = await listPushDeviceTokens(opts.sql, input.userId).catch(() => [] as PushTokenRow[]);
  const platforms = { ios: 0, android: 0 };
  for (const row of rows) {
    if (row.platform === "ios") platforms.ios += 1;
    if (row.platform === "android") platforms.android += 1;
  }
  console.info("[kidease-push]", {
    event: "dry-run",
    tokenCount: rows.length,
    platforms,
    scoped: Boolean(input.userId),
  });
  return {
    ok: false,
    skipped: true,
    dryRun: true,
    tokenCount: rows.length,
    platforms,
    error: PUSH_DRY_RUN_MESSAGE,
  };
}
