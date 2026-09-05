import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireAdmin } from "@/lib/server/roles";
import { CHAT_SCAFFOLD_MESSAGE, CHAT_SCAFFOLD_READY } from "@/lib/chat-scaffold";
import { inAppChatEnabled, pushEnabled, smsEnabled, videoEnabled } from "@/lib/features";
import { pushCredentialsPresent } from "@/lib/push";
import { smsCredentialsPresent, smsEnvPresence, type SmsEnvPresence } from "@/lib/sms";
import { videoCredentialsPresent, videoEnvPresence, type VideoEnvPresence } from "@/lib/video";

export type LabStatus = {
  chat: { enabled: boolean; ready: false; message: string };
  push: { enabled: boolean; ready: false; credentialsPresent: boolean };
  sms: { enabled: boolean; credentialsPresent: boolean; presence: SmsEnvPresence };
  video: { enabled: boolean; credentialsPresent: boolean; presence: VideoEnvPresence };
};

export async function resolveLabStatus(): Promise<LabStatus> {
  return {
    chat: {
      enabled: inAppChatEnabled(),
      ready: false,
      message: CHAT_SCAFFOLD_MESSAGE,
    },
    push: {
      enabled: pushEnabled(),
      ready: false,
      credentialsPresent: pushCredentialsPresent(),
    },
    sms: {
      enabled: smsEnabled(),
      credentialsPresent: smsCredentialsPresent(),
      presence: smsEnvPresence(),
    },
    video: {
      enabled: videoEnabled(),
      credentialsPresent: videoCredentialsPresent(),
      presence: videoEnvPresence(),
    },
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
