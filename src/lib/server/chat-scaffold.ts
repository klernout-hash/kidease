import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireAdmin } from "@/lib/server/roles";
import {
  CHAT_SCAFFOLD_MESSAGE,
  chatComposerState,
  refuseScaffoldChatSend,
  type ChatComposerState,
  type ChatScaffoldSendInput,
} from "@/lib/chat-scaffold";
import { describeFeatureFlag } from "@/lib/features";
import {
  refreshRemoteFlags,
  type FlagSource,
  type RemoteFlagSnapshot,
} from "@/lib/flags";
import {
  FCM_LAB_NEXT_STEPS,
  pushCredentialsPresent,
  pushEnvPresence,
  type PushEnvPresence,
  type PushLabNextStep,
} from "@/lib/push";
import { smsCredentialsPresent, smsEnvPresence, type SmsEnvPresence } from "@/lib/sms";
import {
  TWILIO_VIDEO_LAB_NEXT_STEPS,
  videoCredentialsPresent,
  videoEnvPresence,
  type VideoEnvPresence,
  type VideoLabNextStep,
} from "@/lib/video";

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
  chat: FlagLab & { ready: false; message: string; composer: ChatComposerState };
  push: FlagLab & {
    ready: false;
    credentialsPresent: boolean;
    presence: PushEnvPresence;
    tokenCount: number;
    nextSteps: readonly PushLabNextStep[];
  };
  sms: FlagLab & { credentialsPresent: boolean; presence: SmsEnvPresence };
  video: FlagLab & {
    credentialsPresent: boolean;
    presence: VideoEnvPresence;
    sdkWired: false;
    nextSteps: readonly VideoLabNextStep[];
  };
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
  const chatFlag = toFlagLab("FEATURE_INAPP_CHAT");
  return {
    remote: {
      configured: remote.provider === "posthog",
      provider: remote.provider,
      ok: remote.ok,
      error: remote.error,
    },
    chat: {
      ...chatFlag,
      ready: false,
      message: CHAT_SCAFFOLD_MESSAGE,
      composer: chatComposerState(chatFlag.enabled),
    },
    push: {
      ...toFlagLab("FEATURE_PUSH"),
      ready: false,
      credentialsPresent: pushCredentialsPresent(),
      presence: pushEnvPresence(),
      tokenCount,
      nextSteps: FCM_LAB_NEXT_STEPS,
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
      sdkWired: false,
      nextSteps: TWILIO_VIDEO_LAB_NEXT_STEPS,
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
export async function sendScaffoldChatMessage(
  input: ChatScaffoldSendInput,
): Promise<{ ok: false; error: string }> {
  return refuseScaffoldChatSend(input);
}
