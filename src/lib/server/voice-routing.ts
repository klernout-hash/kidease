/**
 * Decide who a Twilio call may ring. Client identities only.
 * Personal phone numbers are used to match an inbound caller, then dropped.
 */

import { getSql } from "@/lib/db";
import { normalizeCaslPhone } from "@/lib/casl";
import { userIdFromVoiceIdentity, voiceIdentityForUser } from "@/lib/voice";

async function centreClientIdentities(daycareId: string): Promise<string[]> {
  const sql = await getSql();
  const rows = await sql.query<{ user_id: string }>(
    `select user_id from provider_daycares where daycare_id = $1
     union
     select user_id from centre_members where daycare_id = $1 and status = 'active'`,
    [daycareId],
  );
  const ids = new Set<string>();
  for (const row of rows) {
    const identity = voiceIdentityForUser(row.user_id);
    if (identity) ids.add(identity);
  }
  return [...ids];
}

/** Toll-free caller. Match a profile mobile, then ring that parent's latest daycare in the app. */
export async function identitiesForIncomingCaller(fromRaw: string): Promise<string[]> {
  const phone = normalizeCaslPhone(fromRaw);
  if (!phone) return [];
  const sql = await getSql();
  const profiles = await sql<{ user_id: string; phone: string | null }>`
    select user_id, phone from profiles where phone is not null
  `.catch(() => [] as { user_id: string; phone: string | null }[]);
  const matched = profiles
    .filter((row) => row.user_id && normalizeCaslPhone(row.phone) === phone)
    .map((row) => row.user_id);
  if (!matched.length) return [];
  const convos = await sql
    .query<{ daycare_id: string }>(
      `select daycare_id from conversations where user_id = any($1::text[]) order by last_at desc nulls last limit 1`,
      [matched],
    )
    .catch(() => [] as { daycare_id: string }[]);
  const daycareId = convos[0]?.daycare_id;
  if (!daycareId) return [];
  return centreClientIdentities(daycareId);
}

/** Browser call. The caller may ring only the other party on this thread. */
export async function identitiesForClientCall(input: {
  fromIdentity: string;
  conversationId: string;
}): Promise<string[]> {
  const parsed = userIdFromVoiceIdentity(input.fromIdentity);
  const conversationId = String(input.conversationId || "").trim();
  if (!parsed || !conversationId) return [];
  const sql = await getSql();
  const conv = await sql<{ user_id: string; daycare_id: string }>`
    select user_id, daycare_id from conversations where id = ${conversationId} limit 1
  `.catch(() => [] as { user_id: string; daycare_id: string }[]);
  if (!conv[0]) return [];
  const parentId = conv[0].user_id;
  const daycareId = conv[0].daycare_id;
  if (parsed.kind === "admin") {
    const { resolveAdminAccess } = await import("@/lib/server/roles");
    const admin = await resolveAdminAccess(parsed.userId);
    if (!admin.ok) return [];
    const staff = await centreClientIdentities(daycareId);
    const parent = voiceIdentityForUser(parentId);
    return [...staff, parent].filter((id) => id && id !== voiceIdentityForUser(parsed.userId, "admin"));
  }
  if (parsed.userId === parentId) return centreClientIdentities(daycareId);
  const { hasCentreDeskAccess } = await import("@/lib/server/centre-access");
  if (await hasCentreDeskAccess(sql, parsed.userId, daycareId)) {
    const parent = voiceIdentityForUser(parentId);
    return parent ? [parent] : [];
  }
  return [];
}

export async function recordVoiceRecording(input: { recordingSid: string; callSid: string | null }): Promise<void> {
  const recordingSid = input.recordingSid.trim();
  if (!recordingSid) return;
  const sql = await getSql();
  await sql`
    insert into voice_recordings (recording_sid, call_sid)
    values (${recordingSid}, ${input.callSid})
    on conflict (recording_sid) do nothing
  `;
}
