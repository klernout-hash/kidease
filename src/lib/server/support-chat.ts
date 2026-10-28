import { createServerFn } from "@tanstack/react-start";
import { nid } from "@/lib/utils";
import {
  agentReplyText,
  liveChatAgentPhone,
  liveChatSmsBody,
  LIVE_CHAT_AGENT_LABEL,
  randomSessionToken,
  randomTicketCode,
} from "@/lib/support-chat";
import { sendSms } from "@/lib/server/sms";

type Sql = {
  query: (text: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;
};

export type SupportChatMessage = {
  id: string;
  sender: "visitor" | "agent" | "system";
  body: string;
  createdAt: string;
  label: string;
};

async function sqlClient(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return (await getSql()) as unknown as Sql;
}

function rowString(row: Record<string, unknown>, key: string) {
  return String(row[key] ?? "");
}

async function insertMessage(sql: Sql, threadId: string, sender: "visitor" | "agent" | "system", body: string) {
  const id = nid("scm");
  await sql.query(
    `insert into support_chat_messages (id, thread_id, sender, body) values ($1, $2, $3, $4)`,
    [id, threadId, sender, body.slice(0, 2000)],
  );
  await sql.query(`update support_chat_threads set updated_at = now() where id = $1`, [threadId]);
  return id;
}

async function textAgent(input: { code: string; name: string; page: string; message: string }) {
  const to = liveChatAgentPhone();
  try {
    await sendSms(
      { to, body: liveChatSmsBody(input), audience: "internal" },
      { operatorAlert: true },
    );
  } catch {
    /* The thread is saved even when the text cannot leave. */
  }
}

export async function openSupportChat(input: {
  message: string;
  name?: string | null;
  userId?: string | null;
  page?: string | null;
}): Promise<{ code: string; sessionToken: string } | null> {
  try {
    const sql = await sqlClient();
    const id = nid("sct");
    const sessionToken = randomSessionToken();
    let code = randomTicketCode();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await sql.query(
          `insert into support_chat_threads (id, code, session_token, visitor_name, visitor_user_id, page)
           values ($1, $2, $3, $4, $5, $6)`,
          [id, code, sessionToken, (input.name || "Guest").slice(0, 80), input.userId || null, (input.page || "/").slice(0, 120)],
        );
        break;
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (!/unique|duplicate/i.test(message) || attempt === 3) throw err;
        code = randomTicketCode();
      }
    }
    const body = input.message.trim().slice(0, 2000) || "Visitor asked for a person.";
    await insertMessage(sql, id, "visitor", body);
    await textAgent({ code, name: input.name || "Guest", page: input.page || "/", message: body });
    return { code, sessionToken };
  } catch {
    return null;
  }
}

export async function postSupportChatMessage(input: {
  sessionToken: string;
  message: string;
  page?: string | null;
}): Promise<{ ok: true; code: string } | { ok: false }> {
  const token = input.sessionToken.trim();
  const message = input.message.trim().slice(0, 2000);
  if (!token || !message) return { ok: false };
  try {
    const sql = await sqlClient();
    const rows = await sql.query(
      `select id, code, visitor_name, page from support_chat_threads where session_token = $1 and status = 'open' limit 1`,
      [token],
    );
    const thread = rows[0];
    if (!thread) return { ok: false };
    const id = rowString(thread, "id");
    const code = rowString(thread, "code");
    await insertMessage(sql, id, "visitor", message);
    await textAgent({
      code,
      name: rowString(thread, "visitor_name") || "Guest",
      page: input.page || rowString(thread, "page") || "/",
      message,
    });
    return { ok: true, code };
  } catch {
    return { ok: false };
  }
}

export async function readSupportChat(sessionToken: string): Promise<SupportChatMessage[]> {
  const token = sessionToken.trim();
  if (!token) return [];
  try {
    const sql = await sqlClient();
    const rows = await sql.query(
      `select m.id, m.sender, m.body, m.created_at
       from support_chat_messages m
       join support_chat_threads t on t.id = m.thread_id
       where t.session_token = $1
       order by m.created_at asc
       limit 80`,
      [token],
    );
    return rows.map((row) => {
      const sender = rowString(row, "sender") === "agent" ? "agent" : rowString(row, "sender") === "system" ? "system" : "visitor";
      return {
        id: rowString(row, "id"),
        sender,
        body: rowString(row, "body"),
        createdAt: rowString(row, "created_at"),
        label: sender === "agent" ? LIVE_CHAT_AGENT_LABEL : "",
      };
    });
  } catch {
    return [];
  }
}

export async function routeAgentSms(input: { code: string | null; body: string }): Promise<boolean> {
  const text = agentReplyText(input.body);
  if (!text) return false;
  try {
    const sql = await sqlClient();
    let threadId = "";
    if (input.code) {
      const rows = await sql.query(
        `select id from support_chat_threads where code = $1 and status = 'open' limit 1`,
        [input.code],
      );
      threadId = rowString(rows[0] || {}, "id");
    }
    if (!threadId) {
      const rows = await sql.query(
        `select id from support_chat_threads where status = 'open' order by updated_at desc limit 1`,
      );
      threadId = rowString(rows[0] || {}, "id");
    }
    if (!threadId) return false;
    await insertMessage(sql, threadId, "agent", text);
    return true;
  } catch {
    return false;
  }
}

export const readSupportChatMessages = createServerFn({ method: "GET" })
  .validator((input: { sessionToken?: string } | undefined) => ({
    sessionToken: String(input?.sessionToken || "").slice(0, 80),
  }))
  .handler(async ({ data }) => readSupportChat(data.sessionToken));

export const sendSupportChatMessage = createServerFn({ method: "POST" })
  .validator((input: { sessionToken?: string; message?: string; page?: string } | undefined) => ({
    sessionToken: String(input?.sessionToken || "").slice(0, 80),
    message: String(input?.message || "").slice(0, 2000),
    page: String(input?.page || "").slice(0, 120),
  }))
  .handler(async ({ data }) => postSupportChatMessage(data));
