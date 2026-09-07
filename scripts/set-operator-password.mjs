#!/usr/bin/env node
/**
 * One-shot operator credential for ADMIN_EMAIL (default kyle@kidease.ca).
 *
 * Production (preferred): set OPERATOR_RESET_PASSWORD on Vercel Production
 * (server env, never VITE_), redeploy, sign in on www, then UNSET the var.
 * `npm run build` → db:migrate calls this after schema migrations.
 *
 * Local / Neon: DATABASE_URL=… OPERATOR_RESET_PASSWORD=… npm run ops:operator-password
 *
 * Never logs the password. Never commit the value. Skips when the env is blank.
 */
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";

const DEFAULT_EMAIL = "kyle@kidease.ca";

export function operatorResetEmail(env = process.env) {
  return (env.OPERATOR_RESET_EMAIL || env.ADMIN_EMAIL || DEFAULT_EMAIL).trim().toLowerCase();
}

export function operatorResetPassword(env = process.env) {
  return env.OPERATOR_RESET_PASSWORD?.trim() || "";
}

function newId() {
  return randomBytes(16).toString("hex");
}

/**
 * Hash and upsert a credential account for the operator email.
 * Returns a status string with no secret material.
 */
export async function applyOperatorCredentialFromEnv(databaseUrl, env = process.env) {
  const password = operatorResetPassword(env);
  if (!password) return "skipped";
  if (password.length < 8) {
    throw new Error("[operator-password] OPERATOR_RESET_PASSWORD is shorter than 8 characters");
  }
  if (!databaseUrl?.trim()) {
    throw new Error("[operator-password] DATABASE_URL is required when OPERATOR_RESET_PASSWORD is set");
  }

  const email = operatorResetEmail(env);
  if (!email.includes("@")) throw new Error("[operator-password] operator email is invalid");

  const hash = await hashPassword(password);
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(`select id from "user" where lower(email) = $1 limit 1`, [email]);
    let userId = existing.rows[0]?.id;
    if (!userId) {
      userId = newId();
      await client.query(
        `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         values ($1, $2, $3, true, now(), now())`,
        [userId, "Kyle", email],
      );
    }

    const cred = await client.query(
      `select id from account where "userId" = $1 and "providerId" = 'credential' limit 1`,
      [userId],
    );
    if (cred.rows[0]) {
      await client.query(
        `update account set password = $1, "updatedAt" = now() where id = $2`,
        [hash, cred.rows[0].id],
      );
    } else {
      await client.query(
        `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
         values ($1, $2, 'credential', $2, $3, now(), now())`,
        [newId(), userId, hash],
      );
    }

    await client.query(
      `insert into profiles (user_id, role) values ($1, 'admin')
       on conflict (user_id) do update set role = 'admin'`,
      [userId],
    );
    await client.query("COMMIT");
    return `updated:${email}`;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* keep original */
    }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const result = await applyOperatorCredentialFromEnv(databaseUrl);
  if (result === "skipped") {
    console.log("[operator-password] OPERATOR_RESET_PASSWORD unset — skip");
    return;
  }
  console.log(`[operator-password] ${result} — unset OPERATOR_RESET_PASSWORD after sign-in works`);
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
