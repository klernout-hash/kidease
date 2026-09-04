/** Titan IMAP/SMTP helpers for Admin Mail. No Start/DB — tests import this file. */

export const TITAN_WEB_INBOX = "https://app.titan.email";
export const TITAN_DEFAULT_MAILBOX = "kyle@kidease.ca";
export const TITAN_DEFAULT_IMAP_HOST = "imap.titan.email";
export const TITAN_DEFAULT_SMTP_HOST = "smtp.titan.email";
export const TITAN_DEFAULT_IMAP_PORT = 993;
export const TITAN_DEFAULT_SMTP_PORT = 465;

export const TITAN_PASSWORD_MISSING =
  "Titan inbox is not configured. Set TITAN_APP_PASSWORD on the Vercel project (kidease-git) for kyle@kidease.ca and redeploy. Open Titan inbox still works as a fallback.";

export type TitanMailConfig = {
  user: string;
  password: string;
  mailbox: string;
  fromHeader: string;
  fromEmail: string;
  fromName: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
};

export type TitanListItem = {
  uid: number;
  from: string;
  fromEmail: string;
  to: string;
  subject: string;
  date: string;
  unseen: boolean;
  messageId: string;
};

export type TitanMessage = TitanListItem & {
  text: string;
  inReplyTo: string;
  references: string;
};

export type AdminMailStatus = {
  mailbox: string;
  inboxUrl: string;
  titanLinked: boolean;
  canRead: boolean;
  canSend: boolean;
  sendVia: "titan" | "resend" | "sendgrid" | null;
  setupMessage: string | null;
};

type EnvMap = Record<string, string | undefined>;

function envStr(env: EnvMap, ...keys: string[]) {
  for (const key of keys) {
    const v = env[key]?.trim();
    if (v) return v;
  }
  return "";
}

export function titanAppPassword(env: EnvMap = process.env): string {
  return envStr(env, "TITAN_APP_PASSWORD", "TITAN_PASSWORD", "IMAP_PASSWORD");
}

export function mailboxAddress(env: EnvMap = process.env): string {
  return envStr(env, "TITAN_USER", "TITAN_USERNAME", "IMAP_USER", "ADMIN_EMAIL") || TITAN_DEFAULT_MAILBOX;
}

export function mailFromHeader(env: EnvMap = process.env): string {
  return envStr(env, "MAIL_FROM") || `KidEase <${mailboxAddress(env)}>`;
}

export function parseFromHeader(from: string): { name: string; email: string } {
  const match = from.match(/^(.*)<([^>]+)>\s*$/);
  if (match) {
    return { name: match[1].replace(/"/g, "").trim() || "KidEase", email: match[2].trim() };
  }
  return { name: "KidEase", email: from.trim() };
}

export function resolveTitanConfig(env: EnvMap = process.env): { ok: true; config: TitanMailConfig } | { ok: false; error: string } {
  const password = titanAppPassword(env);
  if (!password) return { ok: false, error: TITAN_PASSWORD_MISSING };
  const mailbox = mailboxAddress(env).toLowerCase();
  const fromHeader = mailFromHeader(env);
  const parsed = parseFromHeader(fromHeader);
  const imapPort = Number(envStr(env, "TITAN_IMAP_PORT", "IMAP_PORT") || TITAN_DEFAULT_IMAP_PORT);
  const smtpPort = Number(envStr(env, "TITAN_SMTP_PORT", "SMTP_PORT") || TITAN_DEFAULT_SMTP_PORT);
  const secureFlag = envStr(env, "TITAN_SMTP_SECURE", "SMTP_SECURE").toLowerCase();
  const smtpSecure = secureFlag ? ["1", "true", "yes", "ssl"].includes(secureFlag) : smtpPort !== 587;
  return {
    ok: true,
    config: {
      user: mailbox,
      password,
      mailbox,
      fromHeader,
      fromEmail: parsed.email || mailbox,
      fromName: parsed.name,
      imapHost: envStr(env, "TITAN_IMAP_HOST", "IMAP_HOST") || TITAN_DEFAULT_IMAP_HOST,
      imapPort: Number.isFinite(imapPort) ? imapPort : TITAN_DEFAULT_IMAP_PORT,
      smtpHost: envStr(env, "TITAN_SMTP_HOST", "SMTP_HOST") || TITAN_DEFAULT_SMTP_HOST,
      smtpPort: Number.isFinite(smtpPort) ? smtpPort : TITAN_DEFAULT_SMTP_PORT,
      smtpSecure,
    },
  };
}

export function adminMailStatusFromEnv(env: EnvMap = process.env): AdminMailStatus {
  const cfg = resolveTitanConfig(env);
  const resend = Boolean(env.RESEND_API_KEY?.trim());
  const sendgrid = Boolean(env.SENDGRID_API_KEY?.trim());
  const sendVia = cfg.ok ? "titan" : resend ? "resend" : sendgrid ? "sendgrid" : null;
  return {
    mailbox: mailboxAddress(env).toLowerCase(),
    inboxUrl: TITAN_WEB_INBOX,
    titanLinked: cfg.ok,
    canRead: cfg.ok,
    canSend: Boolean(sendVia),
    sendVia,
    setupMessage: cfg.ok ? null : TITAN_PASSWORD_MISSING,
  };
}

export function sanitizeTitanError(err: unknown, secrets: string[] = []): string {
  let msg = err instanceof Error ? err.message : "Could not reach the Titan mailbox.";
  for (const secret of secrets) {
    if (!secret) continue;
    if (msg.includes(secret)) msg = msg.split(secret).join("••••");
  }
  return msg;
}

export function humanTitanError(err: unknown, password = ""): string {
  const raw = sanitizeTitanError(err, [password]);
  if (/not configured|TITAN_APP_PASSWORD/i.test(raw)) return TITAN_PASSWORD_MISSING;
  if (/timed out|ETIMEOUT|ETIMEDOUT|timeout/i.test(raw)) {
    return "Could not reach Titan in time. Try again, or use Open Titan inbox.";
  }
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|closed the connection/i.test(raw)) {
    return "Could not reach Titan (imap.titan.email / smtp.titan.email). Try again, or use Open Titan inbox.";
  }
  if (/login|auth/i.test(raw)) {
    return "Titan rejected the mailbox login. Check TITAN_APP_PASSWORD on Vercel (app password) and that the username is the mailbox email.";
  }
  return raw;
}

export function imapQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function authPlainB64(user: string, password: string): string {
  return Buffer.from(`\u0000${user}\u0000${password}`, "utf8").toString("base64");
}

export function decodeQuotedPrintable(input: string): string {
  return input
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function decodeRfc2047(input: string): string {
  if (!input) return "";
  return input.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, charset, enc, text) => {
    const bytes =
      String(enc).toLowerCase() === "b"
        ? Buffer.from(text, "base64")
        : Buffer.from(decodeQuotedPrintable(String(text).replace(/_/g, " ")), "latin1");
    return decodeCharset(bytes, String(charset));
  });
}

function decodeCharset(bytes: Buffer, charset: string): string {
  const label = charset.trim().toLowerCase() || "utf-8";
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return bytes.toString("utf8");
  }
}

export function encodeRfc2047(input: string): string {
  if (/^[\x20-\x7e]*$/.test(input)) return input;
  return `=?UTF-8?B?${Buffer.from(input, "utf8").toString("base64")}?=`;
}

export function replySubject(subject: string): string {
  const trimmed = subject.trim() || "(no subject)";
  return /^re\s*:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

export function quoteReplyBody(from: string, date: string, text: string): string {
  const clipped = text.trim().slice(0, 4000);
  const quoted = clipped
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
  return `\n\nOn ${date || "an earlier message"}, ${from || "the sender"} wrote:\n${quoted}`;
}

export function rfc822Date(date = new Date()): string {
  return date.toUTCString().replace(/GMT$/i, "+0000");
}

export function smtpDotStuff(body: string): string {
  return body.replace(/^\./gm, "..");
}

export function htmlEscape(text: string): string {
  return text.replace(/&/g, "&#38;").replace(/</g, "&#60;").replace(/>/g, "&#62;");
}

export function adminMailHtml(body: string): string {
  return `<!doctype html>
<html><body style="font-family:Plus Jakarta Sans,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf8;border:1px solid #e3ddd3;border-radius:16px;">
    <tr><td style="padding:28px;font-size:16px;line-height:1.6;white-space:pre-wrap;">${htmlEscape(body).replace(
      /\n/g,
      "<br/>",
    )}</td></tr>
  </table>
</body></html>`;
}

export type BuiltMail = {
  raw: string;
  fromEmail: string;
  to: string;
  subject: string;
};

export function buildOutgoingMail(input: {
  fromHeader: string;
  fromEmail: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
  date?: Date;
}): BuiltMail {
  const boundary = `ke${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
  const messageId = `<${Date.now()}.${Math.random().toString(16).slice(2)}@kidease.ca>`;
  const html = input.html || adminMailHtml(input.text);
  const headers = [
    `From: ${input.fromHeader}`,
    `To: ${input.to}`,
    `Subject: ${encodeRfc2047(input.subject)}`,
    `Date: ${rfc822Date(input.date)}`,
    `Message-ID: ${messageId}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  if (input.inReplyTo) headers.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references) headers.push(`References: ${input.references}`);
  const raw = `${headers.join("\r\n")}\r\n\r\n--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${input.text}\r\n--${boundary}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${html}\r\n--${boundary}--\r\n`;
  return { raw, fromEmail: input.fromEmail, to: input.to, subject: input.subject };
}

export type ImapIo = {
  writeLine(line: string): void;
  writeRaw(data: string | Buffer): void;
  readLogical(): Promise<{ text: string; literals: string[] }>;
};

export type SmtpIo = {
  writeLine(line: string): void;
  writeRaw(data: string | Buffer): void;
  readReply(): Promise<{ code: number; lines: string[] }>;
};

export function parseImapSeq(input: string, literals: string[] = []): unknown[] {
  let i = 0;
  const items: unknown[] = [];
  const skipWs = () => {
    while (i < input.length && /[ \t]/.test(input[i] ?? "")) i += 1;
  };
  const parse = (): unknown => {
    skipWs();
    if (i >= input.length) return null;
    if (input.startsWith("NIL", i) && (i + 3 >= input.length || /[\s)]/.test(input[i + 3] ?? ""))) {
      i += 3;
      return null;
    }
    if (input[i] === "(") {
      i += 1;
      const arr: unknown[] = [];
      while (true) {
        skipWs();
        if (i >= input.length) break;
        if (input[i] === ")") {
          i += 1;
          break;
        }
        arr.push(parse());
      }
      return arr;
    }
    if (input[i] === '"') {
      i += 1;
      let s = "";
      while (i < input.length) {
        const ch = input[i] ?? "";
        if (ch === "\\") {
          i += 1;
          s += input[i] ?? "";
          i += 1;
          continue;
        }
        if (ch === '"') {
          i += 1;
          break;
        }
        s += ch;
        i += 1;
      }
      return s;
    }
    if (input[i] === "{") {
      const m = input.slice(i).match(/^\{(\d+)\}/);
      if (!m) return "";
      i += m[0].length;
      return literals[Number(m[1])] ?? "";
    }
    const start = i;
    while (i < input.length && !/[\s()]/.test(input[i] ?? "")) i += 1;
    const atom = input.slice(start, i);
    if (/^-?\d+$/.test(atom)) return Number(atom);
    return atom;
  };
  while (i < input.length) {
    skipWs();
    if (i >= input.length) break;
    items.push(parse());
  }
  return items;
}

export function parseFetchAttrs(text: string, literals: string[] = []): Record<string, unknown> {
  const idx = text.search(/\sFETCH\s+/i);
  const rest = idx >= 0 ? text.slice(idx).replace(/^\s*FETCH\s+/i, "") : text;
  const parsed = parseImapSeq(rest.trim(), literals)[0];
  if (!Array.isArray(parsed)) return {};
  const out: Record<string, unknown> = {};
  for (let i = 0; i < parsed.length; i += 2) {
    const key = String(parsed[i] ?? "").toUpperCase();
    if (!key) continue;
    out[key] = parsed[i + 1];
  }
  return out;
}

function formatAddresses(list: unknown): { display: string; email: string } {
  if (!Array.isArray(list) || list.length === 0) return { display: "", email: "" };
  const parts: string[] = [];
  let firstEmail = "";
  for (const addr of list) {
    if (!Array.isArray(addr) || addr.length < 4) continue;
    const name = decodeRfc2047(addr[0] == null ? "" : String(addr[0]));
    const mailbox = addr[2] == null ? "" : String(addr[2]);
    const host = addr[3] == null ? "" : String(addr[3]);
    const email = mailbox && host ? `${mailbox}@${host}` : mailbox;
    if (!firstEmail && email) firstEmail = email;
    parts.push(name && email ? `${name} <${email}>` : name || email);
  }
  return { display: parts.filter(Boolean).join(", "), email: firstEmail };
}

export function envelopeToItem(env: unknown, extra: { uid: number; flags?: unknown; date?: string }): TitanListItem {
  const row = Array.isArray(env) ? env : [];
  const from = formatAddresses(row[2]);
  const to = formatAddresses(row[5]);
  const flags = Array.isArray(extra.flags) ? extra.flags.map((f) => String(f).toUpperCase()) : [];
  const unseen = !flags.some((f) => f === "\\SEEN" || f === "SEEN");
  return {
    uid: extra.uid,
    from: from.display || from.email || "(unknown sender)",
    fromEmail: from.email,
    to: to.display || to.email,
    subject: decodeRfc2047(row[1] == null ? "" : String(row[1])) || "(no subject)",
    date: extra.date || (row[0] == null ? "" : String(row[0])),
    unseen,
    messageId: row[9] == null ? "" : String(row[9]),
  };
}

export function parseExists(lines: Array<{ text: string }>): number {
  let n = 0;
  for (const line of lines) {
    const m = line.text.match(/^\*\s+(\d+)\s+EXISTS\b/i);
    if (m) n = Number(m[1]);
  }
  return n;
}

export function parseListFolders(lines: Array<{ text: string; literals?: string[] }>): string[] {
  const names: string[] = [];
  for (const line of lines) {
    if (!/^\*\s+LIST\b/i.test(line.text)) continue;
    const rest = line.text.replace(/^\*\s+LIST\s+/i, "");
    const seq = parseImapSeq(rest, line.literals ?? []);
    const name = seq[2];
    if (typeof name === "string" && name) names.push(name);
  }
  return names;
}

export function pickSentFolder(names: string[]): string {
  const ranked = names
    .map((name) => ({ name, score: sentFolderScore(name) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.name || "Sent";
}

function sentFolderScore(name: string): number {
  const n = name.toLowerCase();
  if (n === "sent") return 5;
  if (n === "inbox.sent" || n === "inbox/sent") return 4;
  if (n === "sent items" || n === "sent messages") return 3;
  if (n.includes("sent")) return 1;
  return 0;
}

export function parseRfc822(raw: string): { headers: Record<string, string>; body: string } {
  const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const split = normalized.search(/\n\n/);
  const head = split >= 0 ? normalized.slice(0, split) : normalized;
  const body = split >= 0 ? normalized.slice(split + 2) : "";
  const headers: Record<string, string> = {};
  let current = "";
  for (const line of head.split("\n")) {
    if (/^[ \t]/.test(line) && current) {
      headers[current] += ` ${line.trim()}`;
      continue;
    }
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    current = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    headers[current] = headers[current] ? `${headers[current]} ${value}` : value;
  }
  return { headers, body };
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#38;/g, "&")
    .replace(/&#60;/g, "<")
    .replace(/&#62;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function headerBoundary(contentType: string): string {
  const match = /boundary=(?:"([^"]+)"|([^\s;]+))/i.exec(contentType);
  return (match?.[1] || match?.[2] || "").trim();
}

function splitMultipart(body: string, boundary: string): string[] {
  const delim = `--${boundary}`;
  const chunks = body.split(delim).slice(1);
  const parts: string[] = [];
  for (const chunk of chunks) {
    if (chunk.startsWith("--")) break;
    parts.push(chunk.replace(/^\r?\n/, "").replace(/\r?\n$/, ""));
  }
  return parts;
}

function decodeTransfer(body: string, encoding: string, charset: string): string {
  const enc = encoding.toLowerCase();
  if (enc === "base64") return decodeCharset(Buffer.from(body.replace(/\s+/g, ""), "base64"), charset);
  if (enc === "quoted-printable") {
    return decodeCharset(Buffer.from(decodeQuotedPrintable(body), "latin1"), charset);
  }
  return body.replace(/\r\n/g, "\n");
}

function extractPartText(headers: Record<string, string>, body: string): string {
  const contentType = headers["content-type"] || "text/plain";
  const type = contentType.split(";")[0]?.trim().toLowerCase() || "text/plain";
  const encoding = headers["content-transfer-encoding"] || "7bit";
  const charset = /charset="?([^";\s]+)/i.exec(contentType)?.[1] || "utf-8";
  const boundary = headerBoundary(contentType);
  if (type.startsWith("multipart/") && boundary) {
    let html = "";
    for (const part of splitMultipart(body, boundary)) {
      const nested = parseRfc822(part.trimStart());
      const nestedType = (nested.headers["content-type"] || "").split(";")[0]?.trim().toLowerCase() || "";
      const text = extractPartText(nested.headers, nested.body);
      if (nestedType === "text/plain" && text.trim()) return text;
      if (nestedType === "text/html" && !html) html = text;
      if (nestedType.startsWith("multipart/") && text.trim()) return text;
    }
    return html;
  }
  const decoded = decodeTransfer(body, encoding, charset);
  if (type === "text/html") return htmlToText(decoded);
  if (type.startsWith("text/")) return decoded.trimEnd();
  return "";
}

export function extractMailText(raw: string): string {
  const parsed = parseRfc822(raw);
  return extractPartText(parsed.headers, parsed.body).trim();
}

export function headerValue(raw: string, name: string): string {
  const parsed = parseRfc822(raw);
  return parsed.headers[name.toLowerCase()] || "";
}

let imapTag = 0;

export function resetImapTag(next = 0): void {
  imapTag = next;
}

async function imapTagged(io: ImapIo, command: string, kind = command.split(" ")[0] || "IMAP") {
  imapTag += 1;
  const tag = `A${imapTag}`;
  io.writeLine(`${tag} ${command}`);
  const untagged: Array<{ text: string; literals: string[] }> = [];
  while (true) {
    const line = await io.readLogical();
    if (line.text.startsWith("+")) {
      untagged.push(line);
      continue;
    }
    if (line.text.startsWith(`${tag} `)) {
      const status = line.text.slice(tag.length + 1);
      if (!/^OK\b/i.test(status)) {
        throw new Error(imapFail(kind, status));
      }
      return { untagged, status };
    }
    untagged.push(line);
  }
}

function imapFail(kind: string, status: string): string {
  if (/login|auth/i.test(`${kind} ${status}`)) {
    return "Titan rejected the mailbox login. Check TITAN_APP_PASSWORD on Vercel (app password) and that the username is the mailbox email.";
  }
  return `Titan IMAP ${kind} failed.`;
}

export async function imapLogin(io: ImapIo, user: string, password: string): Promise<void> {
  try {
    await imapTagged(io, `LOGIN ${imapQuote(user)} ${imapQuote(password)}`, "LOGIN");
  } catch (err) {
    if (!/login/i.test(err instanceof Error ? err.message : "")) throw err;
    await imapTagged(io, `AUTHENTICATE PLAIN ${authPlainB64(user, password)}`, "AUTH");
  }
}

export async function imapSelectInbox(io: ImapIo): Promise<number> {
  const res = await imapTagged(io, "SELECT INBOX", "SELECT");
  return parseExists(res.untagged);
}

export async function imapLogout(io: ImapIo): Promise<void> {
  try {
    await imapTagged(io, "LOGOUT", "LOGOUT");
  } catch {
    // closing is best-effort
  }
}

function fetchLinesToItems(lines: Array<{ text: string; literals: string[] }>): TitanListItem[] {
  const items: TitanListItem[] = [];
  for (const line of lines) {
    if (!/\sFETCH\s+/i.test(line.text)) continue;
    const attrs = parseFetchAttrs(line.text, line.literals);
    const uid = Number(attrs.UID);
    if (!Number.isFinite(uid) || uid <= 0) continue;
    items.push(
      envelopeToItem(attrs.ENVELOPE, {
        uid,
        flags: attrs.FLAGS,
        date: attrs.INTERNALDATE == null ? "" : String(attrs.INTERNALDATE),
      }),
    );
  }
  return items;
}

export async function imapFetchList(io: ImapIo, exists: number, limit = 40): Promise<TitanListItem[]> {
  if (exists <= 0) return [];
  const take = Math.min(80, Math.max(1, limit));
  const from = Math.max(1, exists - take + 1);
  const res = await imapTagged(io, `FETCH ${from}:${exists} (UID FLAGS ENVELOPE INTERNALDATE)`, "FETCH");
  return fetchLinesToItems(res.untagged).sort((a, b) => b.uid - a.uid);
}

export async function imapFetchUid(io: ImapIo, uid: number): Promise<TitanMessage> {
  if (!Number.isFinite(uid) || uid <= 0) throw new Error("That message is no longer available.");
  const res = await imapTagged(io, `UID FETCH ${uid} (UID FLAGS ENVELOPE INTERNALDATE BODY.PEEK[])`, "FETCH");
  const line = res.untagged.find((row) => /\sFETCH\s+/i.test(row.text));
  if (!line) throw new Error("That message is no longer in the Titan inbox.");
  const attrs = parseFetchAttrs(line.text, line.literals);
  const item = envelopeToItem(attrs.ENVELOPE, {
    uid: Number(attrs.UID) || uid,
    flags: attrs.FLAGS,
    date: attrs.INTERNALDATE == null ? "" : String(attrs.INTERNALDATE),
  });
  const raw =
    (typeof attrs["BODY[]"] === "string" && attrs["BODY[]"]) ||
    (typeof attrs.RFC822 === "string" && attrs.RFC822) ||
    line.literals[0] ||
    "";
  let inReplyTo = item.messageId ? "" : "";
  let references = "";
  if (raw) {
    inReplyTo = headerValue(raw, "in-reply-to");
    references = headerValue(raw, "references");
  }
  try {
    await imapTagged(io, `UID STORE ${uid} +FLAGS.SILENT (\\Seen)`, "STORE");
  } catch {
    // read still succeeds if the seen flag cannot be written
  }
  return {
    ...item,
    unseen: false,
    text: raw ? extractMailText(raw) : "",
    inReplyTo,
    references: references || item.messageId,
  };
}

export async function imapAppendSent(io: ImapIo, raw: string): Promise<void> {
  const listed = await imapTagged(io, 'LIST "" "*"', "LIST");
  const folder = pickSentFolder(parseListFolders(listed.untagged));
  const payload = raw.endsWith("\n") ? raw : `${raw}\r\n`;
  const bytes = Buffer.byteLength(payload, "utf8");
  imapTag += 1;
  const tag = `A${imapTag}`;
  io.writeLine(`${tag} APPEND ${imapQuote(folder)} (\\Seen) {${bytes}}`);
  const cont = await io.readLogical();
  if (!cont.text.startsWith("+") && !/^\* /.test(cont.text)) {
    if (cont.text.startsWith(`${tag} `) && !/^OK\b/i.test(cont.text.slice(tag.length + 1))) {
      throw new Error("Titan IMAP APPEND failed.");
    }
  }
  if (!cont.text.startsWith(`${tag} `)) {
    io.writeRaw(payload);
    while (true) {
      const line = await io.readLogical();
      if (line.text.startsWith(`${tag} `)) {
        if (!/^OK\b/i.test(line.text.slice(tag.length + 1))) throw new Error("Titan IMAP APPEND failed.");
        break;
      }
    }
  }
}

export async function smtpExpect(io: SmtpIo, ok: number[], step: string) {
  const reply = await io.readReply();
  if (!ok.includes(reply.code)) {
    if (reply.code === 535 || /auth/i.test(reply.lines.join(" "))) {
      throw new Error("Titan rejected the mailbox login. Check TITAN_APP_PASSWORD on Vercel (app password) and that the username is the mailbox email.");
    }
    throw new Error(`Titan SMTP ${step} failed (${reply.code}).`);
  }
  return reply;
}

export async function smtpTransaction(
  io: SmtpIo,
  input: {
    user: string;
    password: string;
    fromEmail: string;
    to: string;
    raw: string;
    alreadySecure: boolean;
    startTls?: () => Promise<void>;
    greet?: boolean;
  },
): Promise<void> {
  if (input.greet !== false) await smtpExpect(io, [220], "connect");
  let ehlo = await smtpEhlo(io);
  if (!input.alreadySecure && /STARTTLS/i.test(ehlo.lines.join("\n")) && input.startTls) {
    io.writeLine("STARTTLS");
    await smtpExpect(io, [220], "STARTTLS");
    await input.startTls();
    ehlo = await smtpEhlo(io);
  }
  const ads = ehlo.lines.join("\n");
  if (/AUTH[^\n]*PLAIN/i.test(ads)) {
    io.writeLine(`AUTH PLAIN ${authPlainB64(input.user, input.password)}`);
    await smtpExpect(io, [235], "AUTH");
  } else {
    io.writeLine("AUTH LOGIN");
    await smtpExpect(io, [334], "AUTH");
    io.writeLine(Buffer.from(input.user, "utf8").toString("base64"));
    await smtpExpect(io, [334], "AUTH");
    io.writeLine(Buffer.from(input.password, "utf8").toString("base64"));
    await smtpExpect(io, [235], "AUTH");
  }
  io.writeLine(`MAIL FROM:<${input.fromEmail}>`);
  await smtpExpect(io, [250], "MAIL");
  io.writeLine(`RCPT TO:<${input.to}>`);
  await smtpExpect(io, [250, 251], "RCPT");
  io.writeLine("DATA");
  await smtpExpect(io, [354], "DATA");
  io.writeRaw(`${smtpDotStuff(input.raw.replace(/\r?\n/g, "\r\n"))}\r\n.\r\n`);
  await smtpExpect(io, [250], "DATA");
  io.writeLine("QUIT");
  try {
    await io.readReply();
  } catch {
    // QUIT is best-effort
  }
}

async function smtpEhlo(io: SmtpIo) {
  io.writeLine("EHLO kidease.ca");
  return smtpExpect(io, [250], "EHLO");
}

export function parseSmtpReplyBlock(lines: string[]): { code: number; lines: string[] } {
  if (lines.length === 0) throw new Error("Titan SMTP sent an empty reply.");
  const parsed = lines.map((line) => {
    const m = line.match(/^(\d{3})([ -])(.*)$/);
    if (!m) throw new Error("Titan SMTP sent an invalid reply.");
    return { code: Number(m[1]), cont: m[2] === "-", text: m[3] ?? "" };
  });
  const last = parsed[parsed.length - 1];
  if (!last || last.cont) throw new Error("Titan SMTP sent an incomplete reply.");
  return { code: last.code, lines: parsed.map((row) => row.text) };
}
