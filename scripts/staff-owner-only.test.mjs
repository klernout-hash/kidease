import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { visibleDeskNav } from "../src/lib/desk-nav.ts";
import {
  STAFF_GRANTS,
  STAFF_OWNER_ONLY_DESKS,
  isStaffOnlyLogin,
  staffDeskBlocked,
  staffPhoneMarkerAllowed,
} from "../src/lib/staff-permissions.ts";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const all = { providerInsights: true, topRated: true, centreLinked: true };
const ids = (opts) => visibleDeskNav("daycare", { ...all, ...opts }).map((i) => i.id);

test("B05: staff nav hides Earnings, Insights, Families, Top Rated, Employees and Delete", () => {
  const staff = ids({ centreOwner: false, centreRole: "staff", centreGrants: STAFF_GRANTS, centreCanInvite: false });
  for (const id of ["money", "insights", "top-rated", "leads", "employees", "delete"]) {
    assert.ok(!staff.includes(id), `${id} hidden for staff`);
  }
  const readOnly = ids({ centreOwner: false, centreRole: "read_only", centreGrants: STAFF_GRANTS });
  assert.ok(!readOnly.includes("insights"));
});

test("B05: owners keep the full desk", () => {
  const owner = ids({ centreOwner: true, centreRole: "owner", centreGrants: null });
  for (const id of ["money", "insights", "top-rated"]) assert.ok(owner.includes(id), `${id} kept for owner`);
});

test("B05: managers are not staff-only", () => {
  assert.equal(isStaffOnlyLogin({ centreOwner: false, centreRole: "manager", centreCanInvite: true }), false);
  assert.equal(isStaffOnlyLogin({ centreOwner: false, centreRole: "staff", centreCanInvite: true }), false);
  assert.equal(isStaffOnlyLogin({ centreOwner: true, centreRole: "staff" }), false);
  assert.equal(isStaffOnlyLogin({ centreOwner: false, centreRole: "staff" }), true);
  assert.equal(staffDeskBlocked("messages", { centreOwner: false, centreRole: "staff" }), false);
  assert.ok(STAFF_OWNER_ONLY_DESKS.includes("money"));
});

test("B05: the staff preset has no bills access, so server bill gates refuse staff", () => {
  assert.equal(STAFF_GRANTS.bills, "none");
});

test("B05: phone menu hides owner-only markers for staff", () => {
  for (const m of ["money", "insights", "top-rated", "leads"]) {
    assert.equal(staffPhoneMarkerAllowed(m, STAFF_GRANTS, false), false, m);
  }
});

test("B05: provider desks and account delete show the owner-only screen for staff", () => {
  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /staffDesk && \(desk === "insights" \|\| desk === "top-rated" \|\| desk === "employees"\)/);
  assert.match(provider, /desk === "employees" && !staffDesk \? <CentreEmployeesPanel|desk === "employees" && !staffDesk \? \(/);
  assert.match(provider, /canBills && !staffDesk/);
  const account = src("src/routes/account.tsx");
  assert.match(account, /section === "delete" && desk === "provider" && isStaffOnlyLogin/);
});

test("B05: insights, Families and the team list are scoped to owner and manager centres server-side", () => {
  assert.match(src("src/lib/server/provider-insights.ts"), /listOwnerOrManagerDaycareIds\(sql, context\.userId\)/);
  const leads = src("src/lib/server/centre-leads.ts");
  assert.ok(!leads.includes("listAccessibleDaycareIds"));
  assert.match(src("src/lib/server/centre-members.ts"), /filter\(\(row\) => row\.role === "manager"\)/);
  assert.match(src("src/lib/server/centre-access.ts"), /row\.role === "manager" \|\| row\.preset === "manager"/);
});
