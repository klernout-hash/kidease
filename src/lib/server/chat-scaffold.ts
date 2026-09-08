import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireAdmin } from "@/lib/server/roles";
import { CHAT_SCAFFOLD_MESSAGE, CHAT_SCAFFOLD_READY } from "@/lib/chat-scaffold";
import { describeFeatureFlag } from "@/lib/features";
import {
  refreshRemoteFlags,
  type FlagSource,
  type RemoteFlagSnapshot,
} from "@/lib/flags";
import { pushCredentialsPresent, pushEnvPresence, type PushEnvPresence } from "@/lib/push";
import { smsCredentialsPresent, smsEnvPresence, type SmsEnvPresence } from "@/lib/sms";
import { videoCredentialsPresent, videoEnvPresence, type VideoEnvPresence } from "@/lib/video";

export type FlagLab = {
  enabled: boolean;
  source: FlagSource;
  envEnabled: boolean;
  remoteValue: boolean | null;
};

export type LabStatus = {
  remote: {
    configured: boolean;
    provider: RemoteFlagSnapshot["provider"];
    ok: boolean;
    error?: string;
  };
  chat: FlagLab & { ready: false; message: string };
  push: FlagLab & {
    ready: false;
    credentialsPresent: boolean;
    presence: PushEnvPresence;
    tokenCount: number;
  };
  sms: FlagLab & { credentialsPresent: boolean; presence: SmsEnvPresence };
  video: FlagLab & { credentialsPresent: boolean; presence: VideoEnvPresence };
  subscriptions: FlagLab;
};

function toFlagLab(key: Parameters<typeof describeFeatureFlag>[0]): FlagLab {
  const d = describeFeatureFlag(key);
  return {
    enabled: d.enabled,
    source: d.source,
    envEnabled: d.envEnabled,
    remoteValue: d.remoteValue,
  };
}

export async function resolveLabStatus(): Promise<LabStatus> {
  const remote = await refreshRemoteFlags();
  let tokenCount = 0;
  try {
    const { getSql } = await import("@/lib/db");
    const { countPushDeviceTokens } = await import("./push-tokens");
    const sql = await getSql();
    tokenCount = await countPushDeviceTokens(sql);
  } catch {
    tokenCount = 0;
  }
  return {
    remote: {
      configured: remote.provider === "posthog",
      provider: remote.provider,
      ok: remote.ok,
      error: remote.error,
    },
    chat: {
      ...toFlagLab("FEATURE_INAPP_CHAT"),
      ready: false,
      message: CHAT_SCAFFOLD_MESSAGE,
    },
    push: {
      ...toFlagLab("FEATURE_PUSH"),
      ready: false,
      credentialsPresent: pushCredentialsPresent(),
      presence: pushEnvPresence(),
      tokenCount,
    },
    sms: {
      ...toFlagLab("FEATURE_SMS"),
      credentialsPresent: smsCredentialsPresent(),
      presence: smsEnvPresence(),
    },
    video: {
      ...toFlagLab("FEATURE_VIDEO"),
      credentialsPresent: videoCredentialsPresent(),
      presence: videoEnvPresence(),
    },
    subscriptions: toFlagLab("FEATURE_PROVIDER_SUBSCRIPTIONS"),
  };
}

/** Client-safe createServerFn. Do not live in a `*.server.*` file. */
export const getLabStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    return resolveLabStatus();
  });

/** Stub — never sends. Kept so a later client can call one function name. */
export async function sendScaffoldChatMessage(_input: {
  threadId: string;
  body: string;
}): Promise<{ ok: false; error: string }> {
  void _input;
  void CHAT_SCAFFOLD_READY;
  return { ok: false, error: CHAT_SCAFFOLD_MESSAGE };
}
