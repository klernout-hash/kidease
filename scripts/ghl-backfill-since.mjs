#!/usr/bin/env node
/**
 * One-off: send KidEase users created since a timestamp to GoHighLevel.
 * Not run by CI, migrate, or deploy. Opportunity create is dedupe-safe
 * (search by location_id / pipeline_id / contact_id). Default is dry-run.
 *
 *   node --experimental-strip-types scripts/ghl-backfill-since.mjs --since 2026-09-24T17:34:00Z
 *   node --experimental-strip-types scripts/ghl-backfill-since.mjs --since 2026-09-24T17:34:00Z --send
 *
 * --dry-run is the default. Pass --send to POST. --dry-run wins if both are set.
 * Does not stamp profiles.crm_signup_at / crm_provider_at. The app still sends
 * the admin new-account notice once; a repeat opportunity stays "exists".
 */
import { pathToFileURL } from "node:url";
import pg from "pg";
import { postGhlCrmSignup } from "../src/lib/ghl-api.ts";

export const BACKFILL_USERS_SQL = `
select u.id as user_id,
       u.email,
       coalesce(nullif(btrim(p.display_name), ''), u.name) as name,
       p.phone,
       coalesce(p.role, 'parent') as role,
       u."createdAt" as created_at,
       d.name as company,
       d.is_test
from "user" u
left join profiles p on p.user_id = u.id
left join lateral (
  select dc.name, dc.is_test
  from provider_daycares pd
  join daycares dc on dc.id = pd.daycare_id
  where pd.user_id = u.id
  order by dc.created_at desc nulls last
  limit 1
) d on true
where u."createdAt" >= $1
order by u."createdAt" asc
`;

export function listingIsTest(value) {
  return value === true || value === 1 || value === "1";
}

export function parseBackfillArgs(argv) {
  const sinceIdx = argv.indexOf("--since");
  const raw = sinceIdx >= 0 ? argv[sinceIdx + 1] : "";
  if (!raw || raw.startsWith("--")) {
    throw new Error("Pass --since <ISO timestamp>. Example: --since 2026-09-24T17:34:00Z");
  }
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) throw new Error(`Invalid --since timestamp: ${raw}`);
  const dryRun = !argv.includes("--send") || argv.includes("--dry-run");
  return { since: new Date(ms).toISOString(), dryRun };
}

/**
 * Parent signup for every account. Provider signup when the role is provider
 * or they already have a listing. Test listings keep the qa:test tag.
 */
export function planBackfillEvents(row) {
  const email = String(row.email || "").trim();
  if (!email) return [];
  const name = String(row.name || "").trim();
  const phone = String(row.phone || "").trim();
  const company = String(row.company || "").trim();
  const role = String(row.role || "parent");
  const testListing = listingIsTest(row.is_test);
  const userId = String(row.user_id || "");
  const events = [
    {
      userId,
      trigger: "parent_signup",
      role: "parent",
      email,
      name,
      phone,
      company: "",
      testListing: false,
    },
  ];
  if (role === "provider" || company) {
    events.push({
      userId,
      trigger: "provider_signup",
      role: "provider",
      email,
      name,
      phone,
      company,
      testListing,
    });
  }
  return events;
}

export function describeBackfillEvent(event, createdAt) {
  const bits = [event.trigger, `user=${event.userId}`, `email=${event.email}`];
  if (event.name) bits.push(`name=${event.name}`);
  if (event.company) bits.push(`company=${event.company}`);
  if (event.testListing) bits.push("qa:test");
  if (createdAt) bits.push(`created=${createdAt}`);
  return bits.join(" ");
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

async function main() {
  const args = parseBackfillArgs(process.argv.slice(2));
  const databaseUrl = (process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    console.error("[ghl-backfill] DATABASE_URL unset");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await pool.query(BACKFILL_USERS_SQL, [args.since]);
    const planned = [];
    for (const row of result.rows) {
      const createdAt = row.created_at ? new Date(row.created_at).toISOString() : "";
      for (const event of planBackfillEvents(row)) {
        planned.push({ event, createdAt });
      }
    }
    const mode = args.dryRun ? "dry-run" : "send";
    console.log(`[ghl-backfill] ${mode} since=${args.since} users=${result.rows.length} events=${planned.length}`);
    for (const item of planned) {
      console.log(describeBackfillEvent(item.event, item.createdAt));
    }
    if (args.dryRun) return;

    for (const item of planned) {
      const event = item.event;
      try {
        const sent = await postGhlCrmSignup({
          trigger: event.trigger,
          email: event.email,
          name: event.name,
          phone: event.phone,
          company: event.company,
          testListing: event.testListing,
          eventId: `${event.trigger}:${event.userId}`,
        });
        if (sent.ok && !sent.skipped) {
          console.info(
            `[kidease-ghl] ok trigger=${event.trigger} contact=${sent.contactId} opportunity=${sent.opportunity}`,
          );
        } else if (sent.ok && sent.skipped) {
          console.info(`[ghl-backfill] skipped trigger=${event.trigger} email=${event.email} reason=${sent.reason}`);
        } else {
          console.error(`[ghl-backfill] failed trigger=${event.trigger} email=${event.email} error=${sent.error}`);
        }
      } catch (err) {
        console.error(
          `[ghl-backfill] failed trigger=${event.trigger} email=${event.email}`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  } finally {
    await pool.end();
  }
}

if (isDirectRun()) {
  main().catch((err) => {
    console.error("[ghl-backfill]", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
