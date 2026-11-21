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
  staffPhoneMarkerAllowed,
  permissionChangeDetail,
  presetGrants,
} from "../src/lib/staff-permissions.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("staff preset can view bill status and cannot edit money", () => {
  assert.equal(STAFF_GRANTS.bills, "view");
  assert.equal(STAFF_GRANTS.messages, "edit");
  assert.equal(STAFF_GRANTS.calendar, "edit");
  assert.equal(STAFF_GRANTS.requests, "edit");
  assert.equal(STAFF_GRANTS.schedule, "edit");
  assert.equal(STAFF_GRANTS.children, "none");
  assert.equal(grantsForMember({ role: "staff", preset: null, permissions: null }).bills, "view");
  assert.equal(grantsForMember({ role: "staff", preset: "staff", permissions: null }).messages, "edit");
  assert.match(src("src/lib/copy-en.ts"), /Can view whether each family at this centre has paid/);
  assert.match(src("src/lib/copy-fr.ts"), /Peut voir si chaque famille de ce centre a payé/);
  assert.match(src("src/lib/copy-en.ts"), /cannot open earnings, payouts, or bank details/);
});

test("lead adds child records view; manager edits every grantable area", () => {
  assert.equal(LEAD_GRANTS.children, "view");
  assert.equal(LEAD_GRANTS.messages, "edit");
  assert.equal(LEAD_GRANTS.calendar, "edit");
  assert.equal(LEAD_GRANTS.bills, "view");
  for (const level of Object.values(MANAGER_GRANTS)) assert.equal(level, "edit");
  assert.equal(presetGrants("manager").listing, "edit");
});

test("staff can view bills at their centre, cannot edit them, and cannot see another centre", () => {
  const staff = {
    daycareId: "centre-a",
    role: "staff",
    preset: "staff",
    permissions: null,
  };
  const blocked = {
    daycareId: "centre-b",
    role: "staff",
    preset: "custom",
    permissions: { ...STAFF_GRANTS, bills: "none" },
  };
  const list = decideBillsList({ ownedIds: [], memberships: [staff, blocked] });
  assert.equal(list.ok, true);
  assert.deepEqual(list.daycareIds, ["centre-a"]);
  const edits = decideBillsList({ ownedIds: [], memberships: [staff], need: "edit" });
  assert.equal(edits.ok, false);
  assert.equal(edits.reason, "permission");

  const sameCentre = decideBillsDaycare({
    ownsTarget: false,
    membership: staff,
    hasOtherCentre: true,
    need: "view",
  });
  assert.equal(sameCentre.ok, true);
  const cannotEdit = decideBillsDaycare({
    ownsTarget: false,
    membership: staff,
    hasOtherCentre: true,
    need: "edit",
  });
  assert.equal(cannotEdit.ok, false);
  assert.equal(cannotEdit.reason, "permission");

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
    after: { ...STAFF_GRANTS, messages: "view" },
  });
  assert.match(detail, /preset staff->custom/);
  assert.match(detail, /messages edit->view/);
  assert.equal(detail.includes("password"), false);

  const hidden = visibleDeskNav("daycare", {
    centreOwner: false,
    centreGrants: { ...STAFF_GRANTS, bills: "none", messages: "none", listing: "none" },
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
  assert.equal(staffPhoneMarkerAllowed("listings", STAFF_GRANTS, false), false);
  assert.equal(staffPhoneMarkerAllowed("screening", STAFF_GRANTS, false), false);
  assert.equal(staffPhoneMarkerAllowed("hours", STAFF_GRANTS, false), true);
  assert.equal(staffPhoneMarkerAllowed("centre-documents", STAFF_GRANTS, false), true);
  assert.equal(staffPhoneMarkerAllowed("requests", STAFF_GRANTS, false), true);
  assert.equal(staffPhoneMarkerAllowed("tours", STAFF_GRANTS, false), true);
});

test("bills endpoints call the 403 guard", () => {
  const billing = src("src/lib/server/billing.ts");
  const earnings = src("src/lib/server/earnings-desk.ts");
  const invoices = src("src/lib/server/stripe-parent-invoices.ts");
  assert.match(billing, /explainBillsList/);
  assert.match(billing, /staffAreaError/);
  assert.match(billing, /assertStaffArea/);
  assert.match(earnings, /listOwnedDaycareIds/);
  assert.match(earnings, /Payouts, bank, and earnings totals are owner-only/);
  assert.doesNotMatch(earnings, /explainBillsList/);
  assert.match(invoices, /explainStaffArea/);
  assert.match(src("src/lib/server/centre-members.ts"), /employee_permissions/);
  assert.match(src("migrations/0209_staff_permissions.sql"), /permission_preset = 'staff'/);
  assert.match(src("migrations/down/0209_staff_permissions.sql"), /drop column if exists permission_preset/);
});
