import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireAdmin } from "@/lib/server/roles";
import { CHAT_SCAFFOLD_MESSAGE, CHAT_SCAFFOLD_READY } from "@/lib/chat-scaffold";
import { inAppChatEnabled, pushEnabled } from "@/lib/features";
import { pushCredentialsPresent } from "@/lib/push";

export type LabStatus = {
  chat: { enabled: boolean; ready: false; message: string };
  push: { enabled: boolean; ready: false; credentialsPresent: boolean };
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
  };
}

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
