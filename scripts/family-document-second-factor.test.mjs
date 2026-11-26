import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { after, beforeEach, describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * Staff download of a parent-shared immunization or subsidy file.
 * The handlers, second-factor decision, centre role lookup, and file loader
 * are the real modules. Postgres is in-memory. Object storage is the boundary.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stateKey = "__familyDocSecondFactor";
const prefix = "family-doc-second-factor:";
const DECOY_KEY = "family-docs/decoy/swapped.pdf";
const IMM_KEY = "family-docs/parent-a/fd-imm.pdf";
const SUB_KEY = "family-docs/parent-a/fd-sub.pdf";
const OWN_KEY = "family-docs/staff-docs/fd-own.pdf";
const OTHER_KEY = "family-docs/parent-b/fd-other.pdf";
const REVOKED_KEY = "family-docs/parent-a/fd-revoked.pdf";

const immBytes = Buffer.from("%PDF-1.4\n% synthetic-immunization-a\n");
const subBytes = Buffer.from("%PDF-1.4\n% synthetic-subsidy-a\n");
const ownBytes = Buffer.from("%PDF-1.4\n% synthetic-own-staff\n");
const otherBytes = Buffer.from("%PDF-1.4\n% synthetic-other-centre\n");
const revokedBytes = Buffer.from("%PDF-1.4\n% synthetic-revoked-share\n");
const dataBytes = Buffer.from("%PDF-1.4\n% synthetic-data-url-subsidy\n");
const decoyBytes = Buffer.from("%PDF-1.4\n% synthetic-swapped-decoy\n");
const DATA_REF = `data:application/pdf;base64,${dataBytes.toString("base64")}`;

if (!process.env.BETTER_AUTH_SECRET) process.env.BETTER_AUTH_SECRET = "placeholder-not-a-real-secret";
delete process.env.POSTHOG_FLAGS_KEY;
process.env.FEATURE_FAMILY_VAULT = "1";

const virtual = {
  router: `export function createFileRoute() { return (config) => config; }`,
  start: `
    export function createServerOnlyFn(fn) { return fn; }
    export function createServerFn() {
      const builder = {
        middleware() { return builder; },
        validator() { return builder; },
        handler(fn) { return fn; },
      };
      return builder;
    }
    export function createMiddleware() {
      const builder = { client() { return builder; }, server(fn) { return fn; } };
      return builder;
    }
  `,
  server: `
    export function getCookie(name) {
      const jar = globalThis.${stateKey}.cookies;
      return Object.prototype.hasOwnProperty.call(jar, name) ? jar[name] : undefined;
    }
    export function getRequest() { return globalThis.${stateKey}.request ?? null; }
    export function setCookie() {}
  `,
  db: `export const getSql = async () => globalThis.${stateKey}.sql;`,
  verify: `
    import { resolveRequiredUserId } from "@/lib/access-control.ts";
    export class UnauthorizedError extends Error {
      constructor() {
        super("Unauthorized");
        this.name = "UnauthorizedError";
        this.status = 401;
      }
    }
    export async function getSessionUser() {
      const id = globalThis.${stateKey}.sessionUserId;
      if (!id) return null;
      return { id, email: null };
    }
    export async function requireUserId() {
      const user = await getSessionUser();
      const decided = resolveRequiredUserId({
        authConfigured: true,
        databaseConfigured: true,
        sessionUserId: user ? user.id : null,
      });
      if (!decided.ok) {
        if (decided.code === "unauthorized") throw new UnauthorizedError();
        throw new Error(decided.error);
      }
      return decided.userId;
    }
  `,
  r2: `
    export async function getR2Object(key) {
      const state = globalThis.${stateKey};
      state.fetches.push(key);
      const body = state.objects.get(key);
      if (!body) throw new Error("Object not found.");
      return { key, bytes: body.byteLength, contentType: "application/pdf", body, etag: null };
    }
  `,
  middleware: `export const authMiddleware = {};`,
};

const mockFiles = new Map(
  [
    ["src/lib/db.ts", "db"],
    ["src/lib/auth/verify.server.ts", "verify"],
    ["src/lib/auth/middleware.ts", "middleware"],
    ["src/lib/server/r2.server.ts", "r2"],
  ].map(([file, name]) => [pathToFileURL(join(root, file)).href, name]),
);

function resolveSource(specifier, parentURL) {
  let file;
  if (specifier.startsWith("@/")) file = join(root, "src", specifier.slice(2));
  else if (specifier.startsWith(".") && parentURL?.startsWith("file:")) file = fileURLToPath(new URL(specifier, parentURL));
  if (!file) return null;
  return [file, `${file}.ts`, `${file}.tsx`, `${file}.mjs`].find(existsSync) ?? null;
}

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@tanstack/react-router") return { url: `${prefix}router`, shortCircuit: true };
    if (specifier === "@tanstack/react-start") return { url: `${prefix}start`, shortCircuit: true };
    if (specifier === "@tanstack/react-start/server") return { url: `${prefix}server`, shortCircuit: true };
    const file = resolveSource(specifier, context.parentURL);
    if (!file) return nextResolve(specifier, context);
    const url = pathToFileURL(file).href;
    return { url: mockFiles.has(url) ? `${prefix}${mockFiles.get(url)}` : url, shortCircuit: true };
  },
  load(url, context, nextLoad) {
    return url.startsWith(prefix)
      ? { format: "module", source: virtual[url.slice(prefix.length)], shortCircuit: true }
      : nextLoad(url, context);
  },
});

const originalFetch = globalThis.fetch;
globalThis.fetch = (input) => {
  globalThis[stateKey]?.network.push(String(input));
  throw new Error("Network is forbidden in family document fixtures");
};

const { signTwoFactorCookie } = await import("../src/lib/two-factor-cookie.ts");
const { TWO_FACTOR_COOKIE } = await import("../src/lib/auth/cookies.ts");
const { qaSyntheticFamilyPdf } = await import("../src/lib/qa-family-file.ts");
const { blockGovernmentOnPrivateHttp, rejectGovernmentOnPrivateApi } = await import(
  "../src/lib/server/gov-guard.server.ts"
);
const { requireUserId } = await import("../src/lib/auth/verify.server.ts");
const downloadRoute = await import("../src/routes/api/family-documents.$id.ts");
const listRoute = await import("../src/routes/api/family-documents.ts");
const { listProviderFamilyDocs } = await import("../src/lib/server/provider-care.ts");

const downloadHandler = downloadRoute.Route.server.handlers.GET;
const listHandler = listRoute.Route.server.handlers.GET;
assert.equal(typeof downloadHandler, "function");
assert.equal(typeof listHandler, "function");
assert.equal(typeof listProviderFamilyDocs, "function");

const pg = new PGlite();
await pg.exec(`
  create table daycares (id text primary key, name text);
  create table "user" (id text primary key, name text);
  create table profiles (user_id text primary key, role text);
  create table provider_daycares (user_id text, daycare_id text);
  create table centre_members (
    id text primary key,
    daycare_id text,
    user_id text,
    role text,
    status text,
    permission_preset text,
    permissions jsonb
  );
  create table family_documents (
    id text primary key,
    user_id text not null,
    kind text not null,
    file_name text not null,
    mime text not null,
    byte_size integer not null,
    storage_ref text not null,
    created_at timestamptz not null default now()
  );
  create table family_document_shares (
    id text primary key,
    document_id text not null,
    daycare_id text not null,
    shared_at timestamptz not null default now(),
    revoked_at timestamptz
  );
  create table second_factor_prefs (
    user_id text primary key,
    parent_opt_in boolean not null default false,
    provider_grace_started_at timestamptz
  );
`);

function state() {
  return globalThis[stateKey];
}

function bindSql() {
  const run = async (text, values = []) => {
    const rows = (await pg.query(text, values)).rows;
    const current = state();
    if (!/storage_ref/i.test(text) || !/family_documents/i.test(text) || rows.length === 0) return rows;
    const docId = values.find((value) => typeof value === "string" && value.startsWith("fd-"));
    if (!docId) return rows;
    const seen = (current.reads.get(docId) ?? 0) + 1;
    current.reads.set(docId, seen);
    if (seen === 1) return rows;
    return rows.map((row) => ({ ...row, storage_ref: DECOY_KEY }));
  };
  const sql = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run(text, values);
  };
  sql.query = (text, values) => run(text, values ?? []);
  state().sql = sql;
}

function freshState() {
  const objects = new Map([
    [IMM_KEY, immBytes],
    [SUB_KEY, subBytes],
    [OWN_KEY, ownBytes],
    [OTHER_KEY, otherBytes],
    [REVOKED_KEY, revokedBytes],
    [DECOY_KEY, decoyBytes],
  ]);
  globalThis[stateKey] = {
    sessionUserId: null,
    cookies: {},
    request: null,
    fetches: [],
    network: [],
    reads: new Map(),
    objects,
    sql: null,
  };
  bindSql();
}

freshState();

function signIn(userId) {
  const current = state();
  current.sessionUserId = userId;
  current.cookies = {};
}

function grantEmailCode(userId) {
  state().cookies[TWO_FACTOR_COOKIE] = signTwoFactorCookie(
    userId,
    Date.now() + 60_000,
    process.env.BETTER_AUTH_SECRET,
  );
}

async function setGrace(userId, when) {
  const value =
    when === "unset"
      ? null
      : when === "open"
        ? new Date(Date.now() - 60 * 60 * 1000).toISOString()
        : new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
  await pg.query("update second_factor_prefs set provider_grace_started_at = $2 where user_id = $1", [userId, value]);
}

async function setParentOptIn(userId, enabled) {
  await pg.query("update second_factor_prefs set parent_opt_in = $2 where user_id = $1", [userId, enabled]);
}

async function dispatch(url, params) {
  const request = new Request(url, {
    headers: params
      ? { "sec-fetch-site": "same-origin", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }
      : { "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" },
  });
  state().request = request;
  const blocked = await blockGovernmentOnPrivateHttp(request);
  if (blocked) return blocked;
  if (params) return downloadHandler({ request, params });
  return listHandler({ request });
}

async function download(id) {
  state().fetches = [];
  state().network = [];
  return dispatch(`https://kidease.test/api/family-documents/${id}`, { id });
}

async function centreList() {
  const response = await dispatch("https://kidease.test/api/family-documents?desk=centre");
  assert.equal(response.status, 200, Buffer.from(await response.clone().arrayBuffer()).toString("utf8").slice(0, 300));
  const body = await response.json();
  const userId = await requireUserId();
  await rejectGovernmentOnPrivateApi(userId);
  const desk = await listProviderFamilyDocs({ context: { userId } });
  assert.equal(desk.enabled, true);
  assert.deepEqual(
    desk.documents.map((doc) => doc.documentId).sort(),
    body.documents.map((doc) => doc.documentId).sort(),
  );
  return body.documents;
}

async function bodyOf(response) {
  return Buffer.from(await response.arrayBuffer());
}

async function assertDenied(response, status) {
  const bytes = await bodyOf(response);
  assert.equal(response.status, status, bytes.toString("utf8").slice(0, 400));
  assert.deepEqual(state().fetches, []);
  assert.deepEqual(state().network, []);
  for (const file of state().objects.values()) assert.equal(bytes.equals(file), false);
  assert.equal(bytes.includes(Buffer.from("KidEase test file.")), false);
  assert.equal(bytes.equals(dataBytes), false);
  assert.equal(bytes.equals(qaSyntheticFamilyPdf()), false);
}

async function assertPdf(response, bytes, fetchedKey) {
  const actual = await bodyOf(response);
  assert.equal(response.status, 200, actual.toString("utf8").slice(0, 400));
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.match(response.headers.get("content-disposition") || "", /^attachment;/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(actual, bytes);
  assert.deepEqual(state().fetches, fetchedKey ? [fetchedKey] : []);
  assert.notDeepEqual(actual, decoyBytes);
  assert.deepEqual(state().network, []);
}

const expired = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();

beforeEach(async () => {
  freshState();
  process.env.FEATURE_FAMILY_VAULT = "1";
  await pg.exec(`
    truncate second_factor_prefs, provider_daycares, centre_members, family_document_shares,
      family_documents, profiles, "user", daycares;
  `);
  await pg.query(
    `insert into daycares (id, name) values ('centre-a', 'Centre A'), ('centre-b', 'Centre B')`,
  );
  await pg.query(
    `insert into "user" (id, name) values ('parent-a', 'Parent A'), ('parent-b', 'Parent B'),
      ('staff-docs', 'Staff Docs'), ('staff-none', 'Staff None'), ('staff-kids', 'Staff Kids'),
      ('staff-read', 'Staff Read'), ('staff-b', 'Staff B'), ('staff-revoked', 'Staff Revoked'),
      ('owner-a', 'Owner A'), ('manager-a', 'Manager A')`,
  );
  const profiles = [
    ["parent-a", "parent"],
    ["parent-b", "parent"],
    ["staff-docs", "provider"],
    ["staff-none", "provider"],
    ["staff-kids", "provider"],
    ["staff-read", "provider"],
    ["staff-b", "provider"],
    ["staff-revoked", "provider"],
    ["owner-a", "provider"],
    ["manager-a", "provider"],
  ];
  for (const [userId, role] of profiles) {
    await pg.query("insert into profiles (user_id, role) values ($1, $2)", [userId, role]);
    await pg.query(
      "insert into second_factor_prefs (user_id, parent_opt_in, provider_grace_started_at) values ($1, false, $2)",
      [userId, expired],
    );
  }
  await pg.query("insert into provider_daycares (user_id, daycare_id) values ('owner-a', 'centre-a')");
  const members = [
    ["cm-docs", "centre-a", "staff-docs", "staff", "staff", null],
    ["cm-none", "centre-a", "staff-none", "staff", "custom", JSON.stringify({ documents: "none", children: "none" })],
    ["cm-kids", "centre-a", "staff-kids", "staff", "custom", JSON.stringify({ documents: "none", children: "view" })],
    ["cm-read", "centre-a", "staff-read", "read_only", null, null],
    ["cm-b", "centre-b", "staff-b", "staff", "staff", null],
    ["cm-revoked", "centre-a", "staff-revoked", "staff", "staff", null],
    ["cm-manager", "centre-a", "manager-a", "manager", "manager", null],
  ];
  for (const [id, daycareId, userId, role, preset, permissions] of members) {
    await pg.query(
      `insert into centre_members (id, daycare_id, user_id, role, status, permission_preset, permissions)
       values ($1, $2, $3, $4, 'active', $5, $6::jsonb)`,
      [id, daycareId, userId, role, preset, permissions],
    );
  }
  await pg.query("update centre_members set status = 'revoked' where user_id = 'staff-revoked'");
  const docs = [
    ["fd-imm", "parent-a", "immunization", "immunization.pdf", IMM_KEY, immBytes.byteLength],
    ["fd-sub", "parent-a", "subsidy", "subsidy.pdf", SUB_KEY, subBytes.byteLength],
    ["fd-own", "staff-docs", "immunization", "own.pdf", OWN_KEY, ownBytes.byteLength],
    ["fd-other", "parent-b", "immunization", "other.pdf", OTHER_KEY, otherBytes.byteLength],
    ["fd-revoked", "parent-a", "immunization", "revoked.pdf", REVOKED_KEY, revokedBytes.byteLength],
    ["fd-qa", "parent-a", "immunization", "qa.pdf", "qa-synthetic/fd-qa", 0],
    ["fd-data", "parent-a", "subsidy", "data.pdf", DATA_REF, dataBytes.byteLength],
  ];
  for (const [id, userId, kind, fileName, storageRef, size] of docs) {
    await pg.query(
      `insert into family_documents (id, user_id, kind, file_name, mime, byte_size, storage_ref)
       values ($1, $2, $3, $4, 'application/pdf', $5, $6)`,
      [id, userId, kind, fileName, size, storageRef],
    );
  }
  const shares = [
    ["fs-imm", "fd-imm", "centre-a", null],
    ["fs-sub", "fd-sub", "centre-a", null],
    ["fs-other", "fd-other", "centre-b", null],
    ["fs-revoked", "fd-revoked", "centre-a", expired],
    ["fs-qa", "fd-qa", "centre-a", null],
    ["fs-data", "fd-data", "centre-a", null],
  ];
  for (const [id, documentId, daycareId, revokedAt] of shares) {
    await pg.query(
      `insert into family_document_shares (id, document_id, daycare_id, revoked_at) values ($1, $2, $3, $4)`,
      [id, documentId, daycareId, revokedAt],
    );
  }
});

after(async () => {
  await pg.close();
  hooks.deregister();
  delete globalThis[stateKey];
  globalThis.fetch = originalFetch;
});

describe("family document downloads", { concurrency: false }, () => {
  test("staff past the grace period, with no email code, cannot download a shared immunization or subsidy file", async () => {
    signIn("staff-docs");
    const documents = await centreList();
    const shared = documents.filter((doc) => doc.documentId === "fd-imm" || doc.documentId === "fd-sub");
    assert.deepEqual(shared.map((doc) => doc.kind).sort(), ["immunization", "subsidy"]);
    for (const doc of shared) await assertDenied(await download(doc.documentId), 401);
    await assertDenied(await download("fd-qa"), 401);
    await assertDenied(await download("fd-data"), 401);
  });

  test("the same staff member can download during the grace period, and only the requested file", async () => {
    signIn("staff-docs");
    await setGrace("staff-docs", "open");
    const documents = await centreList();
    const immunization = documents.find((doc) => doc.documentId === "fd-imm");
    assert.equal(immunization.kind, "immunization");
    await assertPdf(await download(immunization.documentId), immBytes, IMM_KEY);
    await assertPdf(await download("fd-sub"), subBytes, SUB_KEY);
  });

  test("an email code for that staff member allows the shared file after the grace period", async () => {
    signIn("staff-docs");
    grantEmailCode("staff-docs");
    await assertPdf(await download("fd-imm"), immBytes, IMM_KEY);
    await assertPdf(await download("fd-qa"), qaSyntheticFamilyPdf(), null);
    await assertPdf(await download("fd-data"), dataBytes, null);
  });

  test("another person's email code, or a code signed with the wrong secret, does not unlock the file", async () => {
    signIn("staff-docs");
    grantEmailCode("parent-a");
    await assertDenied(await download("fd-imm"), 401);
    state().cookies[TWO_FACTOR_COOKIE] = signTwoFactorCookie(
      "staff-docs",
      Date.now() + 60_000,
      "placeholder-wrong-secret",
    );
    await assertDenied(await download("fd-sub"), 401);
  });

  test("a staff login with no documents permission cannot download, even with an email code", async () => {
    for (const userId of ["staff-none", "staff-kids"]) {
      freshState();
      signIn(userId);
      grantEmailCode(userId);
      await setGrace(userId, "open");
      const documents = await centreList();
      assert.ok(documents.some((doc) => doc.documentId === "fd-imm"));
      await assertDenied(await download("fd-imm"), 403);
      await assertDenied(await download("fd-data"), 403);
    }
  });

  test("a read-only login cannot download a shared family file", async () => {
    signIn("staff-read");
    grantEmailCode("staff-read");
    await assertDenied(await download("fd-imm"), 403);
  });

  test("a centre owner or manager with an email code can download, and an owner past the grace period cannot", async () => {
    signIn("owner-a");
    await assertDenied(await download("fd-imm"), 401);
    grantEmailCode("owner-a");
    freshReads();
    await assertPdf(await download("fd-imm"), immBytes, IMM_KEY);
    signIn("manager-a");
    grantEmailCode("manager-a");
    await assertPdf(await download("fd-sub"), subBytes, SUB_KEY);
  });

  test("a staff member still opens their own file under the parent rule", async () => {
    signIn("staff-docs");
    await assertPdf(await download("fd-own"), ownBytes, OWN_KEY);
    await assertDenied(await download("fd-imm"), 401);
    await setParentOptIn("staff-docs", true);
    freshReads();
    await assertDenied(await download("fd-own"), 401);
    grantEmailCode("staff-docs");
    freshReads();
    await assertPdf(await download("fd-own"), ownBytes, OWN_KEY);
    await assertPdf(await download("fd-imm"), immBytes, IMM_KEY);
  });

  test("a share the staff member cannot open is not returned", async () => {
    for (const [userId, id] of [
      ["staff-b", "fd-imm"],
      ["staff-revoked", "fd-imm"],
      ["staff-docs", "fd-revoked"],
      ["staff-docs", "fd-other"],
      ["parent-b", "fd-imm"],
    ]) {
      signIn(userId);
      grantEmailCode(userId);
      await assertDenied(await download(id), 404);
    }
  });

  test("a signed-out request and a turned-off vault do not return the file", async () => {
    signIn(null);
    state().sessionUserId = null;
    await assertDenied(await download("fd-imm"), 401);
    signIn("staff-docs");
    grantEmailCode("staff-docs");
    process.env.FEATURE_FAMILY_VAULT = "0";
    await assertDenied(await download("fd-imm"), 404);
  });
});

function freshReads() {
  state().reads = new Map();
}
