import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";

// The emailed staff-invite link (acceptCentreInvite) must take the invite in
// one conditional update and grant membership only from the row it returns.
// Double, concurrent, expired, revoked, already-accepted, and second-account
// accepts grant nothing. In-memory Postgres; no network, no mail.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stateKey = "__staffInviteTokenAtomicTest";
const prefix = "staff-invite-token-atomic:";
const hireEmail = "new.hire@example.test";
const hireId = "user-hire";
const otherId = "user-other";
const ownerId = "user-owner";
const daycareId = "daycare-synthetic";
const token = "placeholder-invite-token";

const virtual = {
  serverFn: `
    export function createServerFn() {
      let validate = (value) => value;
      const builder = {
        middleware() { return builder; },
        validator(fn) { validate = fn; return builder; },
        handler(fn) {
          return async (input = {}) => fn({
            context: { userId: input.userId ?? globalThis.${stateKey}.userId },
            data: validate(input.data),
          });
        },
      };
      return builder;
    }
    export const createServerOnlyFn = (fn) => fn;
    export const createMiddleware = () => ({ server(fn) { return fn; } });
  `,
  middleware: `
    export const authMiddleware = {};
    export const secondFactorMiddleware = {};
    export const sessionBearerMiddleware = {};
    export const govAuthMiddleware = {};
  `,
  db: `export const getSql = async () => globalThis.${stateKey}.sql;`,
  request: `
    export function setCookie() {}
    export function getCookie() { return undefined; }
    export function setResponseHeader() {}
    export function getRequest() { return { headers: { get() { return null; } } }; }
  `,
};
const mockFiles = new Map(
  [
    ["src/lib/db.ts", "db"],
    ["src/lib/auth/middleware.ts", "middleware"],
  ].map(([file, name]) => [pathToFileURL(join(root, file)).href, name]),
);
function resolveSource(specifier, parentURL) {
  let file;
  if (specifier.startsWith("@/")) file = join(root, "src", specifier.slice(2));
  else if (specifier.startsWith(".") && parentURL?.startsWith("file:"))
    file = fileURLToPath(new URL(specifier, parentURL));
  if (!file) return null;
  return [file, `${file}.ts`, `${file}.tsx`, `${file}.mjs`].find(existsSync) ?? null;
}
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@tanstack/react-start")
      return { url: `${prefix}serverFn`, shortCircuit: true };
    if (specifier === "@tanstack/react-start/server")
      return { url: `${prefix}request`, shortCircuit: true };
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

const { acceptCentreInvite } = await import("../src/lib/server/centre-members.ts");

const pg = new PGlite();
await pg.exec(`
  create table "user" (
    id text primary key,
    name text not null,
    email text not null unique,
    "emailVerified" boolean not null
  );
  create table profiles (user_id text primary key, role text, display_name text, phone text, city text);
  create table daycares (id text primary key, name text not null);
  create table provider_daycares (user_id text, daycare_id text);
  create table centre_members (
    id text primary key,
    daycare_id text not null,
    user_id text not null,
    role text not null,
    status text not null,
    invited_by text,
    created_at timestamptz not null default now(),
    revoked_at timestamptz,
    revoked_by text,
    permission_preset text,
    permissions jsonb
  );
  create table centre_invites (
    id text primary key,
    daycare_id text not null,
    email text not null,
    name text,
    role text not null,
    token_hash text not null,
    status text not null,
    invited_by text,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    accepted_at timestamptz,
    accepted_user_id text,
    permission_preset text
  );
  create table security_events (
    id text primary key,
    at timestamptz not null default now(),
    kind text not null,
    actor_user_id text,
    target_user_id text,
    daycare_id text,
    ip text,
    detail text
  );
`);

function state() {
  return globalThis[stateKey];
}

// A test can run one statement right before the invite update, to model a
// revoke or expiry that lands between the read and the write.
async function runQuery(text, values = []) {
  const hook = state().beforeInviteUpdate;
  if (hook && /update\s+centre_invites/i.test(text)) {
    state().beforeInviteUpdate = null;
    await pg.query(hook);
  }
  return (await pg.query(text, values)).rows;
}

after(async () => {
  await pg.close();
  hooks.deregister();
  delete globalThis[stateKey];
});

beforeEach(async () => {
  await pg.exec(`truncate "user", profiles, daycares, provider_daycares, centre_members, centre_invites, security_events;`);
  await pg.query(
    `insert into "user" (id, name, email, "emailVerified") values
      ($1, '', $2, true),
      ($3, 'Other person', 'other@example.test', true),
      ($4, 'Owner', 'owner@example.test', true)`,
    [hireId, hireEmail, otherId, ownerId],
  );
  await pg.query(`insert into daycares (id, name) values ($1, 'Synthetic Centre')`, [daycareId]);
  const sql = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return runQuery(text, values);
  };
  sql.query = (text, values = []) => runQuery(text, values);
  globalThis[stateKey] = { userId: hireId, beforeInviteUpdate: null, sql };
});

function tokenHash(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function insertInvite({ status = "pending", expires = "now() + interval '7 days'", role = "staff" } = {}) {
  await pg.query(
    `insert into centre_invites (
      id, daycare_id, email, name, role, token_hash, status, invited_by, expires_at, permission_preset
    ) values ('invite-1', $1, 'New.Hire@Example.test', 'New Hire', $2, $3, $4, $5, ${expires}, $2)`,
    [daycareId, role, tokenHash(token), status, ownerId],
  );
}

async function members() {
  return (
    await pg.query(
      `select user_id, role, status from centre_members where daycare_id = $1 order by user_id`,
      [daycareId],
    )
  ).rows;
}

async function invite() {
  return (await pg.query(`select status, accepted_user_id from centre_invites where id = 'invite-1'`)).rows[0];
}

async function acceptEvents() {
  return (await pg.query(`select actor_user_id from security_events where kind = 'employee_accept'`)).rows;
}

test("a verified new hire accepts the emailed link once and joins with the invited role", async () => {
  await insertInvite({ role: "manager" });
  const result = await acceptCentreInvite({ data: token });
  assert.deepEqual(result, { ok: true, daycareId });
  assert.deepEqual(await members(), [{ user_id: hireId, role: "manager", status: "active" }]);
  assert.deepEqual(await invite(), { status: "accepted", accepted_user_id: hireId });
  assert.equal((await acceptEvents()).length, 1);
  const named = await pg.query(`select name from "user" where id = $1`, [hireId]);
  assert.equal(named.rows[0].name, "New Hire");
});

test("a second accept of the same link grants nothing more", async () => {
  await insertInvite();
  await acceptCentreInvite({ data: token });
  await assert.rejects(acceptCentreInvite({ data: token }), /no longer valid/);
  assert.equal((await members()).length, 1);
  assert.equal((await acceptEvents()).length, 1);
});

test("two accepts at the same time grant one membership", async () => {
  await insertInvite();
  const results = await Promise.allSettled([
    acceptCentreInvite({ data: token }),
    acceptCentreInvite({ data: token }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  assert.deepEqual(await members(), [{ user_id: hireId, role: "staff", status: "active" }]);
  assert.equal((await acceptEvents()).length, 1);
});

test("an expired link grants nothing", async () => {
  await insertInvite({ expires: "now() - interval '1 minute'" });
  await assert.rejects(acceptCentreInvite({ data: token }), /no longer valid/);
  assert.deepEqual(await members(), []);
  assert.equal((await invite()).status, "pending");
});

test("a revoked link grants nothing", async () => {
  await insertInvite({ status: "revoked" });
  await assert.rejects(acceptCentreInvite({ data: token }), /no longer valid/);
  assert.deepEqual(await members(), []);
});

test("an already-accepted link does not reactivate a revoked membership", async () => {
  await insertInvite({ status: "accepted" });
  await pg.query(
    `insert into centre_members (id, daycare_id, user_id, role, status, revoked_by)
     values ('cm-old', $1, $2, 'manager', 'revoked', $3)`,
    [daycareId, hireId, ownerId],
  );
  await assert.rejects(acceptCentreInvite({ data: token }), /no longer valid/);
  assert.deepEqual(await members(), [{ user_id: hireId, role: "manager", status: "revoked" }]);
});

test("a second account cannot reuse the link, before or after the hire accepts", async () => {
  await insertInvite();
  await assert.rejects(acceptCentreInvite({ data: token, userId: otherId }), /sent to/);
  assert.deepEqual(await members(), []);
  await acceptCentreInvite({ data: token });
  await assert.rejects(acceptCentreInvite({ data: token, userId: otherId }), /no longer valid/);
  assert.deepEqual(await members(), [{ user_id: hireId, role: "staff", status: "active" }]);
});

test("a revoke that lands between the read and the update grants nothing", async () => {
  await insertInvite();
  state().beforeInviteUpdate = `update centre_invites set status = 'revoked' where id = 'invite-1'`;
  await assert.rejects(acceptCentreInvite({ data: token }), /no longer valid/);
  assert.deepEqual(await members(), []);
  assert.equal((await invite()).status, "revoked");
  assert.equal((await acceptEvents()).length, 0);
});

test("an expiry that lands between the read and the update grants nothing", async () => {
  await insertInvite();
  state().beforeInviteUpdate = `update centre_invites set expires_at = now() - interval '1 second' where id = 'invite-1'`;
  await assert.rejects(acceptCentreInvite({ data: token }), /no longer valid/);
  assert.deepEqual(await members(), []);
  assert.equal((await invite()).status, "pending");
});

test("losing email verification between the read and the update grants nothing", async () => {
  await insertInvite();
  state().beforeInviteUpdate = `update "user" set "emailVerified" = false where id = '${hireId}'`;
  await assert.rejects(acceptCentreInvite({ data: token }), /no longer valid/);
  assert.deepEqual(await members(), []);
  assert.equal((await invite()).status, "pending");
});

test("an unverified mailbox still cannot accept the link (current main behaviour since #1041)", async () => {
  await insertInvite();
  await pg.query(`update "user" set "emailVerified" = false where id = $1`, [hireId]);
  await assert.rejects(acceptCentreInvite({ data: token }), /Confirm the email/);
  assert.deepEqual(await members(), []);
  assert.equal((await invite()).status, "pending");
});
