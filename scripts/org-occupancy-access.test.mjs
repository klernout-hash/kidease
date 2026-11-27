import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";
import * as occupancy from "../src/lib/org-occupancy.ts";
import * as gap from "../src/lib/gap-features.ts";
import { ENROLLED_BOOKING_STATUSES } from "../src/lib/review-gate.ts";

test("occupancy report is limited to the actor's owned centres without changing staff centre switching", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table provider_daycares(daycare_id text, user_id text);
      create table centre_members(daycare_id text, user_id text, status text, role text);
      create table daycares(id text primary key, name text, city text, province text,
        licensed_capacity int, confirmed_open_spots int, spots_infant int, spots_toddler int, spots_preschool int);
      create table bookings(daycare_id text, child_id text, status text);
      create table org_centre_focus(user_id text primary key, daycare_id text, updated_at timestamptz);
      insert into daycares values ('a','Fake Maple','Synthetictown','MB',20,2,null,null,null),
        ('b','Fake Cedar','Synthetictown','MB',30,4,null,null,null),
        ('c','Fake Birch','Synthetictown','MB',40,9,null,null,null);
      insert into provider_daycares values ('a','owner'), ('b','different-owner');
      insert into centre_members values ('a','staff','active','staff'), ('a','reader','active','read_only'),
        ('a','manager','active','manager'), ('a','revoked','revoked','owner'),
        ('b','owner','active','staff'), ('c','owner','active','owner'),
        ('c','owner','active','owner');
      insert into bookings values ('a','f1','confirmed'), ('b','f2','confirmed'),
        ('b',null,'requested'), ('c',null,'waitlist');
      insert into org_centre_focus values ('owner','b',now());
    `);
    const statuses = [];
    const reportQueries = [];
    const sql = async (parts, ...params) => {
      const statement = parts.reduce((out, part, i) => out + (i ? `$${i}` : "") + part, "");
      return (await pg.query(statement, params)).rows;
    };
    sql.query = async (statement, params) => {
      reportQueries.push(params[0]);
      return (await pg.query(statement, params)).rows;
    };
    let enabled = true;
    const createServerFn = () => {
      const api = { middleware: () => api, validator: () => api, handler: (fn) => fn };
      return api;
    };
    const modules = {
      "@tanstack/react-start": { createServerFn },
      "@tanstack/react-start/server": { setResponseStatus: (status) => statuses.push(status) },
      "@/lib/db": { getSql: async () => sql },
      "@/lib/auth/middleware": { authMiddleware: Symbol() },
      "@/lib/server/centre-access": { listAccessibleDaycareIds: async () => ["a"] },
      "@/lib/features": { orgDashboardEnabled: () => enabled },
      "@/lib/review-gate": { ENROLLED_BOOKING_STATUSES },
      "@/lib/gap-features": gap,
      "@/lib/org-occupancy": occupancy,
    };
    const source = readFileSync(new URL("../src/lib/server/org-occupancy.ts", import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const handlers = {};
    new Function("require", "exports", compiled)((id) => {
      assert.ok(id in modules, id);
      return modules[id];
    }, handlers);
    const load = (userId) => handlers.listOrgOccupancy({ context: { userId } });
    for (const user of ["staff", "reader", "manager", "revoked", "unrelated"]) {
      const report = await load(user);
      assert.equal(report.denied, true, user);
      assert.deepEqual(report.sites, []);
    }
    assert.deepEqual(statuses, Array(5).fill(403));
    assert.deepEqual(reportQueries, [], "denied seats never fetch report data");
    const owner = await load("owner");
    assert.deepEqual(owner.sites.map(({ id }) => id).sort(), ["a", "c"]);
    assert.equal(owner.totals.sites, 2);
    assert.equal(owner.totals.requests, 1);
    assert.notEqual(owner.focusId, "b");
    assert.equal(reportQueries.length, 4);
    assert.ok(reportQueries.every((ids) => ids.length === 2 && ids.includes("a") && ids.includes("c")));
    assert.deepEqual((await load("different-owner")).sites.map(({ id }) => id), ["b"]);
    assert.deepEqual(await handlers.setOrgCentre({ context: { userId: "staff" }, data: { daycareId: "a" } }),
      { ok: true, daycareId: "a" });
    enabled = false;
    assert.equal((await load("staff")).enabled, false);
    assert.equal(statuses.length, 5);
  } finally {
    await pg.close();
  }
});
