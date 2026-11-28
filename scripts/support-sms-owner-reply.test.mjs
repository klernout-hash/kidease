import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { parseTwilioForm, validateTwilioSignature } from "../src/lib/server/sms-status.ts";
import { resetRemoteFlagsForTests, setFlagKillsForTests } from "../src/lib/flags.ts";
import { supportCopy, threadCode } from "../src/lib/support-desk.ts";

// The webhook under test is the real /api/sms/inbound route. SQL is the real
// statements against in-memory Postgres. Only the database connection is local.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stateKey = "__supportSmsOwnerReplyTest";
const prefix = "support-sms-owner-reply:";
const callbackUrl = "https://sms-inbound.invalid/api/sms/inbound";
const authToken = "placeholder-twilio-auth-token";
const ownerPhone = "+1 204-555-0100";
const ownerFrom = "2045550100";
const strangerFrom = "+1 (416) 555-0199";
const lookalikeFrom = "+1 204-555-0101";
const kideaseTo = "+18885550100";
const victimId = "thread-victim-abc123";
const olderId = "thread-older-def456";
const decoyId = "thread-decoy-fff777";
const phishing = "Your account is locked. Verify at https://evil.example within 1 hour.";
const ownerNote = "Thanks, we have your note";

assert.equal(threadCode(victimId), "abc123");
assert.equal(threadCode(olderId), "def456");
assert.equal(threadCode(decoyId), "fff777");
assert.equal(supportCopy.en.title, "KidEase Support");
assert.match(
  readFileSync(join(root, "src/components/support-desk-panel.tsx"), "utf8"),
  /line\.sender === "admin" \? copy\.title : copy\.send/,
);

const savedEnv = {
  FEATURE_SUPPORT_CHAT: process.env.FEATURE_SUPPORT_CHAT,
  FEATURE_SUPPORT_SMS_REPLY: process.env.FEATURE_SUPPORT_SMS_REPLY,
  SUPPORT_ALERT_PHONE: process.env.SUPPORT_ALERT_PHONE,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_AUTH_TOKEN_NEXT: process.env.TWILIO_AUTH_TOKEN_NEXT,
  TWILIO_INBOUND_CALLBACK_URL: process.env.TWILIO_INBOUND_CALLBACK_URL,
  LIVE_CHAT_AGENT_PHONE: process.env.LIVE_CHAT_AGENT_PHONE,
  ADMIN_SMS: process.env.ADMIN_SMS,
  POSTHOG_FLAGS_KEY: process.env.POSTHOG_FLAGS_KEY,
};

function setEnv(key, value) {
  if (value == null) delete process.env[key];
  else process.env[key] = value;
}

const virtualDb = `
  export const getSql = async () => globalThis.${stateKey}.sql;
  export const getSqlWithin = () => globalThis.${stateKey}.sql;
`;
const dbHref = pathToFileURL(join(root, "src/lib/db.ts")).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    let file = null;
    if (specifier.startsWith("@/")) file = join(root, "src", specifier.slice(2));
    else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      file = fileURLToPath(new URL(specifier, context.parentURL));
    }
    if (!file) return nextResolve(specifier, context);
    const resolved = [`${file}.ts`, `${file}.tsx`, `${file}.mjs`, file].find((candidate) => {
      try {
        return readFileSync(candidate);
      } catch {
        return false;
      }
    });
    if (!resolved) return nextResolve(specifier, context);
    const url = pathToFileURL(resolved).href;
    if (url === dbHref) return { url: `${prefix}db`, shortCircuit: true };
    return { url, shortCircuit: true };
  },
  load(url, context, nextLoad) {
    if (url === `${prefix}db`) return { format: "module", source: virtualDb, shortCircuit: true };
    return nextLoad(url, context);
  },
});

function toSql(run) {
  const sql = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run(text, values);
  };
  sql.query = (text, params = []) => run(text, params ?? []);
  return sql;
}

const pg = new PGlite();
await pg.exec(`
  create table support_threads (
    id text primary key,
    user_id text not null unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    last_user_at timestamptz,
    last_admin_at timestamptz,
    last_owner_sms_at timestamptz,
    admin_unread int not null default 0,
    user_unread int not null default 0,
    owner_emailed int not null default 0
  );
  create table support_messages (
    id text primary key,
    thread_id text not null references support_threads(id) on delete cascade,
    sender text not null check (sender in ('user', 'admin')),
    body text not null,
    created_at timestamptz not null default now()
  );
`);

const state = { queries: [], listReads: 0, sql: null };
globalThis[stateKey] = state;
state.sql = toSql(async (text, params) => {
  const result = await pg.query(text, params);
  state.queries.push({ text, params: [...params] });
  if (
    /from support_threads/i.test(text) &&
    /order by updated_at desc/i.test(text) &&
    /limit\s+20/i.test(text)
  ) {
    state.listReads += 1;
    if (state.listReads === 1) {
      await pg.query("update support_threads set updated_at = now() where id = $1", [decoyId]);
    }
  }
  return result.rows;
});

const { Route } = await import("../src/routes/api/sms.inbound.ts");
const handlers = Route.options.server.handlers;

function enableReplyFlag() {
  resetRemoteFlagsForTests();
  setFlagKillsForTests(null);
  setEnv("FEATURE_SUPPORT_CHAT", "1");
  setEnv("FEATURE_SUPPORT_SMS_REPLY", "1");
  setEnv("SUPPORT_ALERT_PHONE", ownerPhone);
  setEnv("TWILIO_AUTH_TOKEN", authToken);
  setEnv("TWILIO_AUTH_TOKEN_NEXT", null);
  setEnv("TWILIO_INBOUND_CALLBACK_URL", callbackUrl);
  setEnv("LIVE_CHAT_AGENT_PHONE", "+19995550199");
  setEnv("ADMIN_SMS", null);
  setEnv("POSTHOG_FLAGS_KEY", null);
}

function formBody(fields) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) params.append(key, value);
  return params.toString();
}

function sign(body, token = authToken) {
  const params = parseTwilioForm(body);
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], callbackUrl);
  const signature = createHmac("sha1", token).update(Buffer.from(data, "utf8")).digest("base64");
  assert.equal(validateTwilioSignature(token, signature, callbackUrl, params), true);
  return signature;
}

function webhook(fields, { signature, secondBody } = {}) {
  const body = formBody(fields);
  const header = signature ?? sign(body);
  let reads = 0;
  const request = new Request(callbackUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": header,
    },
    body,
  });
  request.text = async () => {
    reads += 1;
    if (reads > 1 && secondBody != null) return secondBody;
    return body;
  };
  return request;
}

async function seedThreads() {
  state.queries = [];
  state.listReads = 0;
  await pg.exec("delete from support_messages; delete from support_threads;");
  await pg.query(
    `insert into support_threads (id, user_id, updated_at, user_unread) values
      ($1, 'user-victim', '2026-11-28T12:00:00Z', 0),
      ($2, 'user-older', '2026-11-28T11:00:00Z', 0),
      ($3, 'user-decoy', '2026-11-27T10:00:00Z', 0)`,
    [victimId, olderId, decoyId],
  );
}

async function storedMessages() {
  const result = await pg.query(
    "select thread_id, sender, body from support_messages order by created_at, id",
  );
  return result.rows;
}

async function unread() {
  const result = await pg.query("select id, user_unread from support_threads order by id");
  return Object.fromEntries(result.rows.map((row) => [row.id, Number(row.user_unread)]));
}

function messageInserts() {
  return state.queries.filter((query) => /insert\s+into\s+support_messages\b/i.test(query.text));
}

function unreadBumps() {
  return state.queries.filter((query) =>
    /user_unread\s*=\s*user_unread\s*\+\s*1/i.test(query.text),
  );
}

beforeEach(async () => {
  enableReplyFlag();
  await seedThreads();
});

after(async () => {
  for (const [key, value] of Object.entries(savedEnv)) setEnv(key, value);
  resetRemoteFlagsForTests();
  setFlagKillsForTests(null);
  hooks.deregister();
  delete globalThis[stateKey];
  await pg.close();
});

async function post(fields, options) {
  const response = await handlers.POST({ request: webhook(fields, options) });
  return { response, messages: await storedMessages(), unread: await unread() };
}

test("a signed text from a stranger is not saved as KidEase Support", async () => {
  const {
    response,
    messages,
    unread: counts,
  } = await post({
    From: strangerFrom,
    To: kideaseTo,
    Body: phishing,
    MessageSid: "SM-stranger-plain",
  });
  assert.equal(response.status, 200);
  assert.deepEqual(messages, []);
  assert.deepEqual(messageInserts(), []);
  assert.deepEqual(unreadBumps(), []);
  assert.deepEqual(counts, { [victimId]: 0, [olderId]: 0, [decoyId]: 0 });
});

test("a signed text from a stranger with a thread code is not saved in that thread", async () => {
  const { messages, unread: counts } = await post({
    From: strangerFrom,
    To: kideaseTo,
    Body: `${phishing} #def456`,
    MessageSid: "SM-stranger-coded",
  });
  assert.deepEqual(messages, []);
  assert.deepEqual(messageInserts(), []);
  assert.deepEqual(unreadBumps(), []);
  assert.equal(counts[olderId], 0);
  assert.equal(counts[victimId], 0);
  assert.equal(counts[decoyId], 0);
});

test("a signed STOP from a stranger is not saved as a support reply", async () => {
  const { messages } = await post({
    From: strangerFrom,
    To: kideaseTo,
    Body: "STOP #def456",
    MessageSid: "SM-stranger-stop",
  });
  assert.deepEqual(messages, []);
  assert.deepEqual(messageInserts(), []);
  assert.deepEqual(unreadBumps(), []);
});

test("a signed text that uses lowercase from and body fields is not saved", async () => {
  const { messages } = await post({
    from: strangerFrom,
    to: kideaseTo,
    body: `${phishing} #def456`,
    MessageSid: "SM-stranger-lowercase",
  });
  assert.deepEqual(messages, []);
  assert.deepEqual(messageInserts(), []);
  assert.deepEqual(unreadBumps(), []);
});

test("a lookalike phone is not the support owner", async () => {
  const { messages } = await post({
    From: lookalikeFrom,
    To: kideaseTo,
    Body: `${ownerNote} #def456`,
    MessageSid: "SM-lookalike",
  });
  assert.deepEqual(messages, []);
  assert.deepEqual(messageInserts(), []);
});

test("an empty support owner phone accepts no text reply", async () => {
  setEnv("SUPPORT_ALERT_PHONE", "   ");
  const { messages } = await post({
    From: ownerFrom,
    To: kideaseTo,
    Body: `${ownerNote} #def456`,
    MessageSid: "SM-no-owner-phone",
  });
  assert.deepEqual(messages, []);
  assert.deepEqual(messageInserts(), []);
  assert.deepEqual(unreadBumps(), []);
});

test("an owner text without a thread code is not saved on the newest thread", async () => {
  const { messages, unread: counts } = await post({
    From: ownerFrom,
    To: kideaseTo,
    Body: ownerNote,
    MessageSid: "SM-owner-nocode",
  });
  assert.deepEqual(messages, []);
  assert.deepEqual(messageInserts(), []);
  assert.deepEqual(unreadBumps(), []);
  assert.equal(counts[victimId], 0);
});

test("a matching owner text is saved on the coded thread even if a newer thread appears", async () => {
  const signed = formBody({
    From: ownerFrom,
    To: kideaseTo,
    Body: `${ownerNote} #def456`,
    MessageSid: "SM-owner-coded",
  });
  const swapped = formBody({
    From: strangerFrom,
    To: kideaseTo,
    Body: `${phishing} #abc123`,
    MessageSid: "SM-owner-coded",
  });
  const {
    response,
    messages,
    unread: counts,
  } = await post(
    {
      From: ownerFrom,
      To: kideaseTo,
      Body: `${ownerNote} #def456`,
      MessageSid: "SM-owner-coded",
    },
    { signature: sign(signed), secondBody: swapped },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/xml");
  assert.equal(state.listReads >= 1, true);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].thread_id, olderId);
  assert.equal(messages[0].sender, "admin");
  assert.match(messages[0].body, /Thanks, we have your note/);
  assert.doesNotMatch(messages[0].body, /evil\.example/);
  assert.equal(
    messages[0].sender === "admin" ? supportCopy.en.title : supportCopy.en.send,
    "KidEase Support",
  );
  assert.equal(counts[olderId], 1);
  assert.equal(counts[victimId], 0);
  assert.equal(counts[decoyId], 0);
  assert.equal(messageInserts().length, 1);
});

test("a bad Twilio signature stores nothing", async () => {
  const { response, messages } = await post(
    {
      From: ownerFrom,
      To: kideaseTo,
      Body: `${ownerNote} #def456`,
      MessageSid: "SM-bad-signature",
    },
    { signature: "not-a-twilio-signature" },
  );
  assert.equal(response.status, 401);
  assert.deepEqual(messages, []);
  assert.deepEqual(messageInserts(), []);
});

test("support text replies stay off when the flag is off", async () => {
  setEnv("FEATURE_SUPPORT_SMS_REPLY", "0");
  const { messages } = await post({
    From: ownerFrom,
    To: kideaseTo,
    Body: `${ownerNote} #def456`,
    MessageSid: "SM-flag-off",
  });
  assert.deepEqual(messages, []);
  assert.deepEqual(messageInserts(), []);
});

test("GET does not write a support reply", async () => {
  const response = await handlers.GET({ request: new Request(callbackUrl) });
  assert.equal(response.status, 405);
  assert.deepEqual(await storedMessages(), []);
  assert.deepEqual(messageInserts(), []);
});
