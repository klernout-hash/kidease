import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";
import * as subsidyRules from "../src/lib/wiring/subsidy-status.ts";

test("only an active centre owner changes their centre's synthetic subsidy and triggers its notice", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table daycares(id text primary key);
      create table provider_daycares(daycare_id text, user_id text);
      create table centre_members(daycare_id text, user_id text, status text, role text);
      create table subsidy_cases(id text primary key, parent_user_id text, daycare_id text, province text, status text, updated_at timestamptz);
      insert into daycares values ('a'), ('b');
      insert into provider_daycares values ('a','owner-a'),('b','owner-b');
      insert into centre_members values ('a','staff-a','active','staff'),
        ('a','reader-a','active','read_only'), ('a','manager-a','active','manager'),
        ('a','retired-owner','revoked','owner'), ('a','member-owner','active','owner');
      insert into subsidy_cases values ('case-a','fake-parent','a','MB','submitted',null);
    `);
    const HTTP = [];
    const notices = [];
    const caseReads = [];
    let revokeBeforeWrite = false;
    const sql = async (parts, ...params) => {
      const query = parts.map((part, i) => (i ? `$${i}` : "") + part).join("");
      if (/select .*from subsidy_cases/i.test(query)) caseReads.push(query);
      if (revokeBeforeWrite && /update subsidy_cases/i.test(query)) {
        revokeBeforeWrite = false;
        await pg.exec(
          "update centre_members set status = 'revoked' where user_id = 'member-owner'",
        );
      }
      return (await pg.query(query, params)).rows;
    };
    const createServerFn = () => {
      const api = { middleware: () => api, validator: () => api, handler: (fn) => fn };
      return api;
    };
    const modules = {
      "@tanstack/react-start": { createServerFn },
      "@tanstack/react-start/server": { setResponseStatus: (value) => HTTP.push(value) },
      "@/lib/auth/middleware": {},
      "@/lib/auth/gov-middleware": {},
      "@/lib/db": { getSql: async () => sql },
      "@/lib/server/gov-actor.server": {},
      "@/lib/wiring/subsidy-status": { ...subsidyRules, subsidyStatusEnabled: () => true },
      "@/lib/server/wiring/runtime": { deliverNotice: async (note) => notices.push(note) },
    };
    const source = readFileSync(
      new URL("../src/lib/server/wiring/subsidy-status.ts", import.meta.url),
      "utf8",
    );
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    new Function("require", "exports", compiled)((id) => {
      assert.ok(id in modules, id);
      return modules[id];
    }, exports);
    const update = (actor) =>
      exports.updateSubsidy({
        context: { userId: actor },
        data: { id: "case-a", status: "in_review" },
      });
    for (const role of ["staff-a", "reader-a", "manager-a", "retired-owner", "unrelated-account"]) {
      assert.deepEqual(await update(role), { ok: false, error: "owner" }, role);
    }
    assert.deepEqual(HTTP, [403, 403, 403, 403, 403]);
    assert.equal(caseReads.length, 0, "non-owners must not read the case before denial");
    assert.equal(notices.length, 0);
    assert.deepEqual(await update("owner-b"), { ok: false, error: "missing" });
    assert.equal(notices.length, 0, "another centre cannot trigger a notice");
    assert.equal((await pg.query("select status from subsidy_cases")).rows[0].status, "submitted");
    assert.deepEqual(await update("owner-a"), { ok: true, status: "in_review" });
    assert.equal((await pg.query("select status from subsidy_cases")).rows[0].status, "in_review");
    assert.equal(notices.length, 1);
    assert.equal(notices[0].userId, "fake-parent");
    await pg.exec("update subsidy_cases set status = 'submitted'");
    assert.deepEqual(await update("member-owner"), { ok: true, status: "in_review" });
    assert.equal(notices.length, 2);
    await pg.exec("update subsidy_cases set status = 'submitted'");
    revokeBeforeWrite = true;
    assert.deepEqual(await update("member-owner"), { ok: false, error: "changed" });
    assert.equal((await pg.query("select status from subsidy_cases")).rows[0].status, "submitted");
    assert.equal(notices.length, 2, "owner revoked after lookup must not trigger a notice");
  } finally {
    await pg.close();
  }
});
