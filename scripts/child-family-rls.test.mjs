import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const fixtureColumns = {
  bookings: "id text, user_id text, daycare_id text, child_id text",
  children: "id text, user_id text",
  child_care_people: "id text, child_id text",
  child_profile_access: "id text, child_id text",
  child_profile_shares: "daycare_id text, child_id text",
  child_pickup_checks: "id text, child_id text",
  immunization_files: "id text, child_id text, owner_user_id text",
  immunization_views: "id text, child_id text",
  care_medications: "id text, booking_id text, parent_user_id text, daycare_id text, child_id text",
  care_medication_logs: "id text, medication_id text, parent_user_id text, booking_id text, daycare_id text",
  attendance: "id text, booking_id text, parent_user_id text, daycare_id text",
  family_documents: "id text, user_id text",
  family_document_shares: "id text, document_id text",
};

function rowFor(table, parent) {
  const child = `child-${parent}`;
  const id = `${table}-${parent}`;
  const booking = `bookings-${parent}`;
  switch (table) {
    case "bookings": return [id, parent, "centre", child];
    case "children": return [child, parent];
    case "child_profile_shares": return ["centre", child];
    case "immunization_files": return [id, child, parent];
    case "care_medications": return [id, booking, parent, "centre", child];
    case "care_medication_logs": return [id, `care_medications-${parent}`, parent, booking, "centre"];
    case "attendance": return [id, booking, parent, "centre"];
    case "family_documents": return [id, parent];
    case "family_document_shares": return [id, `family_documents-${parent}`];
    default: return [id, child];
  }
}

test("the shadow role sees only the transaction parent's rows", async (t) => {
  const pg = new PGlite();
  t.after(() => pg.close());
  for (const [table, columns] of Object.entries(fixtureColumns)) {
    await pg.exec(`create table public.${table} (${columns})`);
    for (const parent of ["ada", "lou"]) {
      const row = rowFor(table, parent);
      const parameters = row.map((_, i) => `$${i + 1}`).join(", ");
      await pg.query(`insert into public.${table} values (${parameters})`, row);
    }
  }
  for (const name of ["001_child_family_role.sql", "002_child_family_policies.sql"]) {
    await pg.exec(readFileSync(new URL(`../migrations-rls/${name}`, import.meta.url), "utf8"));
  }

  for (const parent of ["ada", "lou", null]) {
    await pg.transaction(async (tx) => {
      await tx.exec("set local role kidease_child_family_shadow");
      if (parent) await tx.query("select set_config('app.user_id', $1, true)", [parent]);
      for (const [table, columns] of Object.entries(fixtureColumns)) {
        const firstColumn = columns.split(" ", 1)[0];
        const projection = table === "child_profile_shares" ? "child_id" : firstColumn;
        const result = await tx.query(`select ${projection} as key from public.${table}`);
        const parentRow = parent ? rowFor(table, parent) : [];
        const key = parentRow[table === "child_profile_shares" ? 1 : 0];
        assert.deepEqual(result.rows.map((row) => row.key), parent ? [key] : [], table);
      }
    });
  }

  await assert.rejects(
    pg.transaction(async (tx) => {
      await tx.exec("set local role kidease_child_family_shadow");
      await tx.query("select set_config('app.user_id', $1, true)", ["ada"]);
      await tx.exec("update public.children set user_id = user_id");
    }),
    /permission denied/,
  );
});
