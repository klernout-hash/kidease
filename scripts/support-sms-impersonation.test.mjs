/**
 * Spec for the support-desk SMS reply path.
 *
 * These tests exercise the real inbound webhook and the real owner-reply
 * function. They fail while any signed SMS can be stored as a KidEase support
 * message. They pass once:
 * - the sender's number must match the configured support phone
 *   (the same phone liveAgentSmsDecision already uses), and
 * - the body must name the full thread id after #, and
 * - a missing or short code never falls back to another thread, including
 *   a thread that becomes the most recently updated between the read and the write, and
 * - the thread is found by its exact id, so old threads can be answered, and
 * - an owner-phone text aimed at a support thread (#id_… or a short code) is
 *   never passed to live chat, even when the live-chat agent phone is the
 *   same number. Other owner texts (#KE-1234, plain text) keep live chat.
 *
 * The database is the boundary. The stub records the writes the production
 * function issues. Thread choice, body cleaning, the Twilio signature, and
 * the feature flags are the real functions.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import { normalizeCaslPhone, parseInboundOptOut } from "../src/lib/casl.ts";
import { resetRemoteFlagsForTests, setFlagKillsForTests } from "../src/lib/flags.ts";
import { supportSmsReplyEnabled } from "../src/lib/features.ts";
import { inboundKeywordTwiml, inboundSmsChatDecision, twimlEmpty } from "../src/lib/sms-copy.ts";
import {
  cleanSupportBody,
  handleSupportOwnerReply,
  isSupportOwnerSender,
  isSupportReplyAttempt,
  ownerReplyThreadId,
  supportCopy,
  threadCode,
} from "../src/lib/support-desk.ts";
import { liveAgentSmsDecision, liveChatAgentPhone } from "../src/lib/support-chat.ts";
import {
  TwilioSignatureError,
  parseTwilioForm,
  publicRequestUrl,
  smsDeliveryRecord,
  twilioSignatureMatches,
} from "../src/lib/server/sms-status.ts";
import { nid } from "../src/lib/utils.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CALLBACK = "https://www.kidease.ca/api/sms/inbound";
const TOKEN = "test_auth_token_not_real";
const OWNER_PHONE = "+15555550100";
const ATTACKER_PHONE = "+15555550999";
const RECENT_ID = "id_recentthread0001";
const TARGET_ID = "id_targetthread0002";
const DECOY_ID = "id_decoythread00003";
const AGENT_PHONE = "+15555550200";

const ENV_KEYS = [
  "FEATURE_SUPPORT_CHAT",
  "FEATURE_SUPPORT_SMS_REPLY",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_AUTH_TOKEN_NEXT",
  "TWILIO_INBOUND_CALLBACK_URL",
  "LIVE_CHAT_AGENT_PHONE",
  "ADMIN_SMS",
  "SUPPORT_ALERT_PHONE",
  "POSTHOG_FLAGS_KEY",
];

function productionDeclarations(relative, names, dependencies, internals = []) {
  const path = new URL(`../${relative}`, import.meta.url);
  const source = ts.createSourceFile(
    path.pathname,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const wanted = new Set(names);
  const declarations = source.statements.filter((node) => {
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node))
      return wanted.has(node.name?.text);
    return (
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (declaration) => ts.isIdentifier(declaration.name) && wanted.has(declaration.name.text),
      )
    );
  });
  assert.equal(declarations.length, names.length, `production declarations changed in ${relative}`);
  const selected = ts.createSourceFile(
    path.pathname,
    declarations.map((node) => node.getText(source)).join("\n"),
    ts.ScriptTarget.Latest,
    true,
  );
  const transformed = ts.transform(selected, [
    (context) => {
      const visit = (node) => {
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          return ts.factory.createCallExpression(
            ts.factory.createIdentifier("__import"),
            undefined,
            node.arguments,
          );
        }
        return ts.visitEachChild(node, visit, context);
      };
      return (node) => ts.visitNode(node, visit);
    },
  ]);
  const javascript = ts.transpileModule(ts.createPrinter().printFile(transformed.transformed[0]), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  transformed.dispose();
  const context = vm.createContext({
    exports: {},
    Error,
    URL,
    Request,
    Response,
    Buffer,
    Uint8Array,
    Date,
    Promise,
    console,
    process,
    ...dependencies,
  });
  new vm.Script(`${javascript}\nglobalThis.__internal = { ${internals.join(",")} };`, {
    filename: path.pathname,
  }).runInContext(context);
  return { ...context.exports, ...context.__internal };
}

function signTwilio(url, params, token) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", token).update(Buffer.from(data, "utf8")).digest("base64");
}

function baseThreads() {
  return [
    { id: RECENT_ID, updated_at: "2026-11-28T12:00:00.000Z", user_unread: 0 },
    { id: TARGET_ID, updated_at: "2026-11-28T11:00:00.000Z", user_unread: 0 },
    { id: DECOY_ID, updated_at: "2026-11-28T10:00:00.000Z", user_unread: 0 },
  ];
}

function createStore(threads = baseThreads()) {
  return {
    threads: threads.map((row) => ({ ...row })),
    messages: [],
    updates: [],
    selects: [],
  };
}

let activeStore = null;

const boundRecorder = productionDeclarations(
  "src/lib/server/support-desk.ts",
  ["maybeRecordSupportOwnerReply", "supportOwnerReplyAttempt"],
  {
    supportSmsReplyEnabled,
    handleSupportOwnerReply,
    isSupportOwnerSender,
    isSupportReplyAttempt,
    ownerReplyThreadId,
    nid,
    getSql: async () => {
      if (!activeStore) throw new Error("no store");
      return activeStore.sql;
    },
  },
);

function attachSql(state) {
  state.sql = async (strings, ...values) => {
    const text = String.raw({ raw: strings }, ...values.map(() => "?"))
      .replace(/\s+/g, " ")
      .trim();
    if (/^select id from support_threads where id = \? limit 1$/i.test(text)) {
      const found = state.threads.filter((row) => row.id === values[0]);
      state.selects.push(values[0]);
      // Another thread becomes the newest between the read and the write.
      const late = state.threads.find((row) => row.id === DECOY_ID);
      if (late && state.selects.length === 1) late.updated_at = "2999-01-01T00:00:00.000Z";
      return found.map((row) => ({ id: row.id }));
    }
    if (
      /^insert into support_messages \(id, thread_id, sender, body\) values \(\?, \?, 'admin', \?\)$/i.test(
        text,
      )
    ) {
      state.messages.push({
        id: values[0],
        thread_id: values[1],
        sender: "admin",
        body: values[2],
      });
      return [];
    }
    if (
      /^update support_threads set updated_at = now\(\), last_admin_at = now\(\), user_unread = user_unread \+ 1 where id = \?$/i.test(
        text,
      )
    ) {
      state.updates.push(values[0]);
      const thread = state.threads.find((row) => row.id === values[0]);
      if (thread) thread.user_unread += 1;
      return [];
    }
    throw new Error(`support reply issued an unexpected query: ${text}`);
  };
  return state;
}

const side = {
  consent: [],
  security: [],
  deliveries: [],
  agentRoutes: [],
  recordErrors: [],
};

const { requestIp } = productionDeclarations(
  "src/lib/server/security-events.ts",
  ["requestIp"],
  {},
);

const inbound = productionDeclarations(
  "src/routes/api/sms.inbound.ts",
  ["run"],
  {
    requestIp,
    parseTwilioForm,
    publicRequestUrl,
    twilioSignatureMatches,
    TwilioSignatureError,
    logSecurityEvent: async (input) => {
      side.security.push(input);
    },
    normalizeCaslPhone,
    parseInboundOptOut,
    applyInboundSms: async (input) => {
      side.consent.push(input);
      return { ok: true };
    },
    inboundKeywordTwiml,
    inboundSmsChatDecision,
    twimlEmpty,
    liveAgentSmsDecision,
    liveChatAgentPhone,
    upsertSmsDelivery: async (row) => {
      side.deliveries.push(row);
    },
    smsDeliveryRecord,
    __import: async (specifier) => {
      if (specifier === "@/lib/features") return { supportSmsReplyEnabled };
      if (specifier === "@/lib/server/support-desk") {
        return {
          maybeRecordSupportOwnerReply: async (body) => {
            try {
              return await boundRecorder.maybeRecordSupportOwnerReply(body);
            } catch (err) {
              side.recordErrors.push(err instanceof Error ? err.message : String(err));
              throw err;
            }
          },
          supportOwnerReplyAttempt: boundRecorder.supportOwnerReplyAttempt,
        };
      }
      if (specifier === "@/lib/server/support-chat") {
        return {
          routeAgentSms: async (input) => {
            side.agentRoutes.push(input);
            return false;
          },
        };
      }
      throw new Error(`unexpected import ${specifier}`);
    },
  },
  ["run"],
);

function savedEnv() {
  return new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(saved) {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetRemoteFlagsForTests();
  setFlagKillsForTests(null);
}

function applyEnv(overrides) {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, overrides);
  resetRemoteFlagsForTests();
  setFlagKillsForTests(null);
}

function flagsOn() {
  return {
    FEATURE_SUPPORT_CHAT: "1",
    FEATURE_SUPPORT_SMS_REPLY: "1",
    TWILIO_AUTH_TOKEN: TOKEN,
    TWILIO_INBOUND_CALLBACK_URL: CALLBACK,
    LIVE_CHAT_AGENT_PHONE: OWNER_PHONE,
    SUPPORT_ALERT_PHONE: OWNER_PHONE,
  };
}

function resetSide() {
  side.consent.length = 0;
  side.security.length = 0;
  side.deliveries.length = 0;
  side.agentRoutes.length = 0;
  side.recordErrors.length = 0;
}

function formRequest(fields, { signature } = {}) {
  const params = {
    MessageSid: "SM00000000000000000000000000000000",
    To: "+15555550123",
    ...fields,
  };
  const sig = signature === undefined ? signTwilio(CALLBACK, params, TOKEN) : signature;
  if (signature === undefined) {
    assert.equal(
      twilioSignatureMatches(sig, CALLBACK, params, { TWILIO_AUTH_TOKEN: TOKEN }),
      true,
      "the fixture signature must match the production checker",
    );
  }
  return new Request(CALLBACK, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": sig,
    },
    body: new URLSearchParams(params).toString(),
  });
}

async function postSms(fields, env, { signature, threads } = {}) {
  const saved = savedEnv();
  applyEnv(env);
  resetSide();
  activeStore = attachSql(createStore(threads));
  try {
    const response = await inbound.run(formRequest(fields, { signature }));
    const ownerDuring = liveChatAgentPhone();
    return {
      response,
      store: activeStore,
      status: response.status,
      text: await response.text(),
      ownerDuring,
    };
  } finally {
    activeStore = null;
    restoreEnv(saved);
  }
}

function storedSummary(result) {
  return `status ${result.status} messages ${JSON.stringify(result.store.messages)} updates ${JSON.stringify(result.store.updates)} errors ${JSON.stringify(side.recordErrors)}`;
}

function assertNotStored(result, label = "") {
  assert.equal(side.recordErrors.length, 0, `${label} ${storedSummary(result)}`);
  assert.equal(result.store.messages.length, 0, `${label} ${storedSummary(result)}`);
  assert.equal(result.store.updates.length, 0, `${label} ${storedSummary(result)}`);
  assert.equal(
    result.store.threads.every((row) => row.user_unread === 0),
    true,
    label,
  );
}

test("admin support rows are labelled KidEase support in the desk the parent opens", () => {
  assert.equal(supportCopy.en.title, "KidEase Support");
  assert.equal(supportCopy.fr.title, "Aide KidEase");
  const panel = readFileSync(join(root, "src/components/support-desk-panel.tsx"), "utf8");
  assert.match(panel, /line\.sender === "admin" \? copy\.title : copy\.send/);
});

test("a signed text from any other phone is not stored as KidEase support", async () => {
  const result = await postSms(
    {
      From: ATTACKER_PHONE,
      Body: "KidEase support: confirm your password at https://example.test/help",
    },
    flagsOn(),
  );
  assertNotStored(result);
  assert.equal(side.agentRoutes.length, 0);
  assert.equal(result.status, 200);
});

test("a 6-character thread code from another phone does not open that thread", async () => {
  const code = threadCode(TARGET_ID);
  assert.equal(code.length, 6);
  const result = await postSms(
    {
      From: ATTACKER_PHONE,
      Body: `Please confirm your payment details #${code}`,
    },
    flagsOn(),
  );
  assertNotStored(result);
  assert.equal(result.store.threads.find((row) => row.id === TARGET_ID).user_unread, 0);
});

test("the support phone cannot aim a 6-character code at a thread either", async () => {
  const code = threadCode(TARGET_ID);
  const result = await postSms(
    {
      From: "5555550100",
      Body: `Replying to the family #${code}`,
    },
    flagsOn(),
  );
  assert.equal(normalizeCaslPhone("5555550100"), OWNER_PHONE);
  assert.equal(result.ownerDuring, OWNER_PHONE);
  assertNotStored(result);
});

test("another person's opt-out or ordinary reply is not shown in a support thread", async () => {
  for (const body of ["STOP", "arrêt", "Yes, Tuesday works for the tour"]) {
    const result = await postSms({ From: ATTACKER_PHONE, Body: body }, flagsOn());
    assertNotStored(result, body);
  }
  const opted = await postSms(
    { From: ATTACKER_PHONE, Body: "STOP", OptOutType: "STOP" },
    flagsOn(),
  );
  assertNotStored(opted, "STOP");
  assert.equal(side.consent.length, 1);
  assert.equal(side.consent[0].opt, "stop");
});

test("a text with no thread id is not attached to the most recently updated thread", async () => {
  const result = await postSms(
    { From: "5555550100", Body: "Thanks, we will call you today" },
    flagsOn(),
  );
  assertNotStored(result);
});

test("the support phone is stored only on the thread whose full id is in the text", async () => {
  const body = `Please confirm your password at https://example.test/help #${TARGET_ID}`;
  const result = await postSms({ From: "(555) 555-0100", Body: body }, flagsOn());
  assert.equal(normalizeCaslPhone("(555) 555-0100"), OWNER_PHONE);
  assert.equal(result.status, 200, storedSummary(result));
  assert.equal(result.store.messages.length, 1, storedSummary(result));
  assert.equal(result.store.messages[0].thread_id, TARGET_ID, storedSummary(result));
  assert.equal(result.store.messages[0].sender, "admin");
  assert.equal(
    result.store.messages[0].body,
    cleanSupportBody("Please confirm your password at https://example.test/help"),
  );
  assert.equal(result.store.updates.length, 1);
  assert.equal(result.store.updates[0], TARGET_ID);
  assert.equal(result.store.threads.find((row) => row.id === TARGET_ID).user_unread, 1);
  assert.equal(result.store.threads.find((row) => row.id === RECENT_ID).user_unread, 0);
  assert.equal(result.store.threads.find((row) => row.id === DECOY_ID).user_unread, 0);
  assert.equal(
    result.store.threads.find((row) => row.id === DECOY_ID).updated_at,
    "2999-01-01T00:00:00.000Z",
  );
});

test("the same full thread id from any other phone is ignored", async () => {
  const result = await postSms(
    {
      From: ATTACKER_PHONE,
      Body: `Please confirm your password at https://example.test/help #${TARGET_ID}`,
    },
    flagsOn(),
  );
  assertNotStored(result);
});

test("support SMS replies stay off unless both flags are on", async () => {
  const body = { From: ATTACKER_PHONE, Body: `Hello #${threadCode(TARGET_ID)}` };
  const chatOnly = await postSms(body, { ...flagsOn(), FEATURE_SUPPORT_SMS_REPLY: "0" });
  const replyOnly = await postSms(body, { ...flagsOn(), FEATURE_SUPPORT_CHAT: "0" });
  const neither = await postSms(body, {
    ...flagsOn(),
    FEATURE_SUPPORT_CHAT: "0",
    FEATURE_SUPPORT_SMS_REPLY: "0",
  });
  for (const result of [chatOnly, replyOnly, neither]) {
    assertNotStored(result);
    assert.equal(result.store.selects.length, 0, storedSummary(result));
  }
});

test("a missing or wrong Twilio signature stores nothing", async () => {
  const fields = { From: ATTACKER_PHONE, Body: "confirm your password" };
  const missing = await postSms(fields, flagsOn(), { signature: "" });
  const wrong = await postSms(fields, flagsOn(), { signature: "not-a-signature" });
  assert.equal(missing.status, 401);
  assert.equal(wrong.status, 401);
  assert.equal(missing.store.messages.length, 0);
  assert.equal(wrong.store.messages.length, 0);
  assert.equal(missing.store.selects.length, 0);
  assert.equal(wrong.store.selects.length, 0);
});

test("a lookalike phone is not the support owner", async () => {
  const result = await postSms(
    {
      From: "+15555550101",
      Body: `Thanks, we have your note #${TARGET_ID}`,
    },
    flagsOn(),
  );
  assertNotStored(result);
});

test("an empty support owner phone accepts no text reply", async () => {
  for (const ownerPhone of ["", "   "]) {
    const result = await postSms(
      {
        From: OWNER_PHONE,
        Body: `Thanks, we have your note #${TARGET_ID}`,
      },
      { ...flagsOn(), SUPPORT_ALERT_PHONE: ownerPhone },
    );
    assertNotStored(result, JSON.stringify(ownerPhone));
  }
});

test("a signed text that uses lowercase from and body fields is not saved", async () => {
  const result = await postSms(
    {
      from: ATTACKER_PHONE,
      body: `Please confirm your password at https://example.test/help #${TARGET_ID}`,
    },
    flagsOn(),
  );
  assertNotStored(result);
});

function oldThreads(count) {
  // TARGET_ID is the oldest of many threads, well past the 20 newest.
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const minute = String(59 - (i % 60)).padStart(2, "0");
    const hour = String(23 - Math.floor(i / 60)).padStart(2, "0");
    rows.push({ id: `id_filler${String(i).padStart(9, "0")}`, updated_at: `2026-11-28T${hour}:${minute}:00.000Z`, user_unread: 0 });
  }
  rows.push({ id: TARGET_ID, updated_at: "2026-01-01T00:00:00.000Z", user_unread: 0 });
  rows.push({ id: DECOY_ID, updated_at: "2026-01-01T00:00:00.000Z", user_unread: 0 });
  return rows;
}

test("the owner can answer a thread older than the 20 newest", async () => {
  const threads = oldThreads(25);
  const newest = [...threads].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 21);
  assert.equal(newest.some((row) => row.id === TARGET_ID), false);
  const result = await postSms(
    { From: OWNER_PHONE, Body: `We fixed your listing #${TARGET_ID}` },
    flagsOn(),
    { threads },
  );
  assert.equal(result.store.messages.length, 1, storedSummary(result));
  assert.equal(result.store.messages[0].thread_id, TARGET_ID);
  assert.equal(result.store.messages[0].body, cleanSupportBody("We fixed your listing"));
  assert.deepEqual(result.store.updates, [TARGET_ID]);
  assert.equal(side.agentRoutes.length, 0);
});

test("an unknown full id from the owner stores nothing and does not reach live chat", async () => {
  const result = await postSms(
    { From: OWNER_PHONE, Body: "We fixed your listing #id_doesnotexist01" },
    flagsOn(),
    { threads: oldThreads(25) },
  );
  assertNotStored(result);
  assert.equal(result.status, 200);
  assert.equal(result.text, twimlEmpty());
  assert.equal(side.agentRoutes.length, 0, "an owner support reply must not go to live chat");
  assert.equal(side.deliveries.length, 0);
});

test("a short code from the owner stores nothing and does not reach live chat", async () => {
  const result = await postSms(
    { From: OWNER_PHONE, Body: `Replying to the family #${threadCode(TARGET_ID)}` },
    flagsOn(),
  );
  assertNotStored(result);
  assert.equal(side.agentRoutes.length, 0);
});

test("two different thread ids in one owner text store nothing", async () => {
  const result = await postSms(
    { From: OWNER_PHONE, Body: `Hello #${TARGET_ID} #${RECENT_ID}` },
    flagsOn(),
  );
  assertNotStored(result);
  assert.equal(side.agentRoutes.length, 0);
});

test("same phone: owner live-chat codes and plain replies still go to live chat", async () => {
  const coded = await postSms({ From: OWNER_PHONE, Body: "#KE-1234 On my way" }, flagsOn());
  assertNotStored(coded);
  assert.deepEqual(side.agentRoutes.map((row) => ({ ...row })), [{ code: "KE-1234", body: "#KE-1234 On my way" }]);
  const plain = await postSms({ From: OWNER_PHONE, Body: "Thanks, we will call you today" }, flagsOn());
  assertNotStored(plain);
  assert.equal(side.agentRoutes.length, 1);
  assert.equal(side.agentRoutes[0].code, null);
});

test("same phone: a matched support reply is not also sent to live chat", async () => {
  const result = await postSms({ From: OWNER_PHONE, Body: `Done #${TARGET_ID}` }, flagsOn());
  assert.equal(result.store.messages.length, 1);
  assert.equal(side.agentRoutes.length, 0);
});

test("a separate live-chat agent phone still routes its replies to live chat", async () => {
  const env = { ...flagsOn(), LIVE_CHAT_AGENT_PHONE: AGENT_PHONE };
  const result = await postSms({ From: AGENT_PHONE, Body: "#KE-4321 Hi, how can I help?" }, env);
  assertNotStored(result);
  assert.deepEqual(side.agentRoutes.map((row) => ({ ...row })), [{ code: "KE-4321", body: "#KE-4321 Hi, how can I help?" }]);
  // The agent phone is not the support owner, so a support id from it is not a support reply.
  const aimed = await postSms({ From: AGENT_PHONE, Body: `Hi #${TARGET_ID}` }, env);
  assertNotStored(aimed);
  assert.equal(side.agentRoutes.length, 1);
});

test("with support SMS replies off, owner texts keep the live-chat behaviour", async () => {
  const result = await postSms(
    { From: OWNER_PHONE, Body: "Hello #id_doesnotexist01" },
    { ...flagsOn(), FEATURE_SUPPORT_SMS_REPLY: "0" },
  );
  assertNotStored(result);
  assert.equal(side.agentRoutes.length, 1);
});
