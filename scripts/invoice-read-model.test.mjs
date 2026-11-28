import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { INVOICE_READ_MODEL_SQL } from "../src/lib/invoice-read-model.ts";

test("invoice read model returns integer cents and one settlement state", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create table invoices (
        id text, status text, amount_cents int, total numeric,
        platform_fee_cents int, platform_fee numeric, net_cents int,
        refunded_cents int, refund_state text
      );
      insert into invoices values
        ('legacy', 'sent', null, 412.505, null, 10.25, null, null, null),
        ('paid', 'paid', 2000, 88, 100, 88, 1900, null, null),
        ('partial', 'paid', 2000, null, 100, null, null, 500, 'partly_refunded'),
        ('full', 'paid', 2000, null, 100, null, null, 2000, null),
        ('zero', 'paid', 0, 2000, 0, null, 0, null, null);
    `);
    const { rows } = await pg.query(`
      select id, settlement_status, read_amount_cents, read_net_cents, received_cents
      from ${INVOICE_READ_MODEL_SQL} i order by id
    `);
    assert.deepEqual(rows.map(Object.values), [
      ["full", "refunded", 2000, 0, 0],
      ["legacy", "unpaid", 41251, 40226, 41251],
      ["paid", "paid", 2000, 1900, 2000],
      ["partial", "partial", 2000, 1400, 1500],
      ["zero", "paid", 0, 0, 0],
    ]);
  } finally {
    await pg.close();
  }
});
