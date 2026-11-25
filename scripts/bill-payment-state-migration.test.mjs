import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const sql = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");

test("0231 adds payment state columns and payment_mandates, and its down file removes them", async () => {
  const pg = new PGlite();
  await pg.exec(`create table invoices (id text primary key, status text not null default 'sent');`);
  await pg.exec(`insert into invoices (id) values ('bill_fake_1');`);
  await pg.exec(sql("0231_bill_payment_state.sql"));
  // Re-running is safe.
  await pg.exec(sql("0231_bill_payment_state.sql"));
  await pg.query(`update invoices set payment_state = 'processing', processing_at = now() where id = 'bill_fake_1'`);
  await assert.rejects(pg.query(`update invoices set payment_state = 'paid' where id = 'bill_fake_1'`));
  await pg.query(
    `insert into payment_mandates (mandate_id, payment_method_id, user_id, status, type) values ('mandate_fake', 'pm_fake', null, 'active', 'acss_debit')`,
  );
  const row = await pg.query(`select payment_state, livemode from invoices, payment_mandates limit 1`);
  assert.equal(row.rows[0].payment_state, "processing");
  assert.equal(row.rows[0].livemode, false);
  await pg.exec(sql("down/0231_bill_payment_state.sql"));
  const table = await pg.query(`select to_regclass('payment_mandates') as name`);
  assert.equal(table.rows[0].name, null);
  const cols = await pg.query(`select column_name from information_schema.columns where table_name = 'invoices' order by column_name`);
  assert.deepEqual(cols.rows.map((r) => r.column_name), ["id", "status"]);
  await pg.close();
});
