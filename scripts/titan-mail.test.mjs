import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adminMailHtml,
  adminMailStatusFromEnv,
  authPlainB64,
  buildOutgoingMail,
  decodeRfc2047,
  envelopeToItem,
  extractMailText,
  htmlToText,
  humanTitanError,
  imapFetchList,
  imapFetchUid,
  imapLogin,
  imapQuote,
  imapSelectInbox,
  parseExists,
  parseFetchAttrs,
  parseImapSeq,
  parseListFolders,
  pickSentFolder,
  replySubject,
  resetImapTag,
  resolveTitanConfig,
  sanitizeTitanError,
  smtpDotStuff,
  smtpTransaction,
  TITAN_DEFAULT_IMAP_HOST,
  TITAN_DEFAULT_SMTP_HOST,
  TITAN_PASSWORD_MISSING,
  TITAN_WEB_INBOX,
} from "../src/lib/server/titan-mail.ts";

test("missing TITAN_APP_PASSWORD is a clear Admin setup message", () => {
  const resolved = resolveTitanConfig({});
  assert.equal(resolved.ok, false);
  if (resolved.ok) return;
  assert.match(resolved.error, /TITAN_APP_PASSWORD/);
  assert.match(resolved.error, /Vercel/);
  assert.match(resolved.error, /kidease-git/);
  assert.equal(resolved.error, TITAN_PASSWORD_MISSING);
  assert.doesNotMatch(resolved.error, /hunter2|password123|secret/i);
});

test("Titan config reuses mailbox env and Titan hosts", () => {
  const resolved = resolveTitanConfig({
    TITAN_APP_PASSWORD: "not-a-real-password",
    ADMIN_EMAIL: "kyle@kidease.ca",
    MAIL_FROM: "KidEase <kyle@kidease.ca>",
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.config.user, "kyle@kidease.ca");
  assert.equal(resolved.config.imapHost, TITAN_DEFAULT_IMAP_HOST);
  assert.equal(resolved.config.smtpHost, TITAN_DEFAULT_SMTP_HOST);
  assert.equal(resolved.config.imapPort, 993);
  assert.equal(resolved.config.smtpPort, 465);
  assert.equal(resolved.config.smtpSecure, true);
  assert.equal(resolved.config.fromEmail, "kyle@kidease.ca");
});

test("TITAN_USER and port overrides win over ADMIN_EMAIL", () => {
  const resolved = resolveTitanConfig({
    TITAN_APP_PASSWORD: "not-a-real-password",
    ADMIN_EMAIL: "other@kidease.ca",
    TITAN_USER: "kyle@kidease.ca",
    TITAN_SMTP_PORT: "587",
    TITAN_IMAP_HOST: "imap.titan.email",
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.config.user, "kyle@kidease.ca");
  assert.equal(resolved.config.smtpPort, 587);
  assert.equal(resolved.config.smtpSecure, false);
});

test("Admin Mail status can send via Titan even without Resend", () => {
  const status = adminMailStatusFromEnv({
    TITAN_APP_PASSWORD: "not-a-real-password",
    ADMIN_EMAIL: "kyle@kidease.ca",
  });
  assert.equal(status.titanLinked, true);
  assert.equal(status.canRead, true);
  assert.equal(status.canSend, true);
  assert.equal(status.sendVia, "titan");
  assert.equal(status.inboxUrl, TITAN_WEB_INBOX);
  assert.equal(status.setupMessage, null);
});

test("Admin Mail status without Titan still allows Resend compose", () => {
  const status = adminMailStatusFromEnv({
    RESEND_API_KEY: "re_test",
    ADMIN_EMAIL: "kyle@kidease.ca",
  });
  assert.equal(status.titanLinked, false);
  assert.equal(status.canRead, false);
  assert.equal(status.canSend, true);
  assert.equal(status.sendVia, "resend");
  assert.match(status.setupMessage ?? "", /TITAN_APP_PASSWORD/);
});

test("errors never echo the app password", () => {
  const password = "super-secret-app-password";
  assert.equal(sanitizeTitanError(new Error(`LOGIN ${password} failed`), [password]).includes(password), false);
  assert.doesNotMatch(humanTitanError(new Error("authentication failed"), password), /super-secret/);
});

test("IMAP envelope and FETCH attrs parse Titan-shaped data", () => {
  const text =
    '* 3 FETCH (UID 88 FLAGS (\\Seen) INTERNALDATE " 3-Sep-2026 17:00:00 +0000" ENVELOPE ("Wed, 3 Sep 2026 12:00:00 -0500" "Tour tomorrow?" (("Ada Parent" NIL "ada" "example.com")) (("Ada Parent" NIL "ada" "example.com")) (("Ada Parent" NIL "ada" "example.com")) ((NIL NIL "kyle" "kidease.ca")) NIL NIL NIL "<m1@titan.email>"))';
  const attrs = parseFetchAttrs(text);
  assert.equal(attrs.UID, 88);
  const item = envelopeToItem(attrs.ENVELOPE, { uid: 88, flags: attrs.FLAGS, date: String(attrs.INTERNALDATE) });
  assert.equal(item.fromEmail, "ada@example.com");
  assert.equal(item.from, "Ada Parent <ada@example.com>");
  assert.equal(item.subject, "Tour tomorrow?");
  assert.equal(item.unseen, false);
  assert.equal(item.messageId, "<m1@titan.email>");
  assert.equal(parseExists([{ text: "* 12 EXISTS" }, { text: "* 1 RECENT" }]), 12);
});

test("RFC2047 subjects and HTML-only bodies become readable text", () => {
  assert.equal(decodeRfc2047("=?UTF-8?Q?Tour_tomorrow=3F?="), "Tour tomorrow?");
  assert.equal(htmlToText("<p>Hi Kyle</p><br/>Thanks"), "Hi Kyle\n\nThanks");
  const raw = [
    "From: Ada <ada@example.com>",
    "Subject: Hello",
    "Content-Type: multipart/alternative; boundary=aaa",
    "",
    "--aaa",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Plain body",
    "--aaa",
    "Content-Type: text/html; charset=utf-8",
    "",
    "<p>HTML body</p>",
    "--aaa--",
    "",
  ].join("\r\n");
  assert.equal(extractMailText(raw), "Plain body");
  const htmlOnly = [
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    "<p>Quoted=3Dprintable</p>",
  ].join("\r\n");
  assert.equal(extractMailText(htmlOnly), "Quoted=printable");
});

test("reply subject and SMTP stuffing stay conventional", () => {
  assert.equal(replySubject("Tour tomorrow?"), "Re: Tour tomorrow?");
  assert.equal(replySubject("Re: Tour tomorrow?"), "Re: Tour tomorrow?");
  assert.equal(smtpDotStuff("hello\n.\nworld"), "hello\n..\nworld");
  assert.match(adminMailHtml("<script>"), /&#60;script&#62;/);
});

test("Sent folder pick prefers Titan Sent", () => {
  assert.equal(pickSentFolder(parseListFolders([{ text: '* LIST (\\HasNoChildren) "/" INBOX' }])), "Sent");
  assert.equal(
    pickSentFolder(
      parseListFolders([
        { text: '* LIST (\\HasNoChildren) "/" INBOX' },
        { text: '* LIST (\\HasNoChildren \\Sent) "/" Sent' },
        { text: '* LIST (\\HasNoChildren) "/" Drafts' },
      ]),
    ),
    "Sent",
  );
});

test("IMAP login and list talk the protocol without leaking secrets in errors", async () => {
  resetImapTag(0);
  const writes = [];
  const reads = [{ text: "A1 OK LOGIN completed", literals: [] }];
  const io = {
    writeLine(line) {
      writes.push(line);
    },
    writeRaw() {},
    async readLogical() {
      const next = reads.shift();
      if (!next) throw new Error("unexpected IMAP read");
      return next;
    },
  };
  await imapLogin(io, "kyle@kidease.ca", "not-a-real-password");
  assert.equal(writes[0], 'A1 LOGIN "kyle@kidease.ca" "not-a-real-password"');
  assert.equal(imapQuote('p"ass'), '"p\\"ass"');

  resetImapTag(1);
  reads.push({ text: "* 2 EXISTS", literals: [] }, { text: "A2 OK [READ-WRITE] SELECT", literals: [] });
  assert.equal(await imapSelectInbox(io), 2);

  const fetchLine =
    '* 2 FETCH (UID 9 FLAGS () ENVELOPE (NIL "Need a spot" (("Pat" NIL "pat" "parents.ca")) NIL NIL ((NIL NIL "kyle" "kidease.ca")) NIL NIL NIL "<id@titan>"))';
  reads.push({ text: fetchLine, literals: [] }, { text: "A3 OK FETCH completed", literals: [] });
  const items = await imapFetchList(io, 2, 40);
  assert.equal(items.length, 1);
  assert.equal(items[0].fromEmail, "pat@parents.ca");
  assert.equal(items[0].unseen, true);
  assert.equal(authPlainB64("kyle@kidease.ca", "x").length > 8, true);

  resetImapTag(3);
  const rfc822 = "From: Pat <pat@parents.ca>\r\nSubject: Need a spot\r\nMessage-ID: <id@titan>\r\n\r\nWe need a toddler spot.\r\n";
  reads.push(
    {
      text: `* 1 FETCH (UID 9 FLAGS () ENVELOPE (NIL "Need a spot" (("Pat" NIL "pat" "parents.ca")) NIL NIL ((NIL NIL "kyle" "kidease.ca")) NIL NIL NIL "<id@titan>") BODY[] {0})`,
      literals: [rfc822],
    },
    { text: "A4 OK FETCH completed", literals: [] },
    { text: "A5 OK STORE completed", literals: [] },
  );
  const opened = await imapFetchUid(io, 9);
  assert.equal(opened.fromEmail, "pat@parents.ca");
  assert.equal(opened.text, "We need a toddler spot.");
  assert.equal(opened.unseen, false);
});

test("SMTP transaction authenticates then sends from the mailbox", async () => {
  const writes = [];
  const replies = [
    { code: 220, lines: ["Titan SMTP"] },
    { code: 250, lines: ["kidease.ca", "AUTH PLAIN LOGIN"] },
    { code: 235, lines: ["auth ok"] },
    { code: 250, lines: ["ok"] },
    { code: 250, lines: ["ok"] },
    { code: 354, lines: ["go"] },
    { code: 250, lines: ["queued"] },
    { code: 221, lines: ["bye"] },
  ];
  const io = {
    writeLine(line) {
      writes.push(line);
    },
    writeRaw(data) {
      writes.push(String(data));
    },
    async readReply() {
      const next = replies.shift();
      if (!next) throw new Error("unexpected SMTP read");
      return next;
    },
  };
  const mail = buildOutgoingMail({
    fromHeader: "KidEase <kyle@kidease.ca>",
    fromEmail: "kyle@kidease.ca",
    to: "ada@example.com",
    subject: "Re: Tour tomorrow?",
    text: "See you at 9.",
    inReplyTo: "<m1@titan.email>",
  });
  await smtpTransaction(io, {
    user: "kyle@kidease.ca",
    password: "not-a-real-password",
    fromEmail: "kyle@kidease.ca",
    to: "ada@example.com",
    raw: mail.raw,
    alreadySecure: true,
  });
  assert.equal(writes.includes("MAIL FROM:<kyle@kidease.ca>"), true);
  assert.equal(writes.includes("RCPT TO:<ada@example.com>"), true);
  assert.equal(writes.some((line) => line.startsWith("AUTH PLAIN ")), true);
  assert.match(mail.raw, /In-Reply-To: <m1@titan.email>/);
  assert.match(mail.raw, /See you at 9/);
});

test("IMAP atoms and NIL parse as lists", () => {
  const seq = parseImapSeq('(\\Seen \\Answered) NIL "Hi"');
  assert.deepEqual(seq[0], ["\\Seen", "\\Answered"]);
  assert.equal(seq[1], null);
  assert.equal(seq[2], "Hi");
});
