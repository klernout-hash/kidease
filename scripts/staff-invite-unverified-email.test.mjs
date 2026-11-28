import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";
import { after, beforeEach, test } from "node:test";

/**
 * Staff invite acceptance must not turn an email match into a centre membership
 * unless that same user row is email-verified for that same address.
 * Sessions, SQL, and mail are fixture boundaries. The invite handlers,
 * role lookup, staff grants, and family-file check are the real modules.
 */
const key = "__kideaseStaffInviteEmailFixture";
const scheme = "kidease-staff-invite-email:";
const USER = "user-attacker";
const INVITE_EMAIL = "director@centre.test";
const OTHER_EMAIL = "attacker@owned.test";
const CENTRE = "centre-1";
const OTHER_CENTRE = "centre-2";
const TOKEN = "staff-invite-token-placeholder";
const DOC = "doc-family-1";

const mocks = {
  "@tanstack/react-start": `
    export function createServerFn() {
      let validate = (value) => value;
      let guarded = false;
      return {
        middleware(guards) {
          guarded = Array.isArray(guards) && guards.includes("fixture-session");
          return this;
        },
        validator(fn) { validate = fn; return this; },
        handler(fn) {
          return async (input = {}) => {
            const userId = globalThis.${key}.userId;
            if (guarded && !userId) throw Error("Unauthorized");
            return fn({ data: validate(input.data), context: { userId } });
          };
        },
      };
    }
    export function createServerOnlyFn(fn) { return fn; }
  `,
  "@/lib/auth/middleware": 'export const authMiddleware = "fixture-session";',
  "@/lib/db": `export const getSql = async () => globalThis.${key}.sql;`,
  "@/lib/utils": `
    export function nid(prefix = "id") {
      const state = globalThis.${key};
      state.ids += 1;
      return prefix + "_" + state.ids.toString(36);
    }
  `,
  "@/lib/server/notify": `
    export async function lookupUser(userId) {
      const { getSql } = await import("@/lib/db");
      const sql = await getSql();
      const rows = await sql.query(
        'select email, name, "emailVerified" from "user" where id = $1 limit 1',
        [userId],
      ).catch(() => []);
      const profiles = await sql.query(
        "select display_name, phone, city from profiles where user_id = $1 limit 1",
        [userId],
      ).catch(() => []);
      const accounts = await sql.query(
        'select "providerId" from "account" where "userId" = $1',
        [userId],
      ).catch(() => []);
      const display = (profiles[0]?.display_name || "").trim();
      const authName = (rows[0]?.name || "").trim();
      return {
        email: rows[0]?.email ?? null,
        name: display || authName || null,
        emailVerified: Boolean(rows[0]?.emailVerified),
        phone: profiles[0]?.phone?.trim() || null,
        city: profiles[0]?.city?.trim() || null,
        authMethods: accounts.map((row) => row.providerId).filter(Boolean),
      };
    }
  `,
  "@/lib/server/invite-mail": `
    export function employeeInviteUrl(token) {
      return "https://example.invalid/invite/" + encodeURIComponent(token);
    }
    export async function trySendEmployeeInviteEmail() {
      return { mailed: false, suppressed: false };
    }
  `,
  "@/lib/server/roles": `
    export async function resolveAdminAccess() {
      return { ok: false };
    }
  `,
};

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (Object.hasOwn(mocks, specifier)) return { url: scheme + specifier, shortCircuit: true };
    if (specifier.startsWith("@/")) {
      return next(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(scheme)) {
      return { format: "module", source: mocks[url.slice(scheme.length)], shortCircuit: true };
    }
    return next(url, context);
  },
});

const {
  acceptCentreInvite,
  acceptMyStaffInvite,
  claimPendingCentreInvitesForUser,
  listMyStaffInvites,
} = await import("../src/lib/server/centre-members.ts");
const { explainStaffArea, loadCentreRole } = await import("../src/lib/server/centre-access.ts");
const { loadFamilyDocumentFor } = await import("../src/lib/server/family-vault.ts");

function tokenHash(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function textOf(sql) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function readUser(state) {
  const row = state.userRows.length > 1 ? state.userRows.shift() : state.userRows[0];
  state.userReads.push(row?.email ?? null);
  return {
    email: row?.email ?? null,
    name: row?.name ?? "Pat Lee",
    emailVerified: row?.emailVerified === true,
  };
}

function live(invite, email) {
  return (
    invite.status === "pending" &&
    invite.email.toLowerCase() === String(email || "").toLowerCase() &&
    new Date(invite.expires_at).getTime() > Date.now()
  );
}

// The user row as the database sees it right now (no shift), for queries that
// join or recheck "user" inside the same statement as centre_invites.
function verifiedViewer(state, userId) {
  const row = state.userRows[0];
  if (userId !== state.userId || row?.emailVerified !== true || !row?.email) return null;
  return String(row.email).toLowerCase();
}

function handle(state, sql, values) {
  const q = textOf(sql);
  state.queries.push(q);
  const [a, b, c, d, e] = values;

  if (q.includes('from "user"') && !q.includes("centre_invites")) {
    if (a !== state.userId) return [];
    return [readUser(state)];
  }
  if (q.includes("from profiles") || q.includes('from "account"')) return [];
  if (q.includes("insert into security_events")) {
    state.events.push(b);
    return [];
  }
  if (q.includes("from centre_invites") && q.includes("token_hash")) {
    return state.invites.filter((row) => row.token_hash === a);
  }
  if (q.includes("select permission_preset from centre_invites")) {
    const row = state.invites.find((invite) => invite.id === a);
    return row ? [{ permission_preset: row.permission_preset ?? null }] : [];
  }
  if (q.includes("from centre_invites") && q.includes("join daycares")) {
    // join "user" u on u.id = $1 and u."emailVerified" and lower(u.email) = lower(i.email)
    // where lower(i.email) = $2
    const viewer = verifiedViewer(state, a);
    return state.invites
      .filter((row) => viewer === row.email.toLowerCase() && live(row, b))
      .map((row) => ({
        id: row.id,
        role: row.role,
        centre: row.centre,
      }));
  }
  if (
    q.includes("from centre_invites") &&
    q.includes("invited_by") &&
    !q.includes("update centre_invites")
  ) {
    // join "user" u on u.id = $1 ... where lower(i.email) = $2
    const viewer = verifiedViewer(state, a);
    return state.invites
      .filter((row) => viewer === row.email.toLowerCase() && live(row, b))
      .map((row) => ({
        id: row.id,
        daycare_id: row.daycare_id,
        email: row.email,
        role: row.role,
        status: row.status,
        expires_at: row.expires_at,
        invited_by: row.invited_by,
      }));
  }
  if (q.includes("select id, status, role from centre_members")) {
    return state.members.filter((row) => row.daycare_id === a && row.user_id === b);
  }
  if (q.includes("select id from centre_members")) {
    return state.members
      .filter((row) => row.daycare_id === a && row.user_id === b)
      .map((row) => ({ id: row.id }));
  }
  if (q.includes("select daycare_id, role, permission_preset")) {
    return state.members
      .filter((row) => row.user_id === a && row.status === "active")
      .map((row) => ({
        daycare_id: row.daycare_id,
        role: row.role,
        permission_preset: row.permission_preset ?? null,
        permissions: row.permissions ?? null,
      }));
  }
  if (q.includes("select role from centre_members")) {
    return state.members
      .filter((row) => row.user_id === a && row.daycare_id === b && row.status === "active")
      .map((row) => ({ role: row.role }));
  }
  if (q.includes("select daycare_id from centre_members")) {
    return state.members
      .filter((row) => row.user_id === a && row.status === "active")
      .map((row) => ({ daycare_id: row.daycare_id }));
  }
  if (q.includes("from provider_daycares")) return [];
  if (q.includes("insert into centre_members")) {
    state.members.push({
      id: a,
      daycare_id: b,
      user_id: c,
      role: d,
      status: "active",
      invited_by: e,
      permission_preset: null,
      permissions: null,
    });
    return [];
  }
  if (q.includes("update centre_members") && q.includes("permission_preset")) {
    const member = state.members.find(
      (row) => row.daycare_id === b && row.user_id === c && row.role !== "owner",
    );
    if (member) member.permission_preset = a;
    return [];
  }
  if (q.includes("update centre_members") && q.includes("status = 'active'")) {
    const member = state.members.find(
      (row) => row.id === values[values.length - 1] || row.id === b,
    );
    if (member) {
      member.role = a;
      member.status = "active";
    }
    return [];
  }
  if (
    q.includes("update centre_invites") &&
    q.includes("token_hash") &&
    q.includes("returning")
  ) {
    // Atomic token accept: values are (userId, id, tokenHash, userId).
    const invite = state.invites.find((row) => row.id === b && row.token_hash === c);
    const viewer = verifiedViewer(state, d);
    if (
      !invite ||
      a !== d ||
      invite.status !== "pending" ||
      new Date(invite.expires_at).getTime() <= Date.now() ||
      viewer !== invite.email.toLowerCase()
    )
      return [];
    invite.status = "accepted";
    invite.accepted_user_id = a;
    return [{ id: invite.id, daycare_id: invite.daycare_id, role: invite.role, name: invite.name }];
  }
  if (
    q.includes("update centre_invites") &&
    q.includes("status = 'accepted'") &&
    q.includes("returning")
  ) {
    // Atomic email-match claim: values are (userId, id, role, email, userId).
    // Every where-clause condition must hold, or no row comes back.
    const invite = state.invites.find((row) => row.id === b);
    const viewer = verifiedViewer(state, e);
    if (
      !invite ||
      a !== e ||
      invite.role !== c ||
      !live(invite, d) ||
      viewer !== invite.email.toLowerCase()
    )
      return [];
    invite.status = "accepted";
    invite.accepted_user_id = a;
    return [
      {
        id: invite.id,
        daycare_id: invite.daycare_id,
        role: invite.role,
        invited_by: invite.invited_by,
      },
    ];
  }
  if (q.includes("update centre_invites") && q.includes("status = 'accepted'")) {
    const invite = state.invites.find((row) => row.id === b);
    if (invite && (invite.status === "pending" || !q.includes("status = 'pending'"))) {
      invite.status = "accepted";
      invite.accepted_user_id = a;
    }
    return [];
  }
  if (q.includes('update "user"')) return [];
  if (q.includes("from family_documents") && q.includes("family_document_shares")) {
    return state.shares.filter((row) => row.document_id === a);
  }
  if (q.includes("from family_documents")) {
    return state.documents.filter((row) => row.id === a && row.user_id === b);
  }
  state.unmatched.push(q);
  return [];
}

function pending(input) {
  return {
    id: input.id,
    daycare_id: input.daycareId ?? CENTRE,
    email: input.email ?? INVITE_EMAIL,
    name: "Director",
    role: input.role ?? "staff",
    status: "pending",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    invited_by: "user-owner",
    permission_preset: input.preset ?? input.role ?? "staff",
    token_hash: tokenHash(input.token ?? TOKEN),
    centre: input.centre ?? "Centre One",
    accepted_user_id: null,
  };
}

function arm(input) {
  const state = {
    userId: USER,
    ids: 0,
    userRows: input.userRows,
    userReads: [],
    invites: input.invites.map((row) => ({ ...row })),
    members: (input.members ?? []).map((row) => ({ ...row })),
    documents: [
      {
        id: DOC,
        user_id: "user-parent",
        storage_ref: "family-docs/fixture.pdf",
        mime: "application/pdf",
        file_name: "immunization.pdf",
      },
    ],
    shares: [
      {
        document_id: DOC,
        storage_ref: "family-docs/fixture.pdf",
        mime: "application/pdf",
        file_name: "immunization.pdf",
        daycare_id: CENTRE,
        revoked_at: null,
      },
    ],
    events: [],
    queries: [],
    unmatched: [],
  };
  const sql = (strings, ...values) => Promise.resolve(handle(state, strings.join(" "), values));
  sql.query = (query, params = []) => Promise.resolve(handle(state, query, params));
  state.sql = sql;
  globalThis[key] = state;
  return state;
}

function state() {
  return globalThis[key];
}

function user(email, emailVerified) {
  return { email, emailVerified, name: "Pat Lee" };
}

beforeEach(() => {
  arm({
    userRows: [user(INVITE_EMAIL, false)],
    invites: [pending({ id: "inv-staff", role: "staff" })],
  });
});

after(() => {
  hooks.deregister();
  delete globalThis[key];
});

function denied() {
  assert.equal(state().members.filter((row) => row.status === "active").length, 0);
  assert.equal(
    state().invites.every((row) => row.status === "pending"),
    true,
  );
  assert.equal(state().events.includes("employee_accept"), false);
}

test("an unverified session cannot list or accept a staff invite for its email", async () => {
  const listed = await listMyStaffInvites();
  assert.deepEqual(listed.invites, []);
  await assert.rejects(acceptMyStaffInvite({ data: { id: "inv-staff" } }), /no longer valid/i);
  denied();
  assert.equal(await loadCentreRole(state().sql, USER, CENTRE), null);
  const messages = await explainStaffArea(state().sql, USER, CENTRE, "messages", "edit");
  assert.equal(messages.ok, false);
  await assert.rejects(loadFamilyDocumentFor({ userId: USER, documentId: DOC }), /not_found/);
});

test("an unverified session cannot accept the emailed staff-invite token", async () => {
  await assert.rejects(acceptCentreInvite({ data: TOKEN }), /no longer valid|sent to/i);
  denied();
  assert.equal(await loadCentreRole(state().sql, USER, CENTRE), null);
});

test("an unverified session cannot reactivate a revoked membership from an email match", async () => {
  arm({
    userRows: [user(INVITE_EMAIL, false)],
    invites: [pending({ id: "inv-staff", role: "manager", preset: "manager" })],
    members: [
      {
        id: "cm-old",
        daycare_id: CENTRE,
        user_id: USER,
        role: "staff",
        status: "revoked",
        permission_preset: "staff",
        permissions: null,
      },
    ],
  });
  await assert.rejects(acceptMyStaffInvite({ data: { id: "inv-staff" } }), /no longer valid/i);
  const member = state().members.find((row) => row.id === "cm-old");
  assert.equal(member.status, "revoked");
  assert.equal(member.role, "staff");
  assert.equal(state().invites[0].status, "pending");
  assert.equal(await loadCentreRole(state().sql, USER, CENTRE), null);
});

test("claim does not grant the invited address when this user's verified email is a different mailbox", async () => {
  arm({
    userRows: [user(OTHER_EMAIL, true), user(INVITE_EMAIL, false)],
    invites: [pending({ id: "inv-manager", role: "manager", preset: "manager" })],
  });
  const result = await claimPendingCentreInvitesForUser(
    state().sql,
    USER,
    INVITE_EMAIL,
    "inv-manager",
  );
  assert.equal(result.claimed, 0);
  denied();
  assert.equal(await loadCentreRole(state().sql, USER, CENTRE), null);
  const children = await explainStaffArea(state().sql, USER, CENTRE, "children", "edit");
  assert.equal(children.ok, false);
});

test("accept does not follow a later unverified email after an earlier verified read", async () => {
  arm({
    userRows: [user(OTHER_EMAIL, true), user(INVITE_EMAIL, false)],
    invites: [pending({ id: "inv-staff", role: "staff" })],
  });
  await assert.rejects(acceptMyStaffInvite({ data: { id: "inv-staff" } }), /no longer valid/i);
  denied();
});

test("the token accept does not follow a later unverified email", async () => {
  arm({
    userRows: [user(OTHER_EMAIL, true), user(INVITE_EMAIL, false)],
    invites: [pending({ id: "inv-staff", role: "staff", token: TOKEN })],
  });
  await assert.rejects(acceptCentreInvite({ data: TOKEN }), /no longer valid|sent to/i);
  denied();
});

test("list does not follow a later unverified email", async () => {
  arm({
    userRows: [user(OTHER_EMAIL, true), user(INVITE_EMAIL, false)],
    invites: [pending({ id: "inv-staff", role: "staff" })],
  });
  const listed = await listMyStaffInvites();
  assert.deepEqual(listed.invites, []);
});

test("a verified mailbox can accept its own staff invite and then open messages and the shared file", async () => {
  arm({
    userRows: [user(INVITE_EMAIL, true)],
    invites: [pending({ id: "inv-staff", role: "staff", preset: "staff" })],
  });
  const listed = await listMyStaffInvites();
  assert.deepEqual(listed.invites, [{ id: "inv-staff", centre: "Centre One", role: "staff" }]);
  assert.deepEqual(await acceptMyStaffInvite({ data: { id: "inv-staff" } }), { ok: true });
  const member = state().members.find((row) => row.user_id === USER && row.daycare_id === CENTRE);
  assert.equal(member?.status, "active");
  assert.equal(member?.role, "staff");
  assert.equal(state().invites[0].status, "accepted");
  assert.equal(state().invites[0].accepted_user_id, USER);
  assert.equal(await loadCentreRole(state().sql, USER, CENTRE), "staff");
  assert.equal((await explainStaffArea(state().sql, USER, CENTRE, "messages", "edit")).ok, true);
  assert.equal((await explainStaffArea(state().sql, USER, CENTRE, "children", "edit")).ok, false);
  assert.equal((await explainStaffArea(state().sql, USER, CENTRE, "bills", "view")).ok, false);
  assert.equal(
    (await explainStaffArea(state().sql, USER, OTHER_CENTRE, "messages", "view")).ok,
    false,
  );
  const file = await loadFamilyDocumentFor({ userId: USER, documentId: DOC });
  assert.equal(file.storageRef, "family-docs/fixture.pdf");
  assert.equal(file.fileName, "immunization.pdf");
  assert.deepEqual(state().unmatched, []);
});

test("a verified mailbox can accept a manager invite and then open child records and bills", async () => {
  arm({
    userRows: [user(INVITE_EMAIL, true)],
    invites: [pending({ id: "inv-manager", role: "manager", preset: "manager" })],
  });
  assert.deepEqual(await acceptMyStaffInvite({ data: { id: "inv-manager" } }), { ok: true });
  assert.equal(await loadCentreRole(state().sql, USER, CENTRE), "manager");
  assert.equal((await explainStaffArea(state().sql, USER, CENTRE, "children", "edit")).ok, true);
  assert.equal((await explainStaffArea(state().sql, USER, CENTRE, "bills", "edit")).ok, true);
  assert.equal((await explainStaffArea(state().sql, USER, CENTRE, "messages", "edit")).ok, true);
  const file = await loadFamilyDocumentFor({ userId: USER, documentId: DOC });
  assert.equal(file.storageRef, "family-docs/fixture.pdf");
});

test("accepting one invite does not activate a second invite", async () => {
  arm({
    userRows: [user(INVITE_EMAIL, true)],
    invites: [
      pending({ id: "inv-a", role: "staff", daycareId: CENTRE, centre: "Centre One" }),
      pending({
        id: "inv-b",
        role: "manager",
        daycareId: OTHER_CENTRE,
        centre: "Centre Two",
        preset: "manager",
      }),
    ],
  });
  assert.deepEqual(await acceptMyStaffInvite({ data: { id: "inv-a" } }), { ok: true });
  assert.equal(
    state()
      .members.filter((row) => row.status === "active")
      .map((row) => row.daycare_id)
      .join(),
    CENTRE,
  );
  assert.equal(state().invites.find((row) => row.id === "inv-b").status, "pending");
  assert.equal(await loadCentreRole(state().sql, USER, OTHER_CENTRE), null);
});

test("a verified mailbox can accept the emailed token for that same address", async () => {
  arm({
    userRows: [user(INVITE_EMAIL, true)],
    invites: [pending({ id: "inv-staff", role: "staff", token: TOKEN })],
  });
  const accepted = await acceptCentreInvite({ data: TOKEN });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.daycareId, CENTRE);
  assert.equal(state().members[0].user_id, USER);
  assert.equal(state().members[0].role, "staff");
  assert.equal(state().invites[0].accepted_user_id, USER);
});
