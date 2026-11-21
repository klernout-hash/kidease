import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { after, afterEach, beforeEach, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import {
  SESSION_TOKEN_COOKIE,
  TWO_FACTOR_COOKIE,
  TWO_FACTOR_DEVICE_COOKIE,
  SHARED_TWO_FACTOR_COOKIE,
  parseCookieHeader,
  unsignedSessionToken,
} from "../src/lib/auth/cookies.ts";
import { signTwoFactorCookie, signTwoFactorDeviceCookie } from "../src/lib/two-factor-cookie.ts";
import { KIDEASE_OPERATOR_EMAIL } from "../src/lib/admin-email.ts";

// Only this suite is invoked. Better Auth really verifies signed cookies against
// its local memory adapter. The app's middleware, verified-session resolver,
// role/email authorization, 2FA, trusted-device and idle gates are real modules.
// Framework request I/O, SQL, view-as overlay, desk readiness and queue rows are
// synthetic leaves. This suite is not actual HTTP/HTML or live-data evidence.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const key = "__kideaseAdminBootstrapTest";
const prefix = "kidease-admin-bootstrap-test:";
const testSecret = "local-admin-bootstrap-only-a4db535f-6ef0-4e21";
const actualRoles = pathToFileURL(join(root, "src/lib/server/roles.ts")).href;
const actualTimeout = pathToFileURL(join(root, "src/lib/timeout.ts")).href;
const modules = {
  transport: `
    export function createMiddleware() {
      return { client() { return this; }, server(run) { return { run }; } };
    }
    export function createServerFn() {
      let guards = [], validate = value => value;
      return {
        middleware(value) { guards = value; return this; },
        validator(value) { validate = value; return this; },
        handler(run) {
          return async (input = {}) => {
            const data = validate(input.data);
            const next = (index, context) => index === guards.length
              ? run({ data, context })
              : guards[index].run({ context, next: value => next(index + 1, { ...context, ...value?.context }) });
            return next(0, { bearerToken: globalThis.${key}.bearerToken });
          };
        }
      };
    }`,
  request: `
    export const getRequest = () => globalThis.${key}.request;
    export const getCookie = name => globalThis.${key}.cookie(name);
    export const setCookie = (name, value, options) => globalThis.${key}.responseCookies.push({ name, value, options });
    export const setResponseHeader = (name, value) => globalThis.${key}.responseHeaders.set(name, value);`,
  db: `export const getSql = async () => {
    const state = globalThis.${key};
    if (state.acquireError) throw state.acquireError;
    return state.sql;
  };`,
  auth: `
    export const authConfigured = true;
    export const auth = { api: { getSession: async input => {
      const state = globalThis.${key}; state.sessionReads++;
      return state.auth.api.getSession(input);
    } } };
    export const authSigningSecret = () => globalThis.${key}.env.BETTER_AUTH_SECRET;
    export const readSessionToken = () => globalThis.${key}.rawSessionToken();`,
  notify: `export const lookupUser = async userId => {
    const state = globalThis.${key}; state.userLookups++;
    if (state.lookupError) throw state.lookupError;
    const user = state.memory.user.find(row => row.id === userId);
    return user ? { ...user, emailVerified: user.emailVerified === true } : { email: null, emailVerified: false };
  };`,
  roles: `
    export { requireAdmin } from "kidease-bootstrap-actual-roles";
    export const resolveSessionDesks = async (userId, options) => {
      if (options?.readOnly !== true) throw new Error("Bootstrap must use read-only desk resolution");
      const state = globalThis.${key}; state.deskReads++;
      if (state.deskError) throw state.deskError;
      if (state.deskPending) return new Promise(() => {});
      return state.desks(userId);
    };`,
  centreAccess: `
    const unused = () => { throw new Error("Unexpected centre access in scoped bootstrap authorization test"); };
    export const isActiveCentreMember = unused;
    export const listOwnedDaycareIds = unused;`,
  viewAs: `export const effectiveSessionUser = async session => {
    const state = globalThis.${key};
    return state.effectiveUser || { id: session.id, email: session.email };
  };`,
  schema: `export const ensureTrustedDevices = async () => {};`,
  queue: `export const readAdminCentreQueueRows = async () => {
    const state = globalThis.${key}; state.queueReads++;
    await state.onQueueRead?.();
    if (state.queueError) throw state.queueError;
    return state.queueRows;
  };`,
  timeout: `
    export { withTimeout } from "kidease-bootstrap-actual-timeout";
    export const SQL_SETTLE_MS = 1000;`,
};
const replacements = new Map(
  [
    ["src/lib/db.ts", "db"],
    ["src/lib/auth/server.ts", "auth"],
    ["src/lib/server/notify.ts", "notify"],
    ["src/lib/server/roles.ts", "roles"],
    ["src/lib/server/centre-access.ts", "centreAccess"],
    ["src/lib/server/view-as.ts", "viewAs"],
    ["src/lib/server/runtime-schema.ts", "schema"],
    ["src/lib/server/admin-centre-queue.ts", "queue"],
    ["src/lib/timeout.ts", "timeout"],
  ].map(([file, name]) => [pathToFileURL(join(root, file)).href, name]),
);

function sourceFile(specifier, parentURL) {
  let file;
  if (specifier.startsWith("@/")) file = join(root, "src", specifier.slice(2));
  else if (specifier.startsWith(".") && parentURL?.startsWith("file:"))
    file = fileURLToPath(new URL(specifier, parentURL));
  if (!file) return null;
  return [file, `${file}.ts`, `${file}.tsx`, `${file}.mjs`].find(existsSync) ?? null;
}

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "kidease-bootstrap-actual-roles")
      return { url: actualRoles, shortCircuit: true };
    if (specifier === "kidease-bootstrap-actual-timeout")
      return { url: actualTimeout, shortCircuit: true };
    if (specifier === "@tanstack/react-start")
      return { url: `${prefix}transport`, shortCircuit: true };
    if (specifier === "@tanstack/react-start/server")
      return { url: `${prefix}request`, shortCircuit: true };
    const file = sourceFile(specifier, context.parentURL);
    if (!file) return nextResolve(specifier, context);
    const url = pathToFileURL(file).href;
    const mock = replacements.get(url);
    return { url: mock ? `${prefix}${mock}` : url, shortCircuit: true };
  },
  load(url, context, nextLoad) {
    if (url.startsWith(prefix))
      return { format: "module", source: modules[url.slice(prefix.length)], shortCircuit: true };
    const loaded = nextLoad(url, context);
    const syntheticEnvModules = [
      "/src/lib/server/admin-queue-bootstrap.ts",
      "/src/lib/auth/verify.server.ts",
      "/src/lib/server/two-factor.server.ts",
      "/src/lib/server/reauth.server.ts",
      "/src/lib/server/persistent-session.server.ts",
      "/src/lib/server/roles.ts",
    ];
    let source = loaded.source;
    let changed = false;
    if (syntheticEnvModules.some((file) => url.endsWith(file))) {
      source = `const process = { get env() { return globalThis.${key}.env; } };\n${Buffer.from(source).toString("utf8")}`;
      changed = true;
    }
    // The actual trusted-device guard is SSR code. Node has no Vite env.
    if (url.endsWith("/src/lib/server/trusted-devices.ts")) {
      source = Buffer.from(source).toString("utf8").replaceAll("import.meta.env.SSR", "true");
      changed = true;
    }
    return changed ? { ...loaded, source } : loaded;
  },
});

// Source-level env injection affects this harness only. No actual process.env
// flag is set, and no running application is activated by these tests.
const syntheticEnv = () => ({
  FEATURE_ADMIN_QUEUE_SSR: "1",
  FEATURE_PERSISTENT_SESSIONS: "0",
  BETTER_AUTH_SECRET: testSecret,
});
const originalFeatureValue = process.env.FEATURE_ADMIN_QUEUE_SSR;
globalThis[key] = { env: syntheticEnv() };
const { loadAdminQueueBootstrap } = await import("../src/lib/server/admin-queue-bootstrap.ts");
const { getCurrentUserTwoFactorExpiryMs } = await import("../src/lib/server/two-factor.server.ts");
let oldFetch;
let oldReadViewAs;

function state() {
  return globalThis[key];
}

function setCookies(cookies) {
  const headers = new Headers({
    host: "127.0.0.1:8081",
    cookie: Object.entries(cookies)
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
      .join("; "),
  });
  state().request = new Request("http://127.0.0.1:8081/admin", { headers });
}

function reset() {
  const now = Date.now();
  const memory = {
    user: [
      {
        id: "synthetic-operator",
        name: "Synthetic Operator",
        email: KIDEASE_OPERATOR_EMAIL,
        emailVerified: true,
        createdAt: new Date(now - 60_000),
        updatedAt: new Date(now),
      },
    ],
    session: [
      {
        id: "synthetic-session",
        token: "local-synthetic-session-only",
        userId: "synthetic-operator",
        createdAt: new Date(now - 60_000),
        updatedAt: new Date(now),
        expiresAt: new Date(now + 60 * 60_000),
      },
    ],
    account: [],
    verification: [],
  };
  const fixture = {
    memory,
    env: syntheticEnv(),
    request: null,
    sessionReads: 0,
    userLookups: 0,
    deskReads: 0,
    queueReads: 0,
    networkCalls: 0,
    responseCookies: [],
    responseHeaders: new Map(),
    sqlCalls: [],
    profileRole: "admin",
    seenAt: null,
    trustedRows: [],
    persistentRows: [],
    queueRows: [
      {
        daycareId: "synthetic-waiting",
        slug: "synthetic-waiting",
        name: "Synthetic Waiting",
        claimStatus: "pending",
        live: false,
        providerEmail: "private@example.invalid",
      },
      {
        daycareId: "synthetic-live",
        slug: "synthetic-live",
        name: "Synthetic Live",
        claimStatus: "approved",
        live: true,
      },
      {
        daycareId: "synthetic-declined",
        slug: "synthetic-declined",
        name: "Synthetic Declined",
        claimStatus: "declined",
        live: false,
      },
      {
        daycareId: "synthetic-unclaimed",
        slug: "synthetic-unclaimed",
        name: "Synthetic Unclaimed",
        claimStatus: "unclaimed",
        live: false,
      },
      {
        daycareId: "ke-test-ghost-001",
        slug: "test-ghost-claim-lab",
        name: "TEST Ghost Claim Lab",
        claimStatus: "waiting",
        live: false,
        isTest: true,
      },
    ],
    desks: () => ({
      role: "admin",
      desks: ["admin", "parent"],
      email: KIDEASE_OPERATOR_EMAIL,
      viewAs: null,
    }),
  };
  fixture.auth = betterAuth({
    secret: testSecret,
    baseURL: "http://127.0.0.1:8081",
    database: memoryAdapter(memory),
    advanced: {
      useSecureCookies: false,
      cookies: { session_token: { name: SESSION_TOKEN_COOKIE } },
    },
    // Keep the synthetic expiry fixed so the lease-boundary assertion does not
    // silently extend its fixture through Better Auth's normal sliding refresh.
    session: { cookieCache: { enabled: false }, disableSessionRefresh: true },
    logger: { disabled: true },
  });
  fixture.cookie = (name) => {
    const raw = parseCookieHeader(fixture.request.headers.get("cookie")).get(name);
    return raw === undefined ? undefined : decodeURIComponent(raw);
  };
  fixture.rawSessionToken = () => unsignedSessionToken(fixture.cookie(SESSION_TOKEN_COOKIE));
  fixture.query = async (text, values = []) => {
    fixture.sqlCalls.push({ text, values });
    if (/select role from profiles/i.test(text)) return [{ role: fixture.profileRole }];
    if (/insert into profiles/i.test(text)) return [];
    if (/update profiles set role = 'admin'/i.test(text)) {
      fixture.profileRole = "admin";
      return [];
    }
    if (/from trusted_devices/i.test(text)) return fixture.trustedRows;
    if (/select seen_at from admin_idle_seen/i.test(text))
      return fixture.seenAt ? [{ seen_at: fixture.seenAt }] : [];
    if (/insert into admin_idle_seen/i.test(text)) {
      fixture.seenAt = new Date();
      return [];
    }
    if (/select "createdAt" from "session"/i.test(text))
      return fixture.memory.session.filter(
        (row) => row.token === values[0] && row.userId === values[1],
      );
    if (/from device_sessions/i.test(text))
      return fixture.persistentRows.filter(
        (row) => row.session_token === values[0] && !row.revoked_at,
      );
    if (/delete from "session"/i.test(text)) {
      fixture.memory.session = fixture.memory.session.filter((row) => row.token !== values[0]);
      return [];
    }
    if (/update device_sessions|update "session"/i.test(text)) return [];
    throw new Error("Unexpected SQL in bootstrap test");
  };
  fixture.sql = (parts, ...values) =>
    fixture.query(
      parts.reduce((text, part, i) => text + (i ? `$${i}` : "") + part, ""),
      values,
    );
  fixture.sql.query = fixture.query;
  globalThis[key] = fixture;
  const token = memory.session[0].token;
  const signed = `${token}.${createHmac("sha256", testSecret).update(token).digest("base64")}`;
  fixture.validCookies = {
    [SESSION_TOKEN_COOKIE]: signed,
    [TWO_FACTOR_COOKIE]: signTwoFactorCookie("synthetic-operator", now + 60_000, testSecret),
  };
  setCookies(fixture.validCookies);
  return fixture;
}

beforeEach(() => {
  oldFetch = globalThis.fetch;
  oldReadViewAs = globalThis.__kideaseReadViewAs__;
  reset();
  globalThis.__kideaseReadViewAs__ = () => state().viewAs || null;
  globalThis.fetch = async () => {
    state().networkCalls++;
    throw new Error("Network is disabled in bootstrap tests");
  };
});
afterEach(() => {
  assert.equal(state().networkCalls, 0, "No external request is part of bootstrap tests");
  globalThis.fetch = oldFetch;
  if (oldReadViewAs === undefined) delete globalThis.__kideaseReadViewAs__;
  else globalThis.__kideaseReadViewAs__ = oldReadViewAs;
  assert.equal(
    process.env.FEATURE_ADMIN_QUEUE_SSR,
    originalFeatureValue,
    "The real application feature flag was never changed",
  );
  delete globalThis[key];
});
after(() => hooks.deregister());

test("bootstrap stays dormant unless its flag is exactly one", async () => {
  for (const value of [undefined, "0", "true", "yes", " 1 "]) {
    if (value === undefined) delete state().env.FEATURE_ADMIN_QUEUE_SSR;
    else state().env.FEATURE_ADMIN_QUEUE_SSR = value;
    assert.equal(await loadAdminQueueBootstrap(), null);
  }
  assert.equal(state().queueReads, 0);
  assert.equal(state().deskReads, 0);
  assert.equal(
    state().userLookups,
    0,
    "Disabled calls add no admin gate after the existing middleware",
  );
});

test("real signed session and staff proofs produce only global QA-excluded counts", async () => {
  const result = await loadAdminQueueBootstrap();
  assert.deepEqual(result.counts, {
    status: "ready",
    waiting: 1,
    approved: 1,
    declined: 1,
    all: 4,
  });
  assert.equal(result.viewerId, "synthetic-operator");
  assert.equal(result.sessionId, "synthetic-session");
  assert.equal(state().responseHeaders.get("Cache-Control"), "private, no-store");
  assert.ok(result.expiresAt > result.checkedAt && result.expiresAt <= result.checkedAt + 15_000);
  assert.equal(state().queueReads, 1);
  assert.ok(state().sessionReads >= 3, "Actual verified-session resolver rechecks the session");
  assert.deepEqual(Object.keys(result).sort(), [
    "checkedAt",
    "counts",
    "expiresAt",
    "sessionId",
    "viewerId",
  ]);
  const body = JSON.stringify(result);
  for (const forbidden of [
    state().memory.session[0].token,
    testSecret,
    "private@example.invalid",
    "Synthetic Waiting",
    TWO_FACTOR_COOKIE,
  ]) {
    assert.ok(!body.includes(forbidden), "The payload excludes private rows and proof material");
  }
});

test("signed-out, expired and tampered sessions and forged role cookies cannot read a summary", async () => {
  for (const kind of ["signed-out", "expired", "tampered", "role-fixture"]) {
    reset();
    if (kind === "signed-out") setCookies({});
    if (kind === "expired") state().memory.session[0].expiresAt = new Date(Date.now() - 1000);
    if (kind === "tampered")
      setCookies({
        ...state().validCookies,
        [SESSION_TOKEN_COOKIE]: `${state().validCookies[SESSION_TOKEN_COOKIE]}invalid`,
      });
    if (kind === "role-fixture") {
      state().env.E2E_ROLE_FIXTURE = "1";
      setCookies({ "kidease.e2e_role": "admin" });
    }
    await assert.rejects(loadAdminQueueBootstrap(), (error) => error.status === 401);
    assert.equal(state().queueReads, 0);
  }
});

test("SQL-promoted other mailboxes and unverified owner bootstrap stay unauthorized", async () => {
  for (const role of ["parent", "provider", "support", "admin"]) {
    reset();
    state().memory.user[0].email = "other@example.invalid";
    state().profileRole = role;
    await assert.rejects(loadAdminQueueBootstrap(), /Not authorized/);
    assert.equal(state().queueReads, 0);
  }
  reset();
  state().profileRole = "parent";
  state().memory.user[0].emailVerified = false;
  await assert.rejects(loadAdminQueueBootstrap(), /Not authorized/);
  assert.equal(state().queueReads, 0);
});

test("absent, expired, tampered and other-user 2FA cannot read a summary", async () => {
  const proofs = [
    undefined,
    signTwoFactorCookie("synthetic-operator", Date.now() - 1000, testSecret),
    "tampered",
    signTwoFactorCookie("other-user", Date.now() + 60_000, testSecret),
  ];
  for (const proof of proofs) {
    reset();
    const cookies = { ...state().validCookies };
    if (proof === undefined) delete cookies[TWO_FACTOR_COOKIE];
    else cookies[TWO_FACTOR_COOKIE] = proof;
    setCookies(cookies);
    await assert.rejects(loadAdminQueueBootstrap(), /Two-factor verification required/);
    assert.equal(state().queueReads, 0);
  }
});

test("revoked trusted devices and stale idle windows stop before the queue read", async () => {
  setCookies({
    ...state().validCookies,
    [TWO_FACTOR_DEVICE_COOKIE]: signTwoFactorDeviceCookie(
      "synthetic-operator",
      "synthetic-device",
      Date.now() + 60_000,
      testSecret,
    ),
  });
  state().trustedRows = [{ revoked_at: new Date(), expires_at: new Date(Date.now() + 60_000) }];
  await assert.rejects(loadAdminQueueBootstrap(), /Two-factor verification required/);
  assert.equal(state().queueReads, 0);
  reset();
  state().memory.session[0].createdAt = new Date(Date.now() - 45 * 60_000);
  await assert.rejects(loadAdminQueueBootstrap(), /Admin session timed out/);
  assert.equal(state().queueReads, 0);
});

test("scripted cross-site and government sessions preserve private request isolation", async () => {
  const headers = new Headers(state().request.headers);
  headers.set("sec-fetch-site", "cross-site");
  headers.set("sec-fetch-mode", "cors");
  headers.set("sec-fetch-dest", "empty");
  state().request = new Request(state().request.url, { method: "POST", headers });
  await assert.rejects(loadAdminQueueBootstrap(), (error) => error.status === 403);
  assert.equal(state().queueReads, 0);
  reset();
  state().profileRole = "government";
  await assert.rejects(loadAdminQueueBootstrap(), (error) => error.status === 403);
  assert.equal(state().queueReads, 0);
});

test("an expired persistent-device window invalidates the genuine session before counts", async () => {
  state().env.FEATURE_PERSISTENT_SESSIONS = "1";
  state().persistentRows = [
    {
      id: "synthetic-persistent",
      user_id: "synthetic-operator",
      session_token: state().memory.session[0].token,
      shell: false,
      remember: false,
      idle_expires_at: new Date(Date.now() - 1000),
      absolute_expires_at: new Date(Date.now() - 1000),
      revoked_at: null,
    },
  ];
  await assert.rejects(loadAdminQueueBootstrap(), (error) => error.status === 401);
  assert.equal(state().queueReads, 0);
});

test("effective-user overlays, invalid desk readiness and view-as stay closed", async () => {
  state().effectiveUser = { id: "synthetic-viewed-parent", email: "viewed@example.invalid" };
  await assert.rejects(loadAdminQueueBootstrap(), /Not authorized|Unauthorized/);
  assert.equal(state().queueReads, 0);
  for (const desks of [
    { role: "parent", desks: ["admin"], email: KIDEASE_OPERATOR_EMAIL },
    { role: "admin", desks: [], email: KIDEASE_OPERATOR_EMAIL },
    { role: "admin", desks: ["admin"], email: null },
    {
      role: "admin",
      desks: ["admin"],
      email: KIDEASE_OPERATOR_EMAIL,
      viewAs: { targetUserId: "viewed" },
    },
  ]) {
    reset();
    state().desks = () => desks;
    await assert.rejects(loadAdminQueueBootstrap(), /Not authorized/);
    assert.equal(state().queueReads, 0);
  }
  reset();
  state().deskError = new Error("Synthetic desk read failure");
  await assert.rejects(loadAdminQueueBootstrap(), /Synthetic desk read failure/);
  assert.equal(state().queueReads, 0);
});

test("a genuine empty queue stays zero and a failed queue read stays unavailable", async () => {
  state().queueRows = [];
  assert.deepEqual((await loadAdminQueueBootstrap()).counts, {
    status: "ready",
    waiting: 0,
    approved: 0,
    declined: 0,
    all: 0,
  });
  reset();
  state().queueError = new Error("Synthetic internal queue detail");
  const result = await loadAdminQueueBootstrap();
  assert.deepEqual(result.counts, { status: "unavailable" });
  assert.ok(!JSON.stringify(result).includes("Synthetic internal queue detail"));
  assert.ok(state().userLookups >= 2, "Data recovery still rechecks real admin authorization");
});

test("role, proof and session changes while rows are read never serialize counts", async () => {
  for (const revoke of [
    () => {
      state().memory.user[0].email = "other@example.invalid";
    },
    () => {
      setCookies({ [SESSION_TOKEN_COOKIE]: state().validCookies[SESSION_TOKEN_COOKIE] });
    },
    () => {
      state().memory.session[0].id = "synthetic-replaced-session";
    },
    () => {
      const token = "synthetic-rotated-session-only";
      state().memory.session[0].token = token;
      const signed = `${token}.${createHmac("sha256", testSecret).update(token).digest("base64")}`;
      setCookies({ ...state().validCookies, [SESSION_TOKEN_COOKIE]: signed });
    },
    () => {
      state().memory.session = [];
    },
    () => {
      state().effectiveUser = { id: "synthetic-viewed-parent", email: "viewed@example.invalid" };
    },
  ]) {
    reset();
    state().onQueueRead = revoke;
    await assert.rejects(loadAdminQueueBootstrap(), /Not authorized|Unauthorized|Two-factor/);
    assert.equal(state().queueReads, 1);
  }
});

test("trusted-device revocation during the read also blocks the final payload", async () => {
  setCookies({
    ...state().validCookies,
    [TWO_FACTOR_DEVICE_COOKIE]: signTwoFactorDeviceCookie(
      "synthetic-operator",
      "synthetic-device",
      Date.now() + 60_000,
      testSecret,
    ),
  });
  state().trustedRows = [{ revoked_at: null, expires_at: new Date(Date.now() + 60_000) }];
  state().onQueueRead = () => {
    state().trustedRows[0].revoked_at = new Date();
  };
  await assert.rejects(loadAdminQueueBootstrap(), /Two-factor verification required/);
  assert.equal(state().queueReads, 1);
});

test("unavailable data cannot hide an authorization loss during that read", async () => {
  state().onQueueRead = () => {
    state().memory.user[0].email = "other@example.invalid";
  };
  state().queueError = new Error("Synthetic queue failure");
  await assert.rejects(loadAdminQueueBootstrap(), /Not authorized/);
});

test("the lease cannot outlive either session expiry or the verified 2FA proof", async () => {
  const expiry = Date.now() + 5000;
  state().memory.session[0].expiresAt = new Date(expiry);
  state().memory.session[0].updatedAt = new Date(Date.now() + 60_000);
  const result = await loadAdminQueueBootstrap();
  assert.ok(result.expiresAt <= expiry);
  reset();
  const proofExpiry = Date.now() + 5000;
  setCookies({
    ...state().validCookies,
    [TWO_FACTOR_COOKIE]: signTwoFactorCookie("synthetic-operator", proofExpiry, testSecret),
  });
  assert.equal(getCurrentUserTwoFactorExpiryMs("synthetic-operator"), proofExpiry);
  assert.ok((await loadAdminQueueBootstrap()).expiresAt <= proofExpiry);
});

test("proof expiry uses valid matching signatures and shared-host fallback only", async () => {
  const expiry = Date.now() + 5000;
  setCookies({
    ...state().validCookies,
    [TWO_FACTOR_COOKIE]: "tampered-host-proof",
    [SHARED_TWO_FACTOR_COOKIE]: signTwoFactorCookie("synthetic-operator", expiry, testSecret),
    [TWO_FACTOR_DEVICE_COOKIE]: signTwoFactorDeviceCookie(
      "different-user",
      "foreign-device",
      expiry + 50_000,
      testSecret,
    ),
  });
  assert.equal(getCurrentUserTwoFactorExpiryMs("synthetic-operator"), expiry);
  assert.ok((await loadAdminQueueBootstrap()).expiresAt <= expiry);
});

test("a hung desk-readiness check is bounded and never starts a queue read", async () => {
  state().deskPending = true;
  await assert.rejects(loadAdminQueueBootstrap(), /admin-bootstrap-timeout/);
  assert.equal(state().queueReads, 0);
});

test("a hung queue read becomes unavailable while complete post-read authorization still runs", async () => {
  state().onQueueRead = () => new Promise(() => {});
  const result = await loadAdminQueueBootstrap();
  assert.deepEqual(result.counts, { status: "unavailable" });
  assert.ok(state().userLookups >= 2);
  assert.equal(state().queueReads, 1);
});

test("desk readiness revoked during the data read also prevents serialization", async () => {
  state().onQueueRead = () => {
    state().desks = () => ({
      role: "parent",
      desks: ["parent"],
      email: KIDEASE_OPERATOR_EMAIL,
      viewAs: null,
    });
  };
  await assert.rejects(loadAdminQueueBootstrap(), /Not authorized/);
  assert.equal(state().queueReads, 1);
});
