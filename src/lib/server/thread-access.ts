import type { Sql } from "@/lib/db";
import { resolveAdminAccess } from "@/lib/server/roles";
import { resolveThreadAccess, type ThreadAccess } from "@/lib/threads";

export type ConversationRow = {
  id: string;
  user_id: string;
  daycare_id: string;
  name: string;
  slug: string;
  photos: string;
  phone: string | null;
  contact_email: string | null;
};

export type ConversationAccess = ThreadAccess & {
  conversation: ConversationRow;
};

export async function loadConversation(
  sql: Sql,
  conversationId: string,
): Promise<ConversationRow | null> {
  const rows = await sql<ConversationRow>`
    select c.id, c.user_id, c.daycare_id, d.name, d.slug, d.photos, d.phone, d.contact_email
    from conversations c
    join daycares d on d.id = c.daycare_id
    where c.id = ${conversationId}
    limit 1
  `;
  return rows[0] ?? null;
}

export async function isCentreOwner(sql: Sql, userId: string, daycareId: string): Promise<boolean> {
  const rows = await sql<{ n: number }>`
    select count(*)::int as n
    from provider_daycares
    where user_id = ${userId} and daycare_id = ${daycareId}
  `.catch(() => [{ n: 0 }]);
  return (rows[0]?.n ?? 0) > 0;
}

export async function resolveConversationAccess(
  sql: Sql,
  conversationId: string,
  userId: string,
): Promise<ConversationAccess | null> {
  const conversation = await loadConversation(sql, conversationId);
  if (!conversation) return null;
  const [owned, admin] = await Promise.all([
    isCentreOwner(sql, userId, conversation.daycare_id),
    resolveAdminAccess(userId)
      .then((a) => a.ok)
      .catch(() => false),
  ]);
  const access = resolveThreadAccess({
    userId,
    parentUserId: conversation.user_id,
    isCentreOwner: owned,
    isAdmin: admin,
  });
  return { ...access, conversation };
}

export async function requireConversationRead(
  sql: Sql,
  conversationId: string,
  userId: string,
): Promise<ConversationAccess> {
  const access = await resolveConversationAccess(sql, conversationId, userId);
  if (!access?.canRead) throw new Error("Conversation not found");
  return access;
}

export async function requireConversationWrite(
  sql: Sql,
  conversationId: string,
  userId: string,
): Promise<ConversationAccess> {
  const access = await resolveConversationAccess(sql, conversationId, userId);
  if (!access?.canWrite) throw new Error("Conversation not found");
  return access;
}

export async function markConversationRead(sql: Sql, conversationId: string, userId: string) {
  await sql`
    insert into conversation_reads (conversation_id, user_id, last_read_at)
    values (${conversationId}, ${userId}, now())
    on conflict (conversation_id, user_id) do update set last_read_at = now()
  `.catch(() => undefined);
}

export async function listCentreOwnerEmails(
  sql: Sql,
  daycareId: string,
): Promise<Array<{ email: string; name: string | null }>> {
  const rows = await sql<{ email: string | null; name: string | null }>`
    select u.email, u.name
    from provider_daycares p
    join "user" u on u.id = p.user_id
    where p.daycare_id = ${daycareId}
  `.catch(() => []);
  const out: Array<{ email: string; name: string | null }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const email = (row.email || "").trim();
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    out.push({ email, name: row.name });
  }
  return out;
}
