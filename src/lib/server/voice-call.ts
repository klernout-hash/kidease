/**
 * Client-safe server functions for in-app calls.
 * The token is minted here and returned only to the signed-in caller.
 * Phone numbers are not included.
 */

import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { VOICE_CREDENTIALS_MESSAGE, voiceCredentialsPresent, voiceIdentityForUser } from "@/lib/voice";

export type VoiceDesk = "parent" | "provider" | "admin";

export type VoiceCallStatus = {
  conversationId: string;
  allowed: boolean;
  desk: VoiceDesk | null;
  peerLabel: string;
  credentialsPresent: boolean;
  error: string;
};

export type VoiceTokenResult =
  | {
      ok: true;
      token: string;
      identity: string;
      ttlSeconds: number;
      desk: VoiceDesk;
      peerLabel: string;
    }
  | { ok: false; error: string };

async function loadThread(userId: string, conversationId: string): Promise<VoiceCallStatus> {
  const sql = await getSql();
  const rows = await sql<{
    user_id: string;
    daycare_id: string;
    daycare_name: string;
    parent_name: string | null;
  }>`
    select c.user_id, c.daycare_id, d.name as daycare_name, u.name as parent_name
    from conversations c
    join daycares d on d.id = c.daycare_id
    left join "user" u on u.id = c.user_id
    where c.id = ${conversationId}
    limit 1
  `.catch(() => []);
  const credentialsPresent = voiceCredentialsPresent();
  if (!rows[0]) {
    return {
      conversationId,
      allowed: false,
      desk: null,
      peerLabel: "",
      credentialsPresent,
      error: "This call was not found.",
    };
  }
  const { resolveAdminAccess } = await import("@/lib/server/roles");
  const admin = await resolveAdminAccess(userId).catch(() => ({ ok: false as const }));
  let desk: VoiceDesk | null = null;
  if (admin.ok) desk = "admin";
  else if (rows[0].user_id === userId) desk = "parent";
  else {
    const { hasCentreDeskAccess } = await import("@/lib/server/centre-access");
    if (await hasCentreDeskAccess(sql, userId, rows[0].daycare_id)) desk = "provider";
  }
  if (!desk) {
    return {
      conversationId,
      allowed: false,
      desk: null,
      peerLabel: "",
      credentialsPresent,
      error: "This call was not found.",
    };
  }
  const parentName = (rows[0].parent_name || "").trim();
  const peerLabel =
    desk === "provider" ? parentName || "Parent" : (rows[0].daycare_name || "").trim() || "Daycare";
  return {
    conversationId,
    allowed: true,
    desk,
    peerLabel,
    credentialsPresent,
    error: credentialsPresent ? "" : VOICE_CREDENTIALS_MESSAGE,
  };
}

export const getVoiceCallStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((conversationId: string) => String(conversationId || "").trim())
  .handler(async ({ context, data }) => loadThread(context.userId, data));

export const mintThreadVoiceToken = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { conversationId: string }) => ({
    conversationId: String(input?.conversationId || "").trim(),
  }))
  .handler(async ({ context, data }): Promise<VoiceTokenResult> => {
    const { blockViewAsSideEffect } = await import("@/lib/view-as-public");
    blockViewAsSideEffect("call");
    const status = await loadThread(context.userId, data.conversationId);
    if (!status.allowed || !status.desk) return { ok: false, error: "This call was not found." };
    if (!status.credentialsPresent) return { ok: false, error: status.error || VOICE_CREDENTIALS_MESSAGE };
    const { createVoiceAccessToken } = await import("./voice");
    const identity = voiceIdentityForUser(context.userId, status.desk === "admin" ? "admin" : "user");
    const token = createVoiceAccessToken({ identity });
    if (!token.ok) return { ok: false, error: token.error };
    return {
      ok: true,
      token: token.token,
      identity: token.identity,
      ttlSeconds: token.ttlSeconds,
      desk: status.desk,
      peerLabel: status.peerLabel,
    };
  });
