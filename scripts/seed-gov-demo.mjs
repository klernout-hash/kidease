#!/usr/bin/env node
/**
 * Demo government account for pitches.
 *
 *   DATABASE_URL=… \
 *   GOV_DEMO_EMAIL=… \
 *   GOV_DEMO_PASSWORD=… \
 *   GOV_DEMO_API_KEY=… \
 *   npm run ops:gov-demo
 *
 * The password and API key are read from the environment and stored as hashes.
 * This script never prints them. Re-running updates the same demo org.
 * It will not change a protected operator mailbox.
 */
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";

export const GOV_DEMO_ORG_ID = "gov-demo-mb";
export const GOV_DEMO_ORG_NAME = "Demo Province of Manitoba";

const PROTECTED = new Set([
  "kyle@openroadoutlet.ca",
  "kyle@kidease.ca",
  "klernout@hotmail.com",
  "klernout45@gmail.com",
]);

function hashSecret(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function govDemoPlan(env = process.env) {
  const email = String(env.GOV_DEMO_EMAIL || "")
    .trim()
    .toLowerCase();
  const password = String(env.GOV_DEMO_PASSWORD || "").trim();
  const apiKey = String(env.GOV_DEMO_API_KEY || "").trim();
  return { email, password, apiKey };
}

export async function applyGovDemoFromEnv(databaseUrl, env = process.env) {
  const plan = govDemoPlan(env);
  if (!databaseUrl?.trim() || !plan.email || !plan.password) return "skipped";
  if (PROTECTED.has(plan.email)) {
    throw new Error("[gov-demo] refusing to change a protected operator account");
  }
  if (plan.password.length < 12) {
    throw new Error("[gov-demo] GOV_DEMO_PASSWORD must be at least 12 characters");
  }
  if (plan.apiKey && plan.apiKey.length < 16) {
    throw new Error("[gov-demo] GOV_DEMO_API_KEY is too short");
  }
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(`select id from "user" where lower(email) = $1 limit 1`, [plan.email]);
    let userId = existing.rows[0]?.id;
    const passwordHash = await hashPassword(plan.password);
    if (!userId) {
      userId = `govdemo_${randomBytes(8).toString("hex")}`;
      await client.query(
        `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         values ($1, $2, $3, true, now(), now())`,
        [userId, GOV_DEMO_ORG_NAME, plan.email],
      );
    } else {
      const role = await client.query(`select role from profiles where user_id = $1`, [userId]);
      const current = String(role.rows[0]?.role || "");
      if (current === "admin" || current === "support" || current === "support_lead" || current === "provider") {
        throw new Error("[gov-demo] refusing to change a staff or daycare account");
      }
    }
    const account = await client.query(
      `select id from account where "userId" = $1 and "providerId" = 'credential' limit 1`,
      [userId],
    );
    if (account.rows[0]) {
      await client.query(`update account set password = $1, "updatedAt" = now() where id = $2`, [
        passwordHash,
        account.rows[0].id,
      ]);
    } else {
      await client.query(
        `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
         values ($1, $2, 'credential', $3, $4, now(), now())`,
        [`gac_${randomBytes(8).toString("hex")}`, userId, userId, passwordHash],
      );
    }
    await client.query(
      `insert into profiles (user_id, role) values ($1, 'government')
       on conflict (user_id) do update set role = 'government'`,
      [userId],
    );
    await client.query(
      `insert into government_orgs (id, name, province, demo)
       values ($1, $2, 'MB', 1)
       on conflict (id) do update set name = excluded.name, province = 'MB', demo = 1`,
      [GOV_DEMO_ORG_ID, GOV_DEMO_ORG_NAME],
    );
    await client.query(
      `insert into government_members (user_id, org_id, status, read_only)
       values ($1, $2, 'active', 1)
       on conflict (user_id) do update
         set org_id = excluded.org_id, status = 'active', read_only = 1, revoked_at = null`,
      [userId, GOV_DEMO_ORG_ID],
    );
    if (plan.apiKey) {
      const keyHash = hashSecret(plan.apiKey);
      await client.query(`update government_api_keys set revoked_at = now() where user_id = $1 and revoked_at is null`, [
        userId,
      ]);
      await client.query(
        `insert into government_api_keys (id, user_id, key_hash, key_prefix)
         values ($1, $2, $3, $4)
         on conflict (key_hash) do update set revoked_at = null, user_id = excluded.user_id`,
        [`gak_${randomBytes(6).toString("hex")}`, userId, keyHash, plan.apiKey.slice(0, 12)],
      );
    }
    await client.query("COMMIT");
    return "government demo account ready";
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* keep the original error */
    }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL || "";
  const plan = govDemoPlan();
  if (!plan.email || !plan.password) {
    console.log("[gov-demo] skipped. Set GOV_DEMO_EMAIL and GOV_DEMO_PASSWORD. The password is not printed.");
    return;
  }
  const result = await applyGovDemoFromEnv(databaseUrl);
  console.log(`[gov-demo] ${result}`);
}

const isDirect = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (isDirect || process.argv[1]?.endsWith("seed-gov-demo.mjs")) {
  main().catch((err) => {
    console.error("[gov-demo] failed:", err?.message || err);
    process.exit(1);
  });
}
