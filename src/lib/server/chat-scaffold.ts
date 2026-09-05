import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireAdmin } from "@/lib/server/roles";
import { CHAT_SCAFFOLD_MESSAGE, CHAT_SCAFFOLD_READY } from "@/lib/chat-scaffold";
import { inAppChatEnabled, pushEnabled, smsEnabled } from "@/lib/features";
import { pushCredentialsPresent } from "@/lib/push";
import { smsCredentialsPresent, smsEnvPresence, type SmsEnvPresence } from "@/lib/sms";

export type LabStatus = {
  chat: { enabled: boolean; ready: false; message: string };
  push: { enabled: boolean; ready: false; credentialsPresent: boolean };
  sms: { enabled: boolean; credentialsPresent: boolean; presence: SmsEnvPresence };
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
