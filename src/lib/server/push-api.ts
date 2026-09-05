/**
 * Client-safe createServerFn for push register + admin dry-run.
 * Do not live in a `*.server.*` file. Token SQL is dynamically imported
 * only inside handlers so the browser never pulls the query helpers twice.
 */

import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireAdmin } from "@/lib/server/roles";
import {
  PUSH_DRY_RUN_MESSAGE,
  PUSH_SCAFFOLD_MESSAGE,
  pushCredentialsPresent,
  pushEnabled,
  pushEnvPresence,
  type PushEnvPresence,
} from "@/lib/push";

export type PushClientStatus = {
  enabled: boolean;
  credentialsPresent: boolean;
  presence: PushEnvPresence;
  nativeOnly: true;
  ready: false;
  message: string;
};

export type PushRegisterPayload = {
  token: string;
  platform: string;
  provider?: string;
  deviceId?: string;
  locale?: string;
};

export type PushRegisterFnResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; skipped: true; error: string };

export type PushDryRunFnResult = {
  ok: false;
  skipped: true;
  dryRun: true;
  tokenCount: number;
  platforms: { ios: number; android: number };
  error: string;
};

export const getPushClientStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async (): Promise<PushClientStatus> => {
    const enabled = pushEnabled();
    return {
      enabled,
      credentialsPresent: pushCredentialsPresent(),
      presence: pushEnvPresence(),
      nativeOnly: true,
      ready: false,
      message: enabled ? PUSH_DRY_RUN_MESSAGE : PUSH_SCAFFOLD_MESSAGE,
    };
  });

export const registerPushToken = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: PushRegisterPayload) => ({
    token: String(input?.token || "").trim(),
    platform: String(input?.platform || "").trim(),
    provider: input?.provider ? String(input.provider).trim() : undefined,
    deviceId: input?.deviceId ? String(input.deviceId).trim() : undefined,
    locale: input?.locale ? String(input.locale).trim() : undefined,
  }))
  .handler(async ({ context, data }): Promise<PushRegisterFnResult> => {
    const { upsertPushDeviceToken } = await import("./push-tokens");
    const sql = await getSql();
    return upsertPushDeviceToken(sql, context.userId, data);
  });

export const dryRunPush = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId?: string; title?: string; body?: string } = {}) => ({
    userId: input?.userId ? String(input.userId).trim() : undefined,
    title: input?.title ? String(input.title).trim().slice(0, 80) : undefined,
    body: input?.body ? String(input.body).trim().slice(0, 160) : undefined,
  }))
  .handler(async ({ context, data }): Promise<PushDryRunFnResult> => {
    await requireAdmin(context.userId);
    const { dryRunPushNotification } = await import("./push-tokens");
    const sql = await getSql();
    return dryRunPushNotification(data, { sql });
  });
