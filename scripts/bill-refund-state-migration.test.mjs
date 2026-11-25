import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const sql = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");

test("0232 adds refund columns beside status, and its down file removes them", async () => {
  const pg = new PGlite();
  await pg.exec(`create table invoices (id text primary key, status text not null default 'paid');`);
  await pg.exec(`insert into invoices (id) values ('bill_fake_1');`);
  await pg.exec(sql("0232_bill_refund_state.sql"));
  await pg.exec(sql("0232_bill_refund_state.sql"));
  await pg.query(`update invoices set refunded_cents = 50, refund_state = 'partly_refunded', refunded_at = now() where id = 'bill_fake_1'`);
  await assert.rejects(pg.query(`update invoices set refund_state = 'half' where id = 'bill_fake_1'`));
  const row = await pg.query(`select status, refunded_cents from invoices where id = 'bill_fake_1'`);
  assert.equal(row.rows[0].status, "paid");
  assert.equal(row.rows[0].refunded_cents, 50);
  await pg.exec(sql("down/0232_bill_refund_state.sql"));
  const cols = await pg.query(`select column_name from information_schema.columns where table_name = 'invoices' order by column_name`);
  assert.deepEqual(cols.rows.map((r) => r.column_name), ["id", "status"]);
  await pg.close();
});
