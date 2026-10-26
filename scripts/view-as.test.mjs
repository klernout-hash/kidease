import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { copy } from "../src/lib/copy.ts";
import { desksFor, headerDesks, showDeskSwitcher } from "../src/lib/desks.ts";
import {
  VIEW_AS_READ_ONLY_MESSAGE,
  VIEW_AS_TTL_MS,
  authMutationAction,
  decideStartViewAs,
  exitViewAsSession,
  isViewAsExpired,
  openViewAsSession,
  readViewAsSession,
  sqlAllowedDuringViewAs,
  viewAsAllows,
  viewAsAuthFailureEndsSession,
  viewAsHome,
  viewAsMinutesLeft,
  viewAsMatchesAuthSession,
  viewAsWho,
  ViewAsReadOnlyError,
  assertViewAsAction,
} from "../src/lib/view-as.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const admin = { actorIsAdmin: true, actorUserId: "admin-1", targetUserId: "parent-1", targetRole: "parent", targetEmail: "parent@example.com" };

test("only an admin can start, and never as another admin or themselves", () => {
  assert.deepEqual(decideStartViewAs({ ...admin, actorIsAdmin: false }), { ok: false, reason: "not_admin" });
  assert.deepEqual(decideStartViewAs({ ...admin, targetUserId: "admin-1" }), { ok: false, reason: "self" });
  assert.deepEqual(decideStartViewAs({ ...admin, targetUserId: "" }), { ok: false, reason: "missing_target" });
  assert.deepEqual(decideStartViewAs({ ...admin, targetEmail: "Kyle@KidEase.ca" }), { ok: false, reason: "target_admin" });
  assert.deepEqual(decideStartViewAs({ ...admin, targetRole: "admin", targetEmail: "other@kidease.ca" }), {
    ok: false,
    reason: "target_admin",
  });
  assert.deepEqual(decideStartViewAs({ ...admin, targetRole: "support" }), { ok: false, reason: "not_daycare_or_parent" });
  assert.deepEqual(decideStartViewAs({ ...admin, targetRole: "support_lead" }), {
    ok: false,
    reason: "not_daycare_or_parent",
  });
  assert.deepEqual(decideStartViewAs(admin), { ok: true });
  assert.deepEqual(decideStartViewAs({ ...admin, targetRole: "provider", targetEmail: "centre@example.com" }), { ok: true });
});

test("a view-as session expires at 30 minutes and exit writes an audit", () => {
  const now = 1_700_000_000_000;
  const opened = openViewAsSession({
    id: "sess-1",
    adminUserId: "admin-1",
    targetUserId: "parent-1",
    nowMs: now,
    existing: null,
    decision: { ok: true },
  });
  assert.equal(opened.error, null);
  assert.equal(opened.session.expiresAtMs - opened.session.startedAtMs, VIEW_AS_TTL_MS);
  assert.equal(opened.audits[0].kind, "view_as_start");
  assert.equal(opened.audits[0].actorUserId, "admin-1");
  assert.equal(opened.audits[0].targetUserId, "parent-1");
  assert.equal(opened.audits[0].atMs, now);

  assert.equal(isViewAsExpired(opened.session.expiresAtMs, opened.session.expiresAtMs - 1), false);
  assert.equal(isViewAsExpired(opened.session.expiresAtMs, opened.session.expiresAtMs), true);
  assert.equal(viewAsMinutesLeft(opened.session.expiresAtMs, opened.session.expiresAtMs), 0);

  const still = readViewAsSession(opened.session, now + 60_000);
  assert.equal(still.active?.id, "sess-1");
  assert.equal(still.audits.length, 0);

  const expired = readViewAsSession(opened.session, opened.session.expiresAtMs);
  assert.equal(expired.active, null);
  assert.equal(expired.expired.endReason, "expired");
  assert.equal(expired.audits[0].kind, "view_as_expired");
  assert.equal(expired.audits[0].actorUserId, "admin-1");
  assert.equal(expired.audits[0].targetUserId, "parent-1");

  const exited = exitViewAsSession(opened.session, now + 5_000);
  assert.equal(exited.closed.endReason, "exit");
  assert.equal(exited.audits[0].kind, "view_as_exit");
  assert.equal(exited.audits[0].detail, "exit");
  assert.equal(exited.audits[0].atMs, now + 5_000);
  assert.deepEqual(exitViewAsSession(exited.closed, now + 6_000), { closed: null, audits: [] });
});

test("replacing an open view closes the previous one in the audit log", () => {
  const now = 1_700_000_000_000;
  const first = openViewAsSession({
    id: "sess-1",
    adminUserId: "admin-1",
    targetUserId: "parent-1",
    nowMs: now,
    existing: null,
    decision: { ok: true },
  });
  const next = openViewAsSession({
    id: "sess-2",
    adminUserId: "admin-1",
    targetUserId: "provider-9",
    nowMs: now + 1000,
    existing: first.session,
    decision: { ok: true },
  });
  assert.equal(next.closed.endReason, "replaced");
  assert.equal(next.closed.targetUserId, "parent-1");
  assert.equal(next.audits[0].kind, "view_as_exit");
  assert.equal(next.audits[0].detail, "replaced");
  assert.equal(next.audits[1].kind, "view_as_start");
  assert.equal(next.audits[1].targetUserId, "provider-9");
});

test("a denied start audits the reason and does not open a session", () => {
  const denied = openViewAsSession({
    id: "sess-x",
    adminUserId: "staff-1",
    targetUserId: "parent-1",
    nowMs: 10,
    existing: null,
    decision: { ok: false, reason: "not_admin" },
  });
  assert.equal(denied.session, null);
  assert.equal(denied.error, "not_admin");
  assert.equal(denied.audits[0].kind, "view_as_denied");
  assert.equal(denied.audits[0].detail, "not_admin");
});

test("view as is read-only for messages, calls, video, payments, secrets, and deletes", () => {
  const blocked = ["message", "call", "video", "payment", "password", "two_factor", "email", "delete", "write"];
  for (const action of blocked) {
    assert.equal(viewAsAllows(action, true), false);
    assert.throws(() => assertViewAsAction(action, true), (err) => {
      assert.equal(err instanceof ViewAsReadOnlyError, true);
      assert.equal(err.message, VIEW_AS_READ_ONLY_MESSAGE);
      assert.equal(err.action, action);
      return true;
    });
  }
  assert.equal(viewAsAllows("read", true), true);
  assert.equal(viewAsAllows("exit", true), true);
  assert.equal(viewAsAllows("delete", false), true);
  assert.doesNotThrow(() => assertViewAsAction("password", false));
});

test("sql writes are blocked except the security audit insert", () => {
  assert.equal(sqlAllowedDuringViewAs("select id from profiles where user_id = $1"), true);
  assert.equal(sqlAllowedDuringViewAs("insert into security_events (kind) values ($1)"), true);
  assert.equal(sqlAllowedDuringViewAs("insert into messages (body) values ($1)"), false);
  assert.equal(sqlAllowedDuringViewAs('update "account" set password = $1 where id = $2'), false);
  assert.equal(sqlAllowedDuringViewAs('delete from "session" where id = $1'), false);
  assert.equal(sqlAllowedDuringViewAs("select id from profiles where user_id = $1 for update"), false);
  assert.equal(sqlAllowedDuringViewAs("with gone as (delete from profiles returning id) select id from gone"), false);
  assert.equal(sqlAllowedDuringViewAs("select 1; delete from profiles"), false);
});

test("auth password, email, 2FA, and delete posts are blocked; sign-out stays open", () => {
  assert.equal(authMutationAction("GET", "/api/auth/change-password"), null);
  assert.equal(authMutationAction("POST", "/api/auth/sign-out"), null);
  assert.equal(authMutationAction("POST", "/api/auth/change-password"), "password");
  assert.equal(authMutationAction("POST", "/api/auth/change-email"), "email");
  assert.equal(authMutationAction("POST", "/api/auth/delete-user"), "delete");
  assert.equal(authMutationAction("POST", "/api/auth/two-factor/enable"), "two_factor");
  assert.equal(viewAsAuthFailureEndsSession("Not authorized"), true);
  assert.equal(viewAsAuthFailureEndsSession("Two-factor verification required"), true);
  assert.equal(viewAsAuthFailureEndsSession("Admin session timed out. Sign in again."), true);
  assert.equal(viewAsAuthFailureEndsSession("database down"), false);
});

test("a parent who also runs a daycare can switch to Parent", () => {
  const desks = desksFor({ role: "parent", ownsCentre: true });
  assert.deepEqual(headerDesks(desks, "parent", "parent@example.com"), ["provider", "parent"]);
  assert.equal(showDeskSwitcher(desks, "parent", "parent@example.com"), true);
  assert.equal(headerDesks(desks, "parent", "parent@example.com").includes("admin"), false);
  assert.equal(viewAsHome("parent", true), "/provider");
  assert.equal(viewAsHome("parent", false), "/parent");
  assert.equal(viewAsHome("provider", false), "/provider");
  assert.equal(viewAsWho("Amina", "amina@example.com", "this person"), "Amina (amina@example.com)");
});

test("server gates re-check requireAdmin and block writes before they run", () => {
  const server = src("src/lib/server/view-as.ts");
  const auth = src("src/routes/api/auth/$.ts");
  assert.match(src("src/lib/auth/verify.server.ts"), /effectiveSessionUser/);
  assert.match(server, /await requireAdmin\(actorUserId\)/);
  assert.match(server, /await requireAdmin\(actor\.id\)/);
  assert.match(src("src/lib/server/view-as-api.ts"), /await import\("\.\/view-as"\)/);
  assert.doesNotMatch(src("src/components/view-as-banner.tsx"), /from "@\/lib\/server\/view-as";/);
  assert.match(server, /viewAsAuthFailureEndsSession/);
  assert.match(auth, /authMutationAction/);
  assert.match(auth, /viewAsBlocksThisRequest/);
  assert.match(src("src/lib/server/stripe-checkout.ts"), /method !== "GET"/);
  assert.match(src("src/lib/server/stripe-checkout.ts"), /__kideaseViewAsSideEffect__\?\.\("payment"\)/);
  assert.match(src("src/lib/server/inbox.ts"), /blockViewAsSideEffect\("message"\)/);
  assert.match(src("src/lib/server/voice-call.ts"), /blockViewAsSideEffect\("call"\)/);
  assert.match(src("src/lib/server/voice.ts"), /__kideaseViewAsSideEffect__\?\.\("call"\)/);
  assert.match(src("src/lib/server/video-join.ts"), /blockViewAsSideEffect\("video"\)/);
  assert.match(src("src/lib/server/account-security.ts"), /blockViewAsSideEffect\("password"\)/);
  assert.match(src("src/lib/server/account-security.ts"), /blockViewAsSideEffect\("email"\)/);
  assert.match(src("src/lib/server/two-factor.ts"), /blockViewAsSideEffect\("two_factor"\)/);
  assert.match(src("src/lib/server/family.ts"), /blockViewAsSideEffect\("delete"\)/);
  assert.match(src("migrations/0090_view_as_sessions.sql"), /view_as_sessions/);
  assert.match(src("src/lib/server/security-events.ts"), /view_as_start/);
  assert.match(src("src/lib/server/security-events.ts"), /view_as_exit/);
  assert.doesNotMatch(src("src/components/support-preview-banner.tsx"), /startViewAs|view_as_sessions/);
  assert.equal(typeof copy.en.viewAsBanner, "string");
  assert.equal(typeof copy.fr.viewAsBanner, "string");
  assert.match(copy.en.viewAsBanner, /\{who\}/);
  assert.match(copy.fr.viewAsExit, /Quitter/);
});

test("a newer sign-in does not resume view-as, and sign-out closes it", () => {
  const started = 1_700_000_000_000;
  assert.equal(viewAsMatchesAuthSession({ sessionCreatedAtMs: started, viewStartedAtMs: started }), true);
  assert.equal(viewAsMatchesAuthSession({ sessionCreatedAtMs: started + 5_000, viewStartedAtMs: started }), true);
  assert.equal(viewAsMatchesAuthSession({ sessionCreatedAtMs: started + 5_001, viewStartedAtMs: started }), false);
  assert.equal(viewAsMatchesAuthSession({ sessionCreatedAtMs: 0, viewStartedAtMs: started }), false);
  assert.equal(viewAsMatchesAuthSession({ sessionCreatedAtMs: started, viewStartedAtMs: 0 }), false);
  const server = src("src/lib/server/view-as.ts");
  const banner = src("src/components/view-as-banner.tsx");
  const auth = src("src/routes/api/auth/$.ts");
  assert.match(server, /viewAsMatchesAuthSession/);
  assert.match(server, /closeViewAsForCurrentUser/);
  assert.match(server, /enterViewAsFrame\(frame\)/);
  assert.match(server, /endReason: "exit"/);
  assert.match(banner, /data-ke="view-as-banner"/);
  assert.match(banner, /viewAsExit/);
  assert.match(copy.en.viewAsExit, /Exit view as/);
  assert.match(auth, /closeViewAsForCurrentUser/);
  assert.match(auth, /isAuthSignOutPath/);
});
