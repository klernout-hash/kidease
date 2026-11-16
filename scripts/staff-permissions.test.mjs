import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CENTRE_INVITE_NOT_OWNER } from "../src/lib/centre-roles.ts";
import { visibleDeskNav } from "../src/lib/desk-nav.ts";
import {
  LEAD_GRANTS,
  MANAGER_GRANTS,
  STAFF_AREA_DENIED,
  STAFF_GRANTS,
  decideBillsDaycare,
  decideBillsList,
  decideCentreInvite,
  decidePermissionUpdate,
  grantsForMember,
  navGrantAllows,
  permissionChangeDetail,
  presetGrants,
} from "../src/lib/staff-permissions.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("staff preset keeps today's access and does not open bills", () => {
  assert.equal(STAFF_GRANTS.bills, "none");
  assert.equal(STAFF_GRANTS.messages, "edit");
  assert.equal(STAFF_GRANTS.calendar, "edit");
  assert.equal(STAFF_GRANTS.requests, "edit");
  assert.equal(STAFF_GRANTS.schedule, "edit");
  assert.equal(STAFF_GRANTS.children, "none");
  assert.equal(grantsForMember({ role: "staff", preset: null, permissions: null }).bills, "none");
  assert.equal(grantsForMember({ role: "staff", preset: "staff", permissions: null }).messages, "edit");
});

test("lead adds child records view; manager edits every grantable area", () => {
  assert.equal(LEAD_GRANTS.children, "view");
  assert.equal(LEAD_GRANTS.messages, "edit");
  assert.equal(LEAD_GRANTS.calendar, "edit");
  assert.equal(LEAD_GRANTS.bills, "none");
  for (const level of Object.values(MANAGER_GRANTS)) assert.equal(level, "edit");
  assert.equal(presetGrants("manager").listing, "edit");
});

test("a staff member without bills gets 403, and another centre is denied", () => {
  const staff = {
    daycareId: "centre-a",
    role: "staff",
    preset: "staff",
    permissions: null,
  };
  const list = decideBillsList({ ownedIds: [], memberships: [staff] });
  assert.equal(list.ok, false);
  assert.equal(list.status, 403);
  assert.equal(list.reason, "permission");

  const sameCentre = decideBillsDaycare({
    ownsTarget: false,
    membership: staff,
    hasOtherCentre: false,
    need: "view",
  });
  assert.equal(sameCentre.ok, false);
  assert.equal(sameCentre.status, 403);

  const cross = decideBillsDaycare({
    ownsTarget: false,
    membership: null,
    hasOtherCentre: true,
    need: "view",
  });
  assert.equal(cross.ok, false);
  assert.equal(cross.status, 403);
  assert.equal(cross.reason, "cross_centre");

  const granted = {
    ...staff,
    preset: "custom",
    permissions: { ...STAFF_GRANTS, bills: "view" },
  };
  const allowed = decideBillsList({ ownedIds: [], memberships: [granted] });
  assert.equal(allowed.ok, true);
  assert.deepEqual(allowed.daycareIds, ["centre-a"]);
  const other = decideBillsDaycare({
    ownsTarget: false,
    membership: null,
    hasOtherCentre: true,
    need: "edit",
  });
  assert.equal(other.reason, "cross_centre");
  assert.equal(STAFF_AREA_DENIED.length > 0, true);
});

test("owner-only work cannot be granted, and a manager may invite staff and lead", () => {
  const custom = decidePermissionUpdate({
    actorIsOwner: true,
    targetRole: "staff",
    preset: "custom",
    grants: { ...MANAGER_GRANTS, payouts: "edit", bank: "edit", contract: "edit" },
  });
  assert.equal(custom.ok, true);
  assert.equal(custom.grants.payouts, undefined);
  assert.equal(custom.grants.bills, "edit");
  assert.equal(decidePermissionUpdate({ actorIsOwner: false, targetRole: "staff", preset: "staff", grants: null }).ok, false);
  assert.equal(decidePermissionUpdate({ actorIsOwner: true, targetRole: "owner", preset: "staff", grants: null }).ok, false);

  const managerStaff = decideCentreInvite({
    actorRole: "manager",
    actorEmail: "mgr@centre.ca",
    inviteEmail: "new@centre.ca",
    preset: "staff",
    alreadyMember: false,
    pendingInvite: false,
    hourlyCount: 0,
    dailyCount: 0,
  });
  assert.equal(managerStaff.ok, true);
  assert.equal(managerStaff.role, "staff");
  assert.equal(managerStaff.preset, "staff");
  const managerLead = decideCentreInvite({
    actorRole: "manager",
    actorEmail: "mgr@centre.ca",
    inviteEmail: "lead@centre.ca",
    preset: "lead",
    alreadyMember: false,
    pendingInvite: false,
    hourlyCount: 0,
    dailyCount: 0,
  });
  assert.equal(managerLead.ok, true);
  assert.equal(managerLead.preset, "lead");
  assert.equal(
    decideCentreInvite({
      actorRole: "manager",
      actorEmail: "mgr@centre.ca",
      inviteEmail: "boss@centre.ca",
      preset: "manager",
      alreadyMember: false,
      pendingInvite: false,
      hourlyCount: 0,
      dailyCount: 0,
    }).error,
    CENTRE_INVITE_NOT_OWNER,
  );
});

test("permission changes name who changed what, and the nav hides a closed area", () => {
  const detail = permissionChangeDetail({
    presetFrom: "staff",
    presetTo: "custom",
    before: STAFF_GRANTS,
    after: { ...STAFF_GRANTS, bills: "view" },
  });
  assert.match(detail, /preset staff->custom/);
  assert.match(detail, /bills none->view/);
  assert.equal(detail.includes("password"), false);

  const hidden = visibleDeskNav("daycare", {
    centreOwner: false,
    centreGrants: { ...STAFF_GRANTS, messages: "none", listing: "none" },
  }).map((item) => item.id);
  assert.equal(hidden.includes("money"), false);
  assert.equal(hidden.includes("messages"), false);
  assert.equal(hidden.includes("listings"), false);
  assert.equal(hidden.includes("licence"), false);
  assert.equal(hidden.includes("contract"), false);
  assert.equal(hidden.includes("requests"), true);
  assert.equal(navGrantAllows(MANAGER_GRANTS, "money"), true);

  const billsNav = visibleDeskNav("daycare", {
    centreOwner: false,
    centreGrants: { ...STAFF_GRANTS, bills: "view" },
    centreCanInvite: false,
  }).map((item) => item.id);
  assert.equal(billsNav.includes("money"), true);
  assert.equal(billsNav.includes("employees"), false);
});

test("bills endpoints call the 403 guard", () => {
  const billing = src("src/lib/server/billing.ts");
  const earnings = src("src/lib/server/earnings-desk.ts");
  const invoices = src("src/lib/server/stripe-parent-invoices.ts");
  assert.match(billing, /explainBillsList/);
  assert.match(billing, /staffAreaError/);
  assert.match(billing, /assertStaffArea/);
  assert.match(earnings, /explainBillsList/);
  assert.match(earnings, /reason === "permission"/);
  assert.match(invoices, /explainStaffArea/);
  assert.match(src("src/lib/server/centre-members.ts"), /employee_permissions/);
  assert.match(src("migrations/0209_staff_permissions.sql"), /permission_preset = 'staff'/);
  assert.match(src("migrations/down/0209_staff_permissions.sql"), /drop column if exists permission_preset/);
});
