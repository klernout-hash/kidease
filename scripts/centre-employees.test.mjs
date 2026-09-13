import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CENTRE_INVITE_BAD_EMAIL,
  CENTRE_INVITE_DUPLICATE,
  CENTRE_INVITE_HOURLY_MAX,
  CENTRE_INVITE_NOT_OWNER,
  CENTRE_INVITE_RATE_LIMITED,
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

test("session staff hide Money / licence / claim; owners keep them", () => {
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
  const shown = visibleDeskNav("daycare", {
    providerSubscriptions: true,
    showPayCtas: true,
    centreOwner: true,
  }).map((i) => i.id);
  assert.equal(shown.includes("employees"), true);
  assert.equal(shown.includes("money"), true);
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

test("EN and FR-CA employee labels exist and match", () => {
  const dict = src("src/lib/copy.ts");
  for (const key of [
    "employeesTitle",
    "employeeAddTitle",
    "employeeAddSubmit",
    "employeeRoleStaff",
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
  assert.match(src("src/lib/server/centre-members.ts"), /inviteCentreEmployee/);
  assert.match(src("src/lib/server/centre-members.ts"), /revokeCentreEmployee/);
  assert.match(src("src/lib/server/centre-members.ts"), /acceptCentreInvite/);
  assert.match(src("src/lib/server/centre-members.ts"), /employee_invite/);
  assert.match(src("src/lib/server/invite-mail.ts"), /purpose: "invite"/);
  assert.match(src("src/lib/transactional-mail.ts"), /"invite"/);
  assert.match(src("src/routes/invite.$token.tsx"), /createFileRoute\("\/invite\/\$token"\)/);
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
