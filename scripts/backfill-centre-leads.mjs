/**
 * Copy existing inquiries, tours, waitlist rows, and applications into centre_leads.
 * Data only. This does not send mail, text, or push.
 *
 *   DATABASE_URL=... node --experimental-strip-types scripts/backfill-centre-leads.mjs
 */
if (!process.env.DATABASE_URL && process.env.POSTGRES_URL) {
  process.env.DATABASE_URL = process.env.POSTGRES_URL;
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

import pg from "pg";
const { backfillCentrePipeline } = await import("../src/lib/server/lead-intake-write.ts");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const sql = async (strings, ...values) => {
  let text = "";
  for (let i = 0; i < strings.length; i += 1) {
    text += strings[i];
    if (i < values.length) text += `$${i + 1}`;
  }
  const result = await client.query(text, values.map((value) => (value === undefined ? null : value)));
  return result.rows;
};
try {
  const counts = await backfillCentrePipeline(sql);
  console.log(JSON.stringify(counts));
} finally {
  await client.end();
}
