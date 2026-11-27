import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CENTRE_INVITE_BAD_EMAIL,
  CENTRE_INVITE_DUPLICATE,
  CENTRE_INVITE_HOURLY_MAX,
  CENTRE_INVITE_NOT_FOUND,
  CENTRE_INVITE_NOT_OWNER,
  CENTRE_INVITE_RATE_LIMITED,
  CENTRE_INVITE_RESEND_WAIT,
  CENTRE_INVITE_SELF,
  CENTRE_REVOKE_OWNER,
  CENTRE_STAFF_FORBIDDEN,
  centreCanAccessPrivileged,
  centreCanCreateListing,
  centreCanInviteRevoke,
  centreCanMutateVacancies,
  centreCanWriteLeads,
  centreDeskCaps,
  decideAcceptInvite,
  decideInviteEmployee,
  invitesToClaim,
  decideResendInvite,
  decideRevokeEmployee,
  maxCentreRole,
  parseCentreInviteRole,
  sessionCentreCaps,
} from "../src/lib/centre-roles.ts";
import { visibleDeskNav } from "../src/lib/desk-nav.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("owner-only surfaces fail closed for staff and read-only", () => {
  assert.equal(centreCanAccessPrivileged("owner"), true);
  assert.equal(centreCanAccessPrivileged("manager"), false);
  assert.equal(centreCanAccessPrivileged("staff"), false);
  assert.equal(centreCanAccessPrivileged("read_only"), false);
  assert.equal(centreCanAccessPrivileged(null), false);
  assert.equal(centreCanInviteRevoke("owner"), true);
  assert.equal(centreCanInviteRevoke("manager"), false);
  assert.equal(centreCanWriteLeads("staff"), true);
  assert.equal(centreCanWriteLeads("read_only"), false);
  assert.equal(centreCanMutateVacancies("staff"), true);
  assert.equal(centreCanMutateVacancies("read_only"), false);
  assert.equal(centreCanCreateListing({ ownerCount: 0, memberOnly: true }), false);
  assert.equal(centreCanCreateListing({ ownerCount: 0, memberOnly: false }), true);
  assert.equal(centreDeskCaps("staff").money, false);
  assert.equal(centreDeskCaps("staff").licence, false);
  assert.equal(centreDeskCaps("staff").contract, false);
  assert.equal(centreDeskCaps("staff").employees, false);
  assert.equal(centreDeskCaps("owner").money, true);
  assert.equal(CENTRE_STAFF_FORBIDDEN.includes("Money"), true);
});

test("session staff hide Money / licence / claim / Screening; owners keep them", () => {
  const staff = sessionCentreCaps({ isOwner: false, isMember: true });
  assert.equal(staff.money, false);
  assert.equal(staff.claim, false);
  const owner = sessionCentreCaps({ isOwner: true, isMember: false });
  assert.equal(owner.money, true);
  assert.equal(owner.employees, true);
  const hidden = visibleDeskNav("daycare", {
    providerSubscriptions: true,
    showPayCtas: true,
    centreOwner: false,
    subscriptionsEnabled: true,
  }).map((i) => i.id);
  assert.equal(hidden.includes("employees"), false);
  assert.equal(hidden.includes("money"), false);
  assert.equal(hidden.includes("licence"), false);
  assert.equal(hidden.includes("contract"), false);
  assert.equal(hidden.includes("claim"), false);
  assert.equal(hidden.includes("add"), false);
  assert.equal(hidden.includes("subscription"), false);
  assert.equal(hidden.includes("requests"), true);
  assert.equal(hidden.includes("listings"), true);
  assert.equal(hidden.includes("screening"), false);
  const shown = visibleDeskNav("daycare", {
    providerSubscriptions: true,
    showPayCtas: true,
    centreOwner: true,
    subscriptionsEnabled: true,
  }).map((i) => i.id);
  assert.equal(shown.includes("employees"), true);
  assert.equal(shown.includes("money"), true);
  assert.equal(shown.includes("screening"), true);
});

test("invite decision: owner only, rate limit, no self, no duplicate", () => {
  const base = {
    actorRole: "owner",
    actorEmail: "owner@centre.ca",
    inviteEmail: "lead@centre.ca",
    inviteRole: "staff",
    alreadyMember: false,
    pendingInvite: false,
    hourlyCount: 0,
    dailyCount: 0,
  };
  assert.equal(decideInviteEmployee(base).ok, true);
  assert.equal(decideInviteEmployee({ ...base, actorRole: "staff" }).error, CENTRE_INVITE_NOT_OWNER);
  assert.equal(decideInviteEmployee({ ...base, inviteEmail: "not-an-email" }).error, CENTRE_INVITE_BAD_EMAIL);
  assert.equal(decideInviteEmployee({ ...base, inviteEmail: "owner@centre.ca" }).error, CENTRE_INVITE_SELF);
  assert.equal(decideInviteEmployee({ ...base, alreadyMember: true }).error, CENTRE_INVITE_DUPLICATE);
  assert.equal(
    decideInviteEmployee({ ...base, hourlyCount: CENTRE_INVITE_HOURLY_MAX }).error,
    CENTRE_INVITE_RATE_LIMITED,
  );
  assert.equal(parseCentreInviteRole("manager"), "manager");
  assert.equal(parseCentreInviteRole("owner"), "staff");
  assert.equal(maxCentreRole(["staff", "owner", "manager"]), "owner");
});

test("accept attaches only this mailbox's live staff invite and opens the daycare desk", () => {
  const now = Date.parse("2026-11-16T18:00:00.000Z");
  const live = {
    id: "inv_staff",
    daycareId: "d_3plahsnplst5",
    email: "info@openroadoutlet.ca",
    role: "staff",
    status: "pending",
    expiresAtMs: now + 60_000,
  };
  const claimed = invitesToClaim({
    email: "INFO@openroadoutlet.ca",
    nowMs: now,
    invites: [
      live,
      { ...live, id: "inv_other", email: "other@openroadoutlet.ca" },
      { ...live, id: "inv_old", status: "accepted" },
      { ...live, id: "inv_gone", expiresAtMs: now - 1 },
      { ...live, id: "inv_owner", role: "owner" },
      { ...live, id: "inv_revoked", status: "revoked" },
      { ...live, id: "inv_manager", role: "manager" },
    ],
  });
  assert.deepEqual(
    claimed.map((row) => row.id),
    ["inv_staff", "inv_manager"],
  );
  assert.equal(invitesToClaim({ email: "not-an-email", invites: [live] }).length, 0);
  const members = src("src/lib/server/centre-members.ts");
  const claim = members.slice(members.indexOf("claimPendingCentreInvitesForUser"));
  const claimBody = claim.slice(0, claim.indexOf("export const listMyStaffInvites"));
  assert.match(claimBody, /status = 'accepted'/);
  assert.match(claimBody, /existing\[0\]\.status !== "active"/);
  assert.doesNotMatch(claimBody, /password/);
  assert.doesNotMatch(claimBody, /deleted_at/);
  assert.doesNotMatch(claimBody, /provider_daycares/);
  assert.match(members, /export const acceptMyStaffInvite/);
  assert.match(members, /claimPendingCentreInvitesForUser\(sql, context\.userId, actor\.email \|\| "", data\.id\)/);
  const roles = src("src/lib/server/roles.ts");
  assert.doesNotMatch(roles, /claimPendingCentreInvitesForUser/);
  const chrome = src("src/lib/server/role-route.ts");
  assert.doesNotMatch(chrome, /claimPendingCentreInvitesForUser/);
  const banner = src("src/components/staff-invite-banner.tsx");
  assert.match(banner, /data-ke="staff-invite-banner"/);
  assert.match(banner, /window\.location\.assign\("\/provider"\)/);
  assert.match(src("src/components/shell.tsx"), /StaffInviteBanner/);
  assert.match(src("src/lib/copy-en.ts"), /\{centre\} invited you to join their team\./);
  assert.match(src("src/lib/copy-en.ts"), /staffInviteAccept: "Accept"/);
  assert.match(src("src/lib/copy-fr.ts"), /staffInviteAccept: "Accepter"/);
});

test("accept invite requires matching mailbox and a live pending token", () => {
  const ok = decideAcceptInvite({
    inviteStatus: "pending",
    inviteEmail: "lead@centre.ca",
    sessionEmail: "LEAD@centre.ca",
    expiresAtMs: Date.now() + 60_000,
  });
  assert.equal(ok.ok, true);
  assert.equal(
    decideAcceptInvite({
      inviteStatus: "pending",
      inviteEmail: "lead@centre.ca",
      sessionEmail: "other@centre.ca",
      expiresAtMs: Date.now() + 60_000,
    }).ok,
    false,
  );
  assert.equal(
    decideAcceptInvite({
      inviteStatus: "revoked",
      inviteEmail: "lead@centre.ca",
      sessionEmail: "lead@centre.ca",
      expiresAtMs: Date.now() + 60_000,
    }).ok,
    false,
  );
  assert.equal(decideRevokeEmployee({ actorRole: "owner", targetRole: "staff", targetKind: "member" }).ok, true);
  assert.equal(
    decideRevokeEmployee({ actorRole: "owner", targetRole: "owner", targetKind: "member" }).error,
    CENTRE_REVOKE_OWNER,
  );
});

test("a pending invite can be resent after ten minutes, and the same caps still apply", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  const base = {
    actorRole: "owner",
    inviteStatus: "pending",
    createdAtMs: now - 11 * 60 * 1000,
    lastResentAtMs: null,
    nowMs: now,
    hourlyCount: 0,
    dailyCount: 0,
  };
  assert.equal(decideResendInvite(base).ok, true);
  assert.equal(decideResendInvite({ ...base, createdAtMs: now - 60 * 1000 }).error, CENTRE_INVITE_RESEND_WAIT);
  assert.equal(decideResendInvite({ ...base, actorRole: "staff" }).error, CENTRE_INVITE_NOT_OWNER);
  assert.equal(decideResendInvite({ ...base, inviteStatus: "accepted" }).error, CENTRE_INVITE_NOT_FOUND);
  assert.equal(
    decideResendInvite({ ...base, hourlyCount: CENTRE_INVITE_HOURLY_MAX }).error,
    CENTRE_INVITE_RATE_LIMITED,
  );
});

test("EN and FR-CA employee labels exist and match", () => {
  const dict = (src("src/lib/copy-en.ts") + src("src/lib/copy-fr.ts"));
  for (const key of [
    "employeesTitle",
    "employeeAddTitle",
    "employeeAddSubmit",
    "employeeRoleStaff",
    "employeeResend",
    "employeeRevoke",
    "employeeInviteTitle",
  ]) {
    assert.equal((dict.match(new RegExp(`${key}:`, "g")) || []).length, 2, key);
  }
  assert.match(dict, /employeesTitle: "Employees"/);
  assert.match(dict, /employeeAddTitle: "Ajouter un employé"/);
});

test("wire: Neon membership, Better Auth invite, owner revoke, king-admin untouched", () => {
  const migration = src("migrations/0045_centre_employees.sql");
  assert.match(migration, /create table if not exists centre_members/);
  assert.match(migration, /create table if not exists centre_invites/);
  assert.match(migration, /provider_daycares/);
  assert.match(src("src/lib/server/centre-members.ts"), /resendCentreInvite/);
  assert.match(src("src/lib/server/centre-members.ts"), /trySendEmployeeInviteEmail/);
  assert.match(src("src/components/centre-employees.tsx"), /data-ke="employee-resend"/);
  assert.match(src("src/lib/server/centre-members.ts"), /revokeCentreEmployee/);
  assert.match(src("src/lib/server/centre-members.ts"), /acceptCentreInvite/);
  assert.match(src("src/lib/server/centre-members.ts"), /employee_invite/);
  assert.match(src("src/lib/server/invite-mail.ts"), /purpose: "invite"/);
  assert.match(src("src/lib/transactional-mail.ts"), /"invite"/);
  assert.match(src("src/routes/invite.$token.tsx"), /createFileRoute\("\/invite\/\$token"\)/);
  assert.match(src("src/routes/invite.$token.tsx"), /acceptCentreInvite\(\{ data: token \}\)/);
  assert.match(src("src/routes/invite.$token.tsx"), /sessionEmail === inviteEmail/);
  assert.equal(src("src/lib/role-access.ts").includes('startsWith("/invite/")'), false);
  assert.match(src("src/routeTree.gen.ts"), /id:\s*'\/invite\/\$token'/);
  assert.match(src("src/lib/server/family.ts"), /delete from centre_members/);
  assert.match(src("src/routes/provider.tsx"), /employees/);
  assert.match(src("src/lib/desk-nav.ts"), /id: "employees"/);
  assert.match(src("src/lib/admin-email.ts"), /kyle@kidease\.ca/);
  const parentNav = src("src/lib/desk-nav.ts");
  assert.match(parentNav, /id: "explore"/);
  assert.doesNotMatch(src("src/lib/desks.ts").split("parent:")[1] ?? "", /employees/);
  assert.match(src("src/lib/server/family.ts"), /centre_members/);
  assert.match(src("src/lib/server/billing.ts"), /provider_daycares/);
});
