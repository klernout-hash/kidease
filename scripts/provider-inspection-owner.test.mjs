import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";
import * as inspectionRules from "../src/lib/wiring/inspection-sync.ts";

test("inspection desk summaries are owner-scoped; public summaries remain readable", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table daycares(id text primary key, province text, license_number text);
      create table provider_daycares(daycare_id text, user_id text);
      create table centre_members(daycare_id text, user_id text, status text, role text);
      create table listing_inspections(province text, licence_number text, inspected_on text,
        outcome text, summary text, source_url text);
      insert into daycares values ('a','MB','fake-a'), ('b','MB','fake-b'), ('c','MB',null);
      insert into provider_daycares values ('a','owner-a'), ('b','owner-b'), ('c','owner-c');
      insert into centre_members values ('a','staff','active','staff'), ('a','reader','active','read_only'),
        ('a','manager','active','manager'), ('a','revoked','revoked','owner'),
        ('a','member-owner','active','owner'), ('b','owner-a','active','staff');
      insert into listing_inspections values ('MB','fake-a','2026-11-01','compliant','Synthetic record',
        'https://example.invalid/inspection');
    `);
    const statuses = [];
    let inspectionReads = 0;
    const sql = async (parts, ...params) => {
      const query = parts.map((part, i) => (i ? `$${i}` : "") + part).join("");
      if (query.includes("from listing_inspections")) inspectionReads += 1;
      return (await pg.query(query, params)).rows;
    };
    const createServerFn = () => {
      const api = { middleware: () => api, validator: () => api, handler: (fn) => fn };
      return api;
    };
    const authMiddleware = Symbol();
    const govAuthMiddleware = Symbol();
    const calls = [];
    const trackedServerFn = () => {
      const api = createServerFn();
      api.middleware = (list) => { calls.push(list); return api; };
      return api;
    };
    let enabled = true;
    const modules = {
      "@tanstack/react-start": { createServerFn: trackedServerFn },
      "@tanstack/react-start/server": { setResponseStatus: (status) => statuses.push(status) },
      "@/lib/auth/middleware": { authMiddleware },
      "@/lib/auth/gov-middleware": { govAuthMiddleware },
      "@/lib/db": { getSql: async () => sql },
      "@/lib/server/gov-actor.server": {},
      "@/lib/wiring/inspection-sync": { ...inspectionRules, inspectionSyncEnabled: () => enabled },
      "@/lib/server/wiring/runtime": {},
    };
    const source = readFileSync(new URL("../src/lib/server/wiring/inspection-sync.ts", import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const handlers = {};
    new Function("require", "exports", compiled)((id) => {
      assert.ok(id in modules, id);
      return modules[id];
    }, handlers);
    assert.deepEqual(calls, [[govAuthMiddleware], [authMiddleware]]);
    const summary = (userId, daycareId = "a") =>
      handlers.centreInspectionSummary({ context: { userId }, data: { daycareId } });
    for (const actor of ["staff", "reader", "manager", "revoked", "unrelated", "owner-b"]) {
      assert.deepEqual(await summary(actor), { enabled: true, summary: null });
    }
    assert.deepEqual(await summary("owner-a", "b"), { enabled: true, summary: null });
    assert.deepEqual(await summary("owner-a", "missing"), { enabled: true, summary: null });
    assert.deepEqual(statuses, Array(8).fill(403));
    assert.equal(inspectionReads, 0);
    assert.equal((await summary("owner-a")).summary.summary, "Synthetic record");
    assert.equal((await summary("member-owner")).summary.summary, "Synthetic record");
    assert.deepEqual(await summary("owner-c", "c"), { enabled: true, summary: null });
    assert.equal(statuses.length, 8);
    assert.equal((await handlers.publicInspectionSync({ data: { province: "MB", licence: "fake-a" } }))
      .summary.summary, "Synthetic record");
    enabled = false;
    assert.deepEqual(await summary("owner-a"), { enabled: false, summary: null });
    assert.equal(inspectionReads, 3);
  } finally {
    await pg.close();
  }
});
