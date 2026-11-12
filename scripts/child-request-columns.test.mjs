import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * A daycare approves a request against the same child file the parent filled in.
 * Any query that loads a full child row for that check must read the immunization
 * and address columns, or the daycare sees them as missing.
 */
test("every full child-row query reads immunization and home address", () => {
  for (const file of ["../src/lib/server/enrol-queue.ts", "../src/lib/server/family.ts"]) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    const selects = src.match(/select id, name, preferred_name, birthdate[\s\S]*?from children/g) ?? [];
    assert.ok(selects.length >= 1, `${file} has no full child query`);
    for (const sql of selects) {
      for (const column of ["immunization_status", "immunization_note", "home_address", "doctor_name"]) {
        assert.ok(sql.includes(column), `${file}: a child query is missing ${column}`);
      }
    }
  }
});
