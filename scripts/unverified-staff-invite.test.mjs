import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { after, beforeEach, describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { hashPassword } from "better-auth/crypto";
import { emailAndPasswordConfig, emailVerificationConfig } from "../src/lib/auth/email-password.ts";
import { resolveRequiredUserId } from "../src/lib/access-control.ts";

// Pending staff invites are claimed by mailbox string. These tests run that
// claim, the list/accept server functions, the emailed-token accept, and an
// account email change against in-memory Postgres. Better Auth sign-up uses
// the app's email/password config and its own memory adapter. No network.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stateKey = "__unverifiedStaffInviteTest";
const prefix = "unverified-staff-invite:";
const hireEmail = "new.hire@example.test";
const hireStored = "New.Hire@Example.test";
const outsiderEmail = "outsider@example.test";
const attackerId = "user-attacker";
const otherId = "user-other";
const parentId = "user-parent";
const daycareId = "daycare-synthetic";
const childId = "child-synthetic";
const allergy = "synthetic-peanut";
const placeholderPassword = "placeholder-password";
const placeholderInviteToken = "placeholder-invite-token";

const virtual = {
  serverFn: `
    export function createServerFn() {
      let validate = (value) => value;
      const builder = {
        middleware() { return builder; },
        validator(fn) { validate = fn; return builder; },
        handler(fn) {
          return async (input = {}) => fn({
            context: { userId: globalThis.${stateKey}.userId },
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
    export function setCookie(name, value) { globalThis.${stateKey}.jar.set(name, String(value)); }
    export function getCookie(name) { return globalThis.${stateKey}.jar.get(name); }
    export function setResponseHeader() {}
    export function getRequest() {
      const cookie = [...globalThis.${stateKey}.jar.entries()].map(([name, value]) => name + "=" + value).join("; ");
      return { headers: { get(header) { return header === "cookie" ? cookie : null; } } };
    }
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

const {
  claimPendingCentreInvitesForUser,
  listMyStaffInvites,
  acceptMyStaffInvite,
  acceptCentreInvite,
} = await import("../src/lib/server/centre-members.ts");
const { listChildHealthLog } = await import("../src/lib/server/child-health-log.ts");
const { changeAccountEmail } = await import("../src/lib/server/account-security.ts");

const pg = new PGlite();
await pg.exec(`
  create table "user" (
    id text primary key,
    name text not null,
    email text not null unique,
    "emailVerified" boolean not null,
    "createdAt" timestamptz not null default now(),
    "updatedAt" timestamptz not null default now()
  );
  create table "account" (
    id text primary key,
    "accountId" text not null,
    "providerId" text not null,
    "userId" text not null,
    password text,
    "createdAt" timestamptz not null default now(),
    "updatedAt" timestamptz not null default now()
  );
  create table profiles (
    user_id text primary key,
    role text,
    display_name text,
    phone text,
    city text
  );
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
  create table children (
    id text primary key,
    user_id text not null,
    name text not null,
    immunization_status text,
    immunization_note text,
    allergies text,
    medications text
  );
  create table bookings (
    id text primary key,
    user_id text not null,
    daycare_id text not null,
    child_id text,
    status text not null
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

function runQuery(text, values = []) {
  if (state().demoteBeforeInviteClaim && /update\s+centre_invites/i.test(text)) {
    state().demoteBeforeInviteClaim = false;
    return pg
      .query(`update "user" set "emailVerified" = false where id = $1`, [state().userId])
      .then(() => pg.query(text, values))
      .then((result) => result.rows);
  }
  if (state().demoteBeforeInviteRead && /from\s+centre_invites/i.test(text)) {
    state().demoteBeforeInviteRead = false;
    return pg
      .query(`update "user" set "emailVerified" = false where id = $1`, [state().userId])
      .then(() => pg.query(text, values))
      .then((result) => result.rows);
  }
  return pg.query(text, values).then((result) => result.rows);
}

after(async () => {
  await pg.close();
  hooks.deregister();
  delete globalThis[stateKey];
});

beforeEach(async () => {
  await pg.exec(`
    truncate "user", "account", profiles, daycares, provider_daycares, centre_members, centre_invites, children, bookings, security_events;
  `);
  await pg.query(
    `insert into "user" (id, name, email, "emailVerified") values
      ($1, 'Synthetic attacker', $2, false),
      ($3, 'Synthetic other', $4, true),
      ($5, 'Synthetic parent', 'parent@example.test', true)`,
    [attackerId, hireEmail, otherId, outsiderEmail, parentId],
  );
  await pg.query(`insert into daycares (id, name) values ($1, 'Synthetic Centre')`, [daycareId]);
  await pg.query(
    `insert into children (id, user_id, name, allergies, immunization_note, medications) values ($1, $2, 'Synthetic Child', $3, '', '')`,
    [childId, parentId, allergy],
  );
  await pg.query(
    `insert into bookings (id, user_id, daycare_id, child_id, status) values ($1, $2, $3, $4, 'active')`,
    ["booking-synthetic", parentId, daycareId, childId],
  );
  const sql = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return runQuery(text, values);
  };
  sql.query = (text, values = []) => runQuery(text, values);
  globalThis[stateKey] = {
    userId: attackerId,
    demoteBeforeInviteRead: false,
    demoteBeforeInviteClaim: false,
    jar: new Map(),
    sql,
  };
});

function inviteTokenHash(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function insertInvite(id, role = "staff", token = `${id}-token`) {
  await pg.query(
    `insert into centre_invites (
      id, daycare_id, email, name, role, token_hash, status, invited_by, expires_at, permission_preset
    ) values ($1, $2, $3, 'New hire', $4, $5, 'pending', $6, now() + interval '7 days', $4)`,
    [id, daycareId, hireStored, role, inviteTokenHash(token), otherId],
  );
  return token;
}

async function membership() {
  return pg.query(
    `select user_id, role, status from centre_members where daycare_id = $1 order by user_id`,
    [daycareId],
  );
}

async function inviteRow(id) {
  const result = await pg.query(
    `select status, accepted_user_id from centre_invites where id = $1`,
    [id],
  );
  return result.rows[0];
}

async function healthNotes() {
  return listChildHealthLog();
}

test("email/password sign-up issues a session before the mailbox is verified", async () => {
  assert.equal(Object.hasOwn(emailAndPasswordConfig, "requireEmailVerification"), false);
  assert.notEqual(emailAndPasswordConfig.autoSignIn, false);
  assert.equal(emailVerificationConfig.sendOnSignUp, true);
  const memory = { user: [], session: [], account: [], verification: [] };
  const auth = betterAuth({
    secret: "placeholder-signup-secret",
    baseURL: "http://127.0.0.1:9",
    database: memoryAdapter(memory),
    emailAndPassword: { ...emailAndPasswordConfig },
    emailVerification: {
      sendOnSignUp: emailVerificationConfig.sendOnSignUp,
      autoSignInAfterVerification: emailVerificationConfig.autoSignInAfterVerification,
      expiresIn: emailVerificationConfig.expiresIn,
      sendVerificationEmail: async () => {},
      afterEmailVerification: emailVerificationConfig.afterEmailVerification,
    },
    logger: { disabled: true },
  });
  const signedUp = await auth.api.signUpEmail({
    body: { name: "Synthetic attacker", email: hireEmail, password: placeholderPassword },
    headers: new Headers(),
  });
  assert.equal(signedUp.user.email, hireEmail);
  assert.equal(signedUp.user.emailVerified, false);
  assert.equal(typeof signedUp.token, "string");
  assert.equal(signedUp.token.length > 0, true);
  assert.equal(memory.user.length, 1);
  assert.equal(memory.user[0].email, hireEmail);
  assert.equal(memory.user[0].emailVerified, false);
  assert.equal(memory.session.length, 1);
  assert.equal(memory.session[0].userId, signedUp.user.id);
  assert.equal(memory.session[0].token, signedUp.token);
  const required = resolveRequiredUserId({
    authConfigured: true,
    databaseConfigured: true,
    sessionUserId: signedUp.user.id,
  });
  assert.equal(required.ok, true);
  if (required.ok) assert.equal(required.userId, signedUp.user.id);
});

describe("unverified mailbox must not take a staff invite", { concurrency: false }, () => {
  test("list and accept hide and refuse a pending invite for an unverified mailbox", async () => {
    await insertInvite("inv-staff");
    assert.deepEqual(await listMyStaffInvites(), { invites: [] });
    await assert.rejects(acceptMyStaffInvite({ data: { id: "inv-staff" } }));
    assert.deepEqual((await membership()).rows, []);
    assert.deepEqual(await inviteRow("inv-staff"), { status: "pending", accepted_user_id: null });
    assert.deepEqual((await healthNotes()).rows, []);
  });

  test("claim by email does not insert or reactivate a member when the mailbox is unverified", async () => {
    await insertInvite("inv-direct");
    await pg.query(
      `insert into centre_members (id, daycare_id, user_id, role, status, revoked_at) values
        ('cm-revoked', $1, $2, 'read_only', 'revoked', now())`,
      [daycareId, attackerId],
    );
    const open = await claimPendingCentreInvitesForUser(state().sql, attackerId, hireStored);
    assert.equal(open.claimed, 0);
    const one = await claimPendingCentreInvitesForUser(
      state().sql,
      attackerId,
      hireStored,
      "inv-direct",
    );
    assert.equal(one.claimed, 0);
    assert.deepEqual((await membership()).rows, [
      { user_id: attackerId, role: "read_only", status: "revoked" },
    ]);
    assert.deepEqual(await inviteRow("inv-direct"), { status: "pending", accepted_user_id: null });
    assert.deepEqual((await healthNotes()).rows, []);
  });

  test("accept checks verification again after loading the invite", async () => {
    await insertInvite("inv-race");
    await pg.query(`update "user" set "emailVerified" = true where id = $1`, [attackerId]);
    state().demoteBeforeInviteRead = true;
    let rejected = false;
    try {
      await acceptMyStaffInvite({ data: { id: "inv-race" } });
    } catch {
      rejected = true;
    }
    const user = await pg.query(`select "emailVerified" from "user" where id = $1`, [attackerId]);
    assert.equal(user.rows[0].emailVerified, false);
    assert.equal(state().demoteBeforeInviteRead, false);
    assert.deepEqual((await membership()).rows, []);
    assert.deepEqual(await inviteRow("inv-race"), { status: "pending", accepted_user_id: null });
    assert.deepEqual((await healthNotes()).rows, []);
    assert.equal(rejected, true);
  });

  test("the claim itself rechecks verification after the invite was listed", async () => {
    await insertInvite("inv-gap");
    await pg.query(`update "user" set "emailVerified" = true where id = $1`, [attackerId]);
    state().demoteBeforeInviteClaim = true;
    await assert.rejects(acceptMyStaffInvite({ data: { id: "inv-gap" } }));
    assert.equal(state().demoteBeforeInviteClaim, false);
    assert.deepEqual((await membership()).rows, []);
    assert.deepEqual(await inviteRow("inv-gap"), { status: "pending", accepted_user_id: null });
    assert.deepEqual((await healthNotes()).rows, []);
  });

  test("a verified account cannot claim an invite for a different mailbox", async () => {
    await insertInvite("inv-other");
    state().userId = otherId;
    const claimed = await claimPendingCentreInvitesForUser(
      state().sql,
      otherId,
      hireEmail,
      "inv-other",
    );
    assert.equal(claimed.claimed, 0);
    assert.deepEqual(await listMyStaffInvites(), { invites: [] });
    await assert.rejects(acceptMyStaffInvite({ data: { id: "inv-other" } }));
    assert.deepEqual((await membership()).rows, []);
    assert.deepEqual(await inviteRow("inv-other"), { status: "pending", accepted_user_id: null });
  });

  test("changing the account email does not make a pending invite claimable", async () => {
    await insertInvite("inv-changed");
    await pg.query(
      `update "user" set email = 'prior@example.test', "emailVerified" = true where id = $1`,
      [attackerId],
    );
    const hash = await hashPassword(placeholderPassword);
    await pg.query(
      `insert into "account" (id, "accountId", "providerId", "userId", password) values ('acct-attacker', $1, 'credential', $1, $2)`,
      [attackerId, hash],
    );
    const changed = await changeAccountEmail({
      data: { newEmail: hireEmail, currentPassword: placeholderPassword },
    });
    assert.equal(changed.ok, true);
    const user = await pg.query(`select email, "emailVerified" from "user" where id = $1`, [
      attackerId,
    ]);
    if (user.rows[0].email === hireEmail) assert.equal(user.rows[0].emailVerified, false);
    assert.deepEqual(await listMyStaffInvites(), { invites: [] });
    await assert.rejects(acceptMyStaffInvite({ data: { id: "inv-changed" } }));
    assert.deepEqual((await membership()).rows, []);
    assert.deepEqual(await inviteRow("inv-changed"), { status: "pending", accepted_user_id: null });
    assert.deepEqual((await healthNotes()).rows, []);
  });

  test("the emailed invite token still accepts for the matching mailbox", async () => {
    const token = await insertInvite("inv-token", "staff", placeholderInviteToken);
    // Since #1041 the token path also needs a confirmed mailbox: an unverified
    // session is told to confirm first, and nothing is granted.
    await assert.rejects(acceptCentreInvite({ data: token }), /confirm the email/i);
    assert.deepEqual((await membership()).rows, []);
    assert.deepEqual(await inviteRow("inv-token"), { status: "pending", accepted_user_id: null });
    await pg.query(`update "user" set "emailVerified" = true where id = $1`, [attackerId]);
    const accepted = await acceptCentreInvite({ data: token });
    assert.equal(accepted.ok, true);
    assert.equal(accepted.daycareId, daycareId);
    assert.deepEqual((await membership()).rows, [
      { user_id: attackerId, role: "staff", status: "active" },
    ]);
    assert.equal((await inviteRow("inv-token")).status, "accepted");
  });

  test("a verified mailbox can accept and then read the enrolled child's notes", async () => {
    await insertInvite("inv-verified");
    await pg.query(`update "user" set "emailVerified" = true where id = $1`, [attackerId]);
    const listed = await listMyStaffInvites();
    assert.deepEqual(listed.invites, [
      { id: "inv-verified", centre: "Synthetic Centre", role: "staff" },
    ]);
    const accepted = await acceptMyStaffInvite({ data: { id: "inv-verified" } });
    assert.equal(accepted.ok, true);
    assert.deepEqual((await membership()).rows, [
      { user_id: attackerId, role: "staff", status: "active" },
    ]);
    assert.equal((await inviteRow("inv-verified")).accepted_user_id, attackerId);
    const notes = await healthNotes();
    assert.equal(notes.rows.length, 1);
    assert.equal(notes.rows[0].id, childId);
    assert.equal(notes.rows[0].allergies, allergy);
  });
});
