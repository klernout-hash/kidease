import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { canReadChildHealth, healthLogFields } from "../src/lib/child-health-access.ts";
import { isKidEaseOperatorEmail, KIDEASE_OPERATOR_EMAIL } from "../src/lib/admin-email.ts";

function load(file, dependencies) {
  const source = readFileSync(new URL(`../src/lib/server/${file}.ts`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("require", "exports", output)((name) => {
    assert.ok(Object.hasOwn(dependencies, name), name);
    return dependencies[name];
  }, exports);
  return exports;
}

function createServerFn() {
  let validate = (input) => input;
  const builder = {
    middleware: () => builder,
    validator(fn) {
      validate = fn;
      return builder;
    },
    handler: (fn) => (context, input) => fn({ context, data: validate(input) }),
  };
  return builder;
}

test("Admin health reads audit each record and fail closed if the audit write fails", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table children (
        id text primary key, name text, immunization_status text, immunization_note text,
        allergies text, medications text
      );
      create table child_profile_access (id text primary key, child_id text, actor_id text, action text, daycare_id text);
      insert into children values ('child', 'Sample child', 'on file', null, 'saved allergy', null);
    `);
    const sql = async (strings, ...values) => {
      const query = strings.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, "");
      return (await pg.query(query, values)).rows;
    };
    let auditNumber = 0;
    const audit = load("child-access-log", { "@/lib/utils": { nid: () => String(++auditNumber) } });
    const { readAdminChildHealth } = load("child-health-log", {
      "@tanstack/react-start": { createServerFn },
      "@/lib/auth/middleware": { authMiddleware: Symbol("authenticated") },
      "@/lib/db": { getSql: async () => sql },
      "@/lib/child-health-crypto": { openHealth: (value) => value },
      "@/lib/child-health-access": { canReadChildHealth, healthLogFields },
      "@/lib/server/child-access-log": audit,
      "@/lib/admin-email": { isKidEaseOperatorEmail },
      "@/lib/server/roles": {
        requireAdmin: async (userId) => ({
          email: userId === "operator" ? KIDEASE_OPERATOR_EMAIL : "external@example.test",
          emailVerified: true,
        }),
      },
    });

    await assert.rejects(readAdminChildHealth({ userId: "other-admin" }, {
      childId: "child", designatedAdmin: true,
    }), /Not authorized/);
    assert.equal((await pg.query("select count(*)::int as n from child_profile_access")).rows[0].n, 0);

    const actor = { userId: "operator" };
    const read = await readAdminChildHealth(actor, { childId: "child" });
    assert.equal(read.allergies, "saved allergy");
    const forgedWrite = await readAdminChildHealth(actor, { childId: "child", allergies: "attempted replacement" });
    assert.equal(forgedWrite.allergies, "saved allergy");
    assert.deepEqual((await pg.query("select child_id, actor_id, action from child_profile_access order by id")).rows, [
      { child_id: "child", actor_id: "operator", action: "read" },
      { child_id: "child", actor_id: "operator", action: "read" },
    ]);

    await pg.exec("drop table child_profile_access");
    await assert.rejects(readAdminChildHealth(actor, { childId: "child" }), /child_profile_access/);
    assert.deepEqual((await pg.query("select allergies from children")).rows, [{ allergies: "saved allergy" }]);
  } finally {
    await pg.close();
  }
});
