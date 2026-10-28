/** Pure helpers for the KidEase Help text bridge. No database. */

export const DEFAULT_LIVE_CHAT_AGENT_PHONE = "+12048088398";
export const LIVE_CHAT_AGENT_LABEL = "Kyle · KidEase Live Support";

export function normalizeChatPhone(raw: string | null | undefined): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return "";
}

export function liveChatAgentPhone(env: Record<string, string | undefined> = process.env): string {
  return normalizeChatPhone(env.LIVE_CHAT_AGENT_PHONE) || DEFAULT_LIVE_CHAT_AGENT_PHONE;
}

export function ticketCodeFromSms(body: string): string | null {
  const match = String(body || "").match(/#?\s*KE-(\d{3,6})\b/i);
  return match ? `KE-${match[1]}` : null;
}

export function agentReplyText(body: string): string {
  const stripped = String(body || "")
    .replace(/#?\s*KE-\d{3,6}\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.slice(0, 1000);
}

/** Only Kyle's phone can write into a help thread. Other texts stay out of chat. */
export function liveAgentSmsDecision(
  from: string | null | undefined,
  body: string,
  agentPhone = DEFAULT_LIVE_CHAT_AGENT_PHONE,
): { route: boolean; code: string | null } {
  if (normalizeChatPhone(from) !== normalizeChatPhone(agentPhone)) {
    return { route: false, code: null };
  }
  return { route: true, code: ticketCodeFromSms(body) };
}

export function liveChatSmsBody(input: { code: string; name: string; page: string; message: string }): string {
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 40) || "Guest";
  const page = input.page.replace(/\s+/g, " ").trim().slice(0, 80) || "/";
  const message = input.message.replace(/\s+/g, " ").trim().slice(0, 320) || "(no message)";
  return `[KidEase Chat #${input.code}] From ${name} (${page}): "${message}" — Reply to this text starting with #${input.code} (or just reply directly) to message them live in chat.`;
}

export function randomTicketCode(rand = Math.random): string {
  const n = 1000 + Math.floor(rand() * 9000);
  return `KE-${n}`;
}

export function randomSessionToken(): string {
  const bytes = new Uint8Array(18);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
