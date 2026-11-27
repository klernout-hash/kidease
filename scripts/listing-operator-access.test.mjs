import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";
import { centreCanCreateListing } from "../src/lib/centre-roles.ts";

const source = (file) => readFileSync(new URL(`../src/lib/server/${file}.ts`, import.meta.url), "utf8");

test("first-time operators and owners can proceed; active membership alone cannot add or claim", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table provider_daycares(user_id text);
      create table centre_members(user_id text, status text, role text);
      insert into provider_daycares values ('canonical-owner'), ('mixed-role');
      insert into centre_members values ('staff','active','staff'),('reader','active','read_only'),
        ('manager','active','manager'),('member-owner','active','owner'),
        ('former-staff','revoked','staff'),('mixed-role','active','staff'),
        ('revoked-owner-with-current-staff-seat','revoked','owner'),
        ('revoked-owner-with-current-staff-seat','active','staff');
    `);
    const response = [];
    const modules = {
      "@tanstack/react-start/server": { setResponseStatus: (code) => response.push(code) },
      "@/lib/centre-roles": { centreCanCreateListing },
    };
    const { outputText } = ts.transpileModule(source("listing-owner-access"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const handlers = {};
    new Function("require", "exports", outputText)((id) => {
      assert.ok(id in modules, id);
      return modules[id];
    }, handlers);
    const sql = async (strings, ...values) =>
      (await pg.query(strings.map((s, i) => (i ? `$${i}` : "") + s).join(""), values)).rows;
    for (const actor of ["canonical-owner", "member-owner", "mixed-role", "new-operator", "former-staff"]) {
      await handlers.assertListingOperator(sql, actor, "Owner only");
    }
    for (const actor of ["staff", "reader", "manager", "revoked-owner-with-current-staff-seat"]) {
      await assert.rejects(handlers.assertListingOperator(sql, actor, "Owner only"), { message: "Owner only", status: 403 });
    }
    assert.deepEqual(response, [403, 403, 403, 403]);
  } finally {
    await pg.close();
  }
});

test("listing and claim write entry points gate before each side-effect path", () => {
  function handlerBody(file, name) {
    const code = source(file);
    const start = code.indexOf(`export const ${name} =`);
    assert.notEqual(start, -1);
    const end = code.indexOf("\nexport const ", start + 1);
    return end === -1 ? code.slice(start) : code.slice(start, end);
  }
  for (const [file, name, effect] of [
    ["family", "createListing", "assertNewListingAllowed"],
    ["claims", "startClaim", "catalogByIdGet(daycareId)"],
    ["claims", "verifyClaim", "assertTurnstileToken(data.turnstileToken)"],
    ["claims", "saveClaimFees", "from listing_claims"],
  ]) {
    const handler = handlerBody(file, name);
    const gate = handler.indexOf("await assertListingOperator(sql, context.userId");
    assert.ok(gate >= 0 && handler.indexOf(effect) > gate, name);
  }
  for (const name of ["searchClaimable", "previewClaimTarget"]) {
    assert.doesNotMatch(handlerBody("claims", name), /assertListingOperator/);
  }
});
