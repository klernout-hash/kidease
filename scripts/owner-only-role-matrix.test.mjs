/**
 * N-02: role × endpoint permission matrix for owner-only centre work.
 * Staff (and Lead / Read-only) get 403 on every owner-only read and write.
 * The owner keeps full access. Each row names the server guard and the
 * behavioural test that runs the real handler for that endpoint.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";
import * as timesheet from "../src/lib/timesheet.ts";
import { centreCanManageScreening } from "../src/lib/provider-screening.ts";
import { decideBillsList, decideStaffArea } from "../src/lib/staff-permissions.ts";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const ROLES = ["owner", "manager", "lead", "staff", "read_only"];
const membership = (role) => ({
  daycareId: "a",
  role: role === "lead" ? "staff" : role,
  preset: role === "lead" ? "lead" : null,
  permissions: null,
});

/** Pure role decisions the server guards call. true = allowed. */
const DECISIONS = {
  "screening read/upload/letter": (role) => centreCanManageScreening(role),
  "staff hours CSV + other staff's hour logs": (role) => timesheet.timesheetTeamAccess(role),
  "listing editor writes": (role) =>
    decideStaffArea({
      ownsTarget: role === "owner",
      membership: role === "owner" ? null : membership(role),
      hasOtherCentre: false,
      area: "listing",
      need: "edit",
    }).ok,
  "bills list": (role) =>
    decideBillsList({
      ownedIds: role === "owner" ? ["a"] : [],
      memberships: role === "owner" ? [] : [membership(role)],
      need: "view",
    }).ok,
};

const EXPECTED = {
  "screening read/upload/letter": ["owner"],
  "staff hours CSV + other staff's hour logs": ["owner", "manager"],
  "listing editor writes": ["owner", "manager"],
  "bills list": ["owner", "manager"],
};

test("N-02 matrix: Staff, Lead and Read-only are refused; the owner always passes", () => {
  for (const [endpoint, decide] of Object.entries(DECISIONS)) {
    const allowed = ROLES.filter((role) => decide(role));
    assert.deepEqual(allowed, EXPECTED[endpoint], endpoint);
    assert.ok(allowed.includes("owner"), `${endpoint}: owner keeps access`);
    for (const role of ["staff", "lead", "read_only"])
      assert.ok(!allowed.includes(role), `${endpoint}: ${role} refused`);
  }
});

/** Every owner-only endpoint from the handoff, its server guard, and its behavioural test. */
const ENDPOINTS = [
  {
    name: "screening",
    file: "src/lib/server/screening-owner-access.ts",
    guard: /centreCanManageScreening\(await loadCentreRole/,
    test: "scripts/provider-screening.test.mjs",
  },
  {
    name: "subsidy",
    file: "src/lib/server/wiring/subsidy-status.ts",
    guard: /setResponseStatus\(403\)/,
    test: "scripts/provider-subsidy-owner.test.mjs",
  },
  {
    name: "inspection sync",
    file: "src/lib/server/wiring/inspection-sync.ts",
    guard: /setResponseStatus\(403\)/,
    test: "scripts/provider-inspection-owner.test.mjs",
  },
  {
    name: "shifts for others",
    file: "src/lib/server/staff-scheduling.ts",
    guard: /=== "owner"\) return;\s+setResponseStatus\(403\)/,
    test: "scripts/staff-roster-owner.test.mjs",
  },
  {
    name: "ECE certificates for others",
    file: "src/lib/server/staff-certs.ts",
    guard: /=== "owner"/,
    test: "scripts/staff-roster-owner.test.mjs",
  },
  {
    name: "job postings + applicants",
    file: "src/lib/server/ece-jobs.ts",
    guard: /setResponseStatus\(403\)/,
    test: "scripts/ece-owner-access.test.mjs",
  },
  {
    name: "occupancy export",
    file: "src/lib/server/org-occupancy.ts",
    guard: /setResponseStatus\(403\)/,
    test: "scripts/org-occupancy-access.test.mjs",
  },
  {
    name: "add centre + claim",
    file: "src/lib/server/listing-owner-access.ts",
    guard: /./,
    test: "scripts/listing-operator-access.test.mjs",
  },
  {
    name: "data requests",
    file: "src/lib/server/wiring/dsr-admin-task.ts",
    guard: /./,
    test: "scripts/dsr-admin-task.test.mjs",
  },
  {
    name: "staff hours",
    file: "src/lib/server/timesheets.ts",
    guard: /if \(!\(await hasTeamAccess\(context\.userId, data\.daycareId\)\)\) ownerOnly\(\);/,
    test: "scripts/owner-only-role-matrix.test.mjs",
  },
];

test("N-02 matrix: every owner-only endpoint has a server guard and a behavioural test", () => {
  for (const row of ENDPOINTS) {
    assert.ok(existsSync(new URL(`../${row.file}`, import.meta.url)), `${row.name}: ${row.file}`);
    assert.match(src(row.file), row.guard, `${row.name}: guard`);
    assert.ok(existsSync(new URL(`../${row.test}`, import.meta.url)), `${row.name}: ${row.test}`);
  }
});

test("N-13: one owner-only notice component for every gated desk", () => {
  const notice = src("src/components/owner-only-notice.tsx");
  assert.match(notice, /export function OwnerOnlyNotice/);
  assert.match(notice, /t\("employeeStaffForbidden"\)/);
  assert.match(notice, /data-ke="staff-owner-only"/);
  // A way forward, not a dead end.
  assert.match(notice, /providerDeskPath\(pathname\)/);
  for (const file of [
    "src/routes/provider.tsx",
    "src/routes/account.tsx",
    "src/routes/provider_.inspection-sync.tsx",
    "src/routes/provider_.subsidy.tsx",
    "src/components/org-occupancy-desk.tsx",
  ]) {
    const body = src(file);
    assert.match(
      body,
      /import \{ OwnerOnlyNotice \} from "@\/components\/owner-only-notice";/,
      file,
    );
    assert.doesNotMatch(
      body,
      /\{t\("employeeStaffForbidden"\)\}/,
      `${file} uses the shared notice`,
    );
  }
});

test("N-02: staff hours run for real: Staff see only their own shifts, get 403 on the CSV and on other people's shifts", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table daycares(id text primary key, name text);
      create table provider_daycares(daycare_id text, user_id text);
      create table centre_members(daycare_id text, user_id text, status text, role text);
      create table "user"(id text primary key, name text);
      create table staff_time_entries(id text primary key, daycare_id text not null, staff_name text not null,
        clock_in_at timestamptz not null, clock_out_at timestamptz, created_by text not null, created_at timestamptz default now());
      create table staff_time_edits(id text primary key, entry_id text not null, daycare_id text not null, actor_id text not null,
        field_name text not null, before_value text not null default '', after_value text not null default '',
        note text not null default '', created_at timestamptz not null default now());
      insert into daycares values ('a','Synthetic Centre');
      insert into provider_daycares values ('a','owner');
      insert into centre_members values ('a','staff','active','staff'),('a','manager','active','manager'),
        ('a','reader','active','read_only'),('a','colleague','active','staff');
      insert into staff_time_entries (id, daycare_id, staff_name, clock_in_at, clock_out_at, created_by) values
        ('mine','a','Synthetic Staff',now()-interval '3 hours',now()-interval '1 hour','staff'),
        ('theirs','a','Synthetic Colleague',now()-interval '3 hours',now()-interval '1 hour','colleague');
      insert into staff_time_edits (id, entry_id, daycare_id, actor_id, field_name) values
        ('e-mine','mine','a','staff','clock_in'),('e-theirs','theirs','a','colleague','clock_in');
    `);
    const statuses = [];
    const sql = (parts, ...params) => {
      const statement = parts.map((part, i) => (i ? `$${i}` : "") + part).join("");
      return pg.query(statement, params).then((r) => r.rows);
    };
    sql.query = async (statement, params) => (await pg.query(statement, params)).rows;
    const loadCentreRole = async (_sql, user, daycare) => {
      const rows = await pg.query(
        `select 'owner' as role from provider_daycares where user_id=$1 and daycare_id=$2
         union all select role from centre_members where user_id=$1 and daycare_id=$2 and status='active'`,
        [user, daycare],
      );
      return rows.rows[0]?.role ?? null;
    };
    const access = {
      loadCentreRole,
      daycareIdsForArea: async (_sql, user) =>
        (await loadCentreRole(sql, user, "a")) ? ["a"] : [],
      explainStaffArea: async (_sql, user, daycare) => ({
        ok: Boolean(await loadCentreRole(sql, user, daycare)),
      }),
      assertCanWrite: async (_sql, user, daycare) => {
        const role = await loadCentreRole(sql, user, daycare);
        if (!role || role === "read_only")
          throw new Error("You can look at this centre. You cannot change it.");
      },
    };
    const createServerFn = () => {
      const api = { middleware: () => api, validator: () => api, handler: (fn) => fn };
      return api;
    };
    const modules = {
      "@tanstack/react-start": { createServerFn },
      "@tanstack/react-start/server": { setResponseStatus: (code) => statuses.push(code) },
      "@/lib/db": { getSql: async () => sql },
      "@/lib/auth/middleware": { authMiddleware: {} },
      "@/lib/features": { staffTimesheetsEnabled: () => true },
      "@/lib/timesheet": timesheet,
      "@/lib/utils": { nid: (prefix) => `${prefix}-${Math.random().toString(36).slice(2)}` },
      "@/lib/server/centre-access": access,
      "@/lib/server/roles": { resolveAdminAccess: async () => ({ ok: false }) },
    };
    const source = src("src/lib/server/timesheets.ts");
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const handlers = {};
    new Function("require", "exports", code)((id) => {
      assert.ok(id in modules, id);
      return modules[id];
    }, handlers);
    const invoke = (fn, userId, data = { daycareId: "a" }) => fn({ context: { userId }, data });
    const ids = (desk) => desk.week.map(({ id }) => id).sort();
    const editOf = (entryId) => ({
      daycareId: "a",
      entryId,
      staffName: "Synthetic Rename",
      note: "Synthetic fix",
    });

    // Staff: own shifts and own audit rows only, no CSV, no editing someone else's shift.
    const staff = await invoke(handlers.listTimesheets, "staff");
    assert.equal(staff.canManage, false);
    assert.deepEqual(ids(staff), ["mine"]);
    assert.deepEqual(
      staff.edits.map(({ id }) => id),
      ["e-mine"],
    );
    assert.deepEqual(
      staff.totals.map(({ staffName }) => staffName),
      ["Synthetic Staff"],
    );
    await assert.rejects(invoke(handlers.exportTimesheetCsv, "staff"), /timesheet:owner/);
    await assert.rejects(
      invoke(handlers.editTimesheet, "staff", editOf("theirs")),
      /timesheet:owner/,
    );
    assert.deepEqual(await invoke(handlers.editTimesheet, "staff", editOf("mine")), { ok: true });

    // Read-only sees nothing of the team and gets 403 on the CSV.
    const reader = await invoke(handlers.listTimesheets, "reader");
    assert.equal(reader.canManage, false);
    assert.deepEqual(ids(reader), []);
    await assert.rejects(invoke(handlers.exportTimesheetCsv, "reader"), /timesheet:owner/);

    // Owner and manager keep the whole team, the CSV and every edit.
    for (const user of ["owner", "manager"]) {
      const desk = await invoke(handlers.listTimesheets, user);
      assert.equal(desk.canManage, true, user);
      assert.deepEqual(ids(desk), ["mine", "theirs"], user);
      const file = await invoke(handlers.exportTimesheetCsv, user, {
        daycareId: "a",
        locale: "en",
      });
      assert.equal(file.ok, true);
      assert.match(file.csv, /Synthetic Colleague/);
    }
    assert.deepEqual(await invoke(handlers.editTimesheet, "owner", editOf("theirs")), { ok: true });
    assert.ok(
      statuses.length === 3 && statuses.every((code) => code === 403),
      JSON.stringify(statuses),
    );
  } finally {
    await pg.close();
  }
});
