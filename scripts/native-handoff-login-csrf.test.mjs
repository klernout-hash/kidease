/**
 * Native sign-in handoff must not become a login CSRF bearer code.
 *
 * These tests fail while /auth/app-return will mint a code for any session
 * cookie and /auth/native-handoff will Set-Cookie that session for anyone
 * who presents the code. They pass once a handoff is bound to the webview
 * that started it:
 *
 * - The webview keeps a random verifier and sends only its lowercase hex
 *   SHA-256 as the `hv` query parameter on /auth/native-start and on
 *   /auth/app-return (the OAuth callback).
 * - native_auth_handoff.verifier_hash stores that hex string.
 * - /auth/native-handoff sets session cookies only when the request also
 *   carries cookie `__Host-kidease.native_handoff` whose SHA-256 equals the
 *   hash on that row. The comparison and the session token that is set come
 *   from the same read. A second read of the row is not the session to set.
 * - The raw verifier never appears in the app finish URL. A query string,
 *   fragment, or body cannot take the place of the cookie.
 * - Refusing a request does not delete the handoff row.
 * - A request that already has a different session cookie does not receive
 *   the handoff session. Query flags cannot confirm the replacement.
 *
 * The SQL stand-in applies the statements in native-oauth-return.server.ts
 * (session lookup, handoff insert, handoff delete) and equality updates on
 * the same handoff columns. The second read of a handoff code returns a
 * different session token, so a check that looks the row up again before
 * setting the cookie still fails.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createInternalContext, serializeSignedCookie } from "better-call";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const store = new AsyncLocalStorage();
const virtualPrefix = "kidease-handoff-csrf:";
const SECRET = "placeholder-secret";
const HANDOFF_VERIFIER_COOKIE = "__Host-kidease.native_handoff";
const BROWSER_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
const FUTURE = "2099-01-01T00:00:00.000Z";

globalThis.__kideaseCapListeners = [];

const virtual = {
  transport: `
    export function createMiddleware() {
      return { server(run) { return { run }; } };
    }
    export function createStart(factory) {
      return { getOptions: () => factory() };
    }
  `,
  db: `
    export async function getSql() {
      const run = globalThis.__kideaseHandoffSql;
      const sql = (strings, ...values) => run(strings, values);
      sql.query = (text, params = []) => run(text, params);
      return sql;
    }
  `,
  authServer: `
    export const auth = {
      api: {
        async signInSocial(input) {
          globalThis.__kideaseHandoffSocial(input);
          const location = "https://accounts.google.com/o/oauth2/v2/auth?state=placeholder";
          return new Response(JSON.stringify({ url: location }), {
            status: 200,
            headers: { location },
          });
        },
      },
    };
  `,
  capApp: `
    export const App = {
      async addListener(name, cb) {
        globalThis.__kideaseCapListeners.push({ name, cb });
        return { remove: async () => {} };
      },
    };
  `,
  capBrowser: `export const Browser = { close: async () => {} };`,
  capCore: `export function registerPlugin() { return { start: async () => ({}) }; }`,
};

const mockFiles = new Map(
  [
    ["src/lib/db.ts", "db"],
    ["src/lib/auth/server.ts", "authServer"],
  ].map(([file, name]) => [pathToFileURL(join(root, file)).href, name]),
);

function resolveSource(specifier, parentURL) {
  let candidate;
  if (specifier.startsWith("@/")) candidate = join(root, "src", specifier.slice(2));
  else if (specifier.startsWith(".") && parentURL?.startsWith("file:")) {
    candidate = fileURLToPath(new URL(specifier, parentURL));
  }
  if (!candidate) return null;
  return [candidate, `${candidate}.ts`, `${candidate}.tsx`, `${candidate}.mjs`].find((file) => existsSync(file)) ?? null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@tanstack/react-start") return { url: `${virtualPrefix}transport`, shortCircuit: true };
    if (specifier === "@capacitor/app") return { url: `${virtualPrefix}capApp`, shortCircuit: true };
    if (specifier === "@capacitor/browser") return { url: `${virtualPrefix}capBrowser`, shortCircuit: true };
    if (specifier === "@capacitor/core") return { url: `${virtualPrefix}capCore`, shortCircuit: true };
    const source = resolveSource(specifier, context.parentURL);
    if (!source) return nextResolve(specifier, context);
    const url = pathToFileURL(source).href;
    const mock = mockFiles.get(url);
    return { url: mock ? `${virtualPrefix}${mock}` : url, shortCircuit: true };
  },
  load(url, context, nextLoad) {
    if (!url.startsWith(virtualPrefix)) return nextLoad(url, context);
    return { format: "module", source: virtual[url.slice(virtualPrefix.length)], shortCircuit: true };
  },
});

const { SESSION_TOKEN_COOKIE, SHARED_SESSION_TOKEN_COOKIE } = await import("../src/lib/auth/cookies.ts");
const { NATIVE_UA_TOKEN } = await import("../src/lib/native-entitlements.ts");
const { parseNativeAuthFinish, nativeHandoffPath } = await import("../src/lib/auth/native-oauth.ts");
const { handleNativeAuthAppReturn, handleNativeAuthHandoff, handleNativeAuthStart } = await import(
  "../src/lib/auth/native-oauth-return.server.ts"
);
const { startInstance } = await import("../src/start.ts");
const { bindNativeOAuthReturn } = await import("../src/lib/auth/native-oauth-client.ts");

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function flattenSql(text) {
  return text.replace(/\s+/g, " ").trim();
}

function whereOf(sql) {
  const match = sql.match(/\swhere\s+(.+?)(?:\sreturning\b|\slimit\b|\sorder\b|$)/i);
  return match ? match[1].trim() : null;
}

function limitOf(sql) {
  const match = sql.match(/\slimit\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

function returningOf(sql) {
  const match = sql.match(/\sreturning\s+(.+)$/i);
  if (!match) return null;
  return match[1].split(",").map((part) => part.trim().replace(/"/g, ""));
}

function toTime(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function evalCompare(expr, row, params) {
  const match = expr
    .trim()
    .match(/^(?:"([^"]+)"|([A-Za-z_][\w]*))\s*(=|>=|<=|>|<)\s*(\$\d+|now\(\))$/i);
  if (!match) throw new Error(`unsupported handoff sql predicate: ${expr}`);
  const column = match[1] || match[2];
  const op = match[3];
  const raw = match[4];
  const left = row[column];
  const right = raw.toLowerCase() === "now()" ? new Date() : params[Number(raw.slice(1)) - 1];
  const leftTime = toTime(left);
  const rightTime = toTime(right);
  if (op !== "=" && leftTime != null && rightTime != null) {
    if (op === ">") return leftTime > rightTime;
    if (op === "<") return leftTime < rightTime;
    if (op === ">=") return leftTime >= rightTime;
    if (op === "<=") return leftTime <= rightTime;
  }
  if (op === "=") return String(left) === String(right);
  throw new Error(`unsupported handoff sql predicate: ${expr}`);
}

function evalWhere(where, row, params) {
  if (!where) return true;
  return where.split(/\s+and\s+/i).every((part) => evalCompare(part, row, params));
}

function project(row, columns) {
  if (!columns) return { ...row };
  const out = {};
  for (const column of columns) out[column] = row[column];
  return out;
}

function materialize(state, row) {
  const seen = (state.reads.get(row.code) || 0) + 1;
  state.reads.set(row.code, seen);
  if (seen > 1) return { ...row, session_token: state.swappedRaw };
  return { ...row };
}

function exec(state, text, params) {
  const sql = flattenSql(text);
  state.queries.push(sql);
  if (/^select\b/i.test(sql) && /\bfrom\s+"session"/i.test(sql)) {
    let rows = [...state.sessions.values()].filter((row) => evalWhere(whereOf(sql), row, params));
    const limit = limitOf(sql);
    if (limit != null) rows = rows.slice(0, limit);
    return rows.map((row) => ({ token: row.token }));
  }
  if (/^insert\s+into\s+native_auth_handoff\b/i.test(sql)) {
    const match = sql.match(/^insert\s+into\s+native_auth_handoff\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)$/i);
    if (!match) throw new Error(`unsupported handoff insert: ${sql}`);
    const columns = match[1].split(",").map((part) => part.trim().replace(/"/g, ""));
    const values = match[2].split(",").map((part) => part.trim());
    const row = {};
    columns.forEach((column, index) => {
      const token = values[index];
      if (!/^\$\d+$/.test(token)) throw new Error(`unsupported handoff insert value: ${token}`);
      row[column] = params[Number(token.slice(1)) - 1];
    });
    if (!row.code) throw new Error("handoff insert missing code");
    state.handoffs.set(row.code, row);
    return [];
  }
  if (/^update\s+native_auth_handoff\b/i.test(sql)) {
    const match = sql.match(/^update\s+native_auth_handoff\s+set\s+(.+)\s+where\s+(.+)$/i);
    if (!match) throw new Error(`unsupported handoff update: ${sql}`);
    const rows = [...state.handoffs.values()].filter((row) => evalWhere(match[2], row, params));
    for (const row of rows) {
      for (const assignment of match[1].split(",")) {
        const set = assignment.trim().match(/^("([^"]+)"|([A-Za-z_][\w]*))\s*=\s*(\$\d+)$/);
        if (!set) throw new Error(`unsupported handoff update: ${assignment}`);
        const column = set[2] || set[3];
        row[column] = params[Number(set[4].slice(1)) - 1];
      }
    }
    return [];
  }
  if (/^select\b/i.test(sql) && /\bfrom\s+native_auth_handoff\b/i.test(sql)) {
    let rows = [...state.handoffs.values()].filter((row) => evalWhere(whereOf(sql), row, params));
    const limit = limitOf(sql);
    if (limit != null) rows = rows.slice(0, limit);
    const columns = sql
      .match(/^select\s+(.+?)\s+from\b/i)?.[1]
      .split(",")
      .map((part) => part.trim().replace(/"/g, ""));
    return rows.map((row) => project(materialize(state, row), columns?.includes("*") ? null : columns));
  }
  if (/^delete\s+from\s+native_auth_handoff\b/i.test(sql)) {
    const rows = [...state.handoffs.values()].filter((row) => evalWhere(whereOf(sql), row, params));
    const columns = returningOf(sql);
    const returned = [];
    for (const row of rows) {
      state.handoffs.delete(row.code);
      returned.push(project(materialize(state, row), columns));
    }
    return returned;
  }
  throw new Error(`unsupported handoff sql: ${sql}`);
}

globalThis.__kideaseHandoffSql = (textOrStrings, values) => {
  const state = store.getStore();
  if (!state) throw new Error("handoff sql used outside a test");
  if (typeof textOrStrings === "string") return exec(state, textOrStrings, values || []);
  let text = textOrStrings[0];
  const params = values;
  for (let i = 0; i < params.length; i += 1) text += `$${i + 1}${textOrStrings[i + 1]}`;
  return exec(state, text, params);
};

globalThis.__kideaseHandoffSocial = (input) => {
  const state = store.getStore();
  if (!state) throw new Error("native start used outside a test");
  state.social.push(input);
};

async function signToken(unsigned) {
  const header = await serializeSignedCookie(SESSION_TOKEN_COOKIE, unsigned, SECRET, {
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });
  const prefix = `${SESSION_TOKEN_COOKIE}=`;
  if (!header.startsWith(prefix)) throw new Error("signed session cookie is missing the session name");
  return { unsigned, raw: header.slice(prefix.length).split(";")[0] };
}

async function verifiedSession(name, value) {
  const ctx = await createInternalContext(
    { headers: new Headers({ cookie: `${name}=${value}` }) },
    { options: {}, path: "handoff-check" },
  );
  const verified = await ctx.getSignedCookie(name, SECRET);
  return typeof verified === "string" ? verified : null;
}

async function createState() {
  const attacker = await signToken(randomBytes(24).toString("base64url"));
  const victim = await signToken(randomBytes(24).toString("base64url"));
  const swapped = await signToken(randomBytes(24).toString("base64url"));
  const roundTrip = await verifiedSession(SESSION_TOKEN_COOKIE, attacker.raw);
  if (roundTrip !== attacker.unsigned) throw new Error("better-call did not verify the signed session cookie");
  return {
    sessions: new Map([
      [attacker.unsigned, { token: attacker.unsigned, expiresAt: FUTURE, userId: "attacker" }],
      [victim.unsigned, { token: victim.unsigned, expiresAt: FUTURE, userId: "victim" }],
    ]),
    handoffs: new Map(),
    reads: new Map(),
    queries: [],
    social: [],
    attacker,
    victim,
    swappedRaw: swapped.raw,
    swappedUnsigned: swapped.unsigned,
  };
}

function dispatch(request) {
  const middleware = startInstance.getOptions().requestMiddleware;
  const call = (index) => {
    if (index >= middleware.length) return Promise.resolve(new Response("fell through", { status: 599 }));
    return middleware[index].run({ request, next: () => call(index + 1) });
  };
  return call(0);
}

async function mint(state, hv) {
  const url = new URL("https://www.kidease.ca/auth/app-return");
  url.searchParams.set("next", "/parent");
  if (hv) url.searchParams.set("hv", hv);
  const response = await handleNativeAuthAppReturn(
    new Request(url, {
      headers: {
        cookie: `${SESSION_TOKEN_COOKIE}=${state.attacker.raw}`,
        "x-forwarded-host": "www.kidease.ca",
      },
    }),
  );
  const location = response.headers.get("location") || "";
  const parsed = parseNativeAuthFinish(location);
  if (!parsed?.code) assert.fail("app-return did not mint an app finish code");
  if (!state.handoffs.has(parsed.code)) assert.fail("app finish code was not stored for the session");
  const stored = state.handoffs.get(parsed.code);
  if (stored.session_token !== state.attacker.raw) assert.fail("stored handoff is not the minter session");
  return { response, location, parsed, code: parsed.code };
}

async function sessionProblems(response, state) {
  const problems = [];
  for (const line of response.headers.getSetCookie()) {
    const name = line.split("=", 1)[0];
    const value = line.slice(name.length + 1).split(";")[0];
    if (name === SESSION_TOKEN_COOKIE) problems.push("set the host session cookie");
    if (name === SHARED_SESSION_TOKEN_COOKIE) problems.push("set the shared session cookie");
    const verified = await verifiedSession(name, value);
    if (verified === state.attacker.unsigned) problems.push("set a cookie that verifies as the minted session");
    if (verified === state.victim.unsigned) problems.push("set a cookie that verifies as the other session");
  }
  return [...new Set(problems)];
}

async function assertNoSessionCookie(response, state) {
  assert.deepEqual(await sessionProblems(response, state), []);
}

async function assertRefused(response, state, code) {
  const problems = await sessionProblems(response, state);
  if (!state.handoffs.has(code)) problems.push("deleted the code before refusing");
  assert.deepEqual(problems, []);
}

async function redeem(state, code, input = {}) {
  const params = new URLSearchParams();
  params.set("code", code);
  params.set("next", "/parent");
  for (const [key, value] of Object.entries(input.search || {})) params.set(key, value);
  const host = input.host || "www.kidease.ca";
  const url = `https://${host}/auth/native-handoff?${params.toString()}`;
  const headers = new Headers({
    "x-forwarded-host": host,
    "user-agent": input.ua || BROWSER_UA,
  });
  if (input.cookie) headers.set("cookie", input.cookie);
  const request = new Request(url, { method: input.method || "GET", headers, body: input.body });
  const response = input.middleware ? await dispatch(request) : await handleNativeAuthHandoff(request);
  return response;
}

async function assertMintedSession(response, state) {
  const lines = response.headers.getSetCookie();
  let sawHost = false;
  let sawShared = false;
  for (const line of lines) {
    const name = line.split("=", 1)[0];
    if (name !== SESSION_TOKEN_COOKIE && name !== SHARED_SESSION_TOKEN_COOKIE) continue;
    if (!/;\s*HttpOnly\b/i.test(line) || !/;\s*Secure\b/i.test(line) || !/;\s*SameSite=Lax\b/i.test(line)) {
      assert.fail("session cookie is missing HttpOnly, Secure, or SameSite=Lax");
    }
    const value = line.slice(name.length + 1).split(";")[0];
    const verified = await verifiedSession(name, value);
    if (verified === state.swappedUnsigned) assert.fail("handoff set a session token from a later read");
    if (verified === state.attacker.unsigned) {
      if (state.sessions.get(verified)?.userId !== "attacker") assert.fail("verified cookie is not the minted session");
      if (name === SESSION_TOKEN_COOKIE) sawHost = true;
      if (name === SHARED_SESSION_TOKEN_COOKIE) sawShared = true;
    }
  }
  if (!sawHost || !sawShared) assert.fail("bound handoff did not set the minted host and shared session cookies");
  if (nameLeaksVerifier(lines)) assert.fail("handoff response exposed the raw verifier");
}

function nameLeaksVerifier(lines) {
  return lines.some((line) => line.split("=", 1)[0] === HANDOFF_VERIFIER_COOKIE);
}

function callbackCarriesHash(value, hv, verifier) {
  const url = new URL(value, "https://www.kidease.ca");
  return url.searchParams.get("hv") === hv && !url.search.includes(verifier);
}

describe("native auth handoff login csrf", () => {
  test("the handoff table has a column for the verifier hash", () => {
    const found = readdirSync(join(root, "migrations")).some((name) => {
      if (!name.endsWith(".sql")) return false;
      const sql = readFileSync(join(root, "migrations", name), "utf8");
      return sql.includes("native_auth_handoff") && sql.includes("verifier_hash");
    });
    assert.equal(found, true);
  });

  test("app-return binds the finish code to the verifier hash and hides the verifier", async () => {
    const state = await createState();
    const verifier = randomBytes(24).toString("base64url");
    const hv = sha256Hex(verifier);
    await store.run(state, async () => {
      const minted = await mint(state, hv);
      const row = state.handoffs.get(minted.code);
      assert.equal(row?.verifier_hash === hv, true);
      assert.equal(minted.location.includes(verifier), false);
    });
  });

  test("native-start keeps the verifier hash on every OAuth callback", async () => {
    const state = await createState();
    const verifier = randomBytes(24).toString("base64url");
    const hv = sha256Hex(verifier);
    const previous = process.env.GOOGLE_SIGNIN_ENABLED;
    process.env.GOOGLE_SIGNIN_ENABLED = "1";
    try {
      await store.run(state, async () => {
        const url = new URL("https://www.kidease.ca/auth/native-start");
        url.searchParams.set("provider", "google");
        url.searchParams.set("next", "/parent");
        url.searchParams.set("errorNext", "/login");
        url.searchParams.set("newUser", "/parent/welcome");
        url.searchParams.set("hv", hv);
        const response = await handleNativeAuthStart(new Request(url));
        assert.equal(response.status, 302);
        assert.equal(state.social.length, 1);
        const body = state.social[0].body;
        for (const callback of [body.callbackURL, body.errorCallbackURL, body.newUserCallbackURL]) {
          assert.equal(callbackCarriesHash(callback, hv, verifier), true);
        }
      });
    } finally {
      if (previous == null) delete process.env.GOOGLE_SIGNIN_ENABLED;
      else process.env.GOOGLE_SIGNIN_ENABLED = previous;
    }
  });

  test("a browser that only presents the finish code does not receive the session", async () => {
    const state = await createState();
    await store.run(state, async () => {
      const minted = await mint(state);
      const response = await redeem(state, minted.code, { middleware: true });
      assert.notEqual(response.status, 599);
      await assertRefused(response, state, minted.code);
    });
  });

  test("the native shell user agent does not authorize a code by itself", async () => {
    const state = await createState();
    await store.run(state, async () => {
      const minted = await mint(state);
      const response = await redeem(state, minted.code, { ua: `Mozilla/5.0 ${NATIVE_UA_TOKEN}` });
      await assertRefused(response, state, minted.code);
    });
  });

  test("POST of the finish code does not set the session", async () => {
    const state = await createState();
    await store.run(state, async () => {
      const minted = await mint(state);
      const response = await redeem(state, minted.code, {
        method: "POST",
        body: "verifier=from-body",
      });
      await assertRefused(response, state, minted.code);
    });
  });

  test("a verifier in the query string does not authorize the handoff", async () => {
    const state = await createState();
    const verifier = randomBytes(24).toString("base64url");
    const hv = sha256Hex(verifier);
    await store.run(state, async () => {
      const minted = await mint(state, hv);
      const response = await redeem(state, minted.code, {
        search: { verifier, hv, confirm: "1", replace: "1", force: "1" },
      });
      await assertRefused(response, state, minted.code);
    });
  });

  test("the wrong verifier cookie does not authorize the handoff", async () => {
    const state = await createState();
    const verifier = randomBytes(24).toString("base64url");
    const hv = sha256Hex(verifier);
    await store.run(state, async () => {
      const minted = await mint(state, hv);
      const response = await redeem(state, minted.code, {
        cookie: `${HANDOFF_VERIFIER_COOKIE}=${randomBytes(24).toString("base64url")}`,
      });
      await assertRefused(response, state, minted.code);
    });
  });

  test("a non-host cookie name does not carry the verifier", async () => {
    const state = await createState();
    const verifier = randomBytes(24).toString("base64url");
    const hv = sha256Hex(verifier);
    await store.run(state, async () => {
      const minted = await mint(state, hv);
      const response = await redeem(state, minted.code, {
        cookie: `kidease.native_handoff=${verifier}`,
      });
      await assertRefused(response, state, minted.code);
    });
  });

  test("an existing different session is not replaced", async () => {
    const state = await createState();
    const verifier = randomBytes(24).toString("base64url");
    const hv = sha256Hex(verifier);
    await store.run(state, async () => {
      const minted = await mint(state, hv);
      const response = await redeem(state, minted.code, {
        cookie: `${SESSION_TOKEN_COOKIE}=${state.victim.raw}; ${HANDOFF_VERIFIER_COOKIE}=${verifier}`,
        search: { confirm: "1", replace: "1", force: "1" },
        ua: `Mozilla/5.0 ${NATIVE_UA_TOKEN}`,
      });
      await assertRefused(response, state, minted.code);
      assert.equal(state.sessions.get(state.victim.unsigned)?.userId, "victim");
    });
  });

  test("kidease and ca.kidease.app finish links redeem only with the bound verifier", async () => {
    const state = await createState();
    await store.run(state, async () => {
      const failures = [];
      for (const scheme of ["ca.kidease.app", "kidease"]) {
        const minted = await mint(state);
        const raw =
          scheme === "ca.kidease.app"
            ? minted.location
            : `kidease://auth/finish?code=${minted.code}&next=/parent`;
        const parsed = parseNativeAuthFinish(raw);
        if (parsed?.code !== minted.code) {
          failures.push(`${scheme} did not parse the finish code`);
          continue;
        }
        const path = nativeHandoffPath(parsed);
        if (path.includes("verifier")) failures.push(`${scheme} copied a verifier into the handoff path`);
        const response = await redeem(state, new URL(path, "https://www.kidease.ca").searchParams.get("code"));
        const problems = await sessionProblems(response, state);
        if (!state.handoffs.has(minted.code)) problems.push("deleted the code before refusing");
        if (problems.length) failures.push(`${scheme}: ${problems.join(", ")}`);
      }
      assert.deepEqual(failures, []);
    });
  });

  test("an appUrlOpen finish link is forwarded and still does not set the session", async () => {
    const state = await createState();
    await store.run(state, async () => {
      const minted = await mint(state);
      const assigned = [];
      globalThis.window = {
        location: {
          pathname: "/login",
          search: "",
          assign(url) {
            assigned.push(String(url));
          },
        },
        setTimeout(fn) {
          fn();
          return 0;
        },
      };
      await bindNativeOAuthReturn();
      const listener = globalThis.__kideaseCapListeners.find((entry) => entry.name === "appUrlOpen");
      listener.cb({ url: minted.location });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(assigned.length, 1);
      assert.equal(assigned[0], nativeHandoffPath(parseNativeAuthFinish(minted.location)));
      const code = new URL(assigned[0], "https://www.kidease.ca").searchParams.get("code");
      const response = await redeem(state, code, { middleware: true, ua: `Mozilla/5.0 ${NATIVE_UA_TOKEN}` });
      assert.notEqual(response.status, 599);
      await assertRefused(response, state, code);
    });
  });

  test("the webview that holds the matching verifier receives the minted session", async () => {
    const state = await createState();
    const verifier = randomBytes(24).toString("base64url");
    const hv = sha256Hex(verifier);
    await store.run(state, async () => {
      const minted = await mint(state, hv);
      assert.equal(state.handoffs.get(minted.code)?.verifier_hash === hv, true);
      assert.equal(minted.location.includes(verifier), false);
      const response = await redeem(state, minted.code, {
        cookie: `${HANDOFF_VERIFIER_COOKIE}=${verifier}`,
        middleware: true,
        ua: `Mozilla/5.0 ${NATIVE_UA_TOKEN}`,
      });
      assert.equal(response.status, 302);
      await assertMintedSession(response, state);
      assert.equal(state.handoffs.has(minted.code), false);
      const again = await redeem(state, minted.code, {
        cookie: `${HANDOFF_VERIFIER_COOKIE}=${verifier}`,
      });
      await assertNoSessionCookie(again, state);
    });
  });
});
