#!/usr/bin/env node
/**
 * Move mismatched profile roles. Dry-run unless --apply. Never touches
 * admin, support, or support_lead.
 *
 *   DATABASE_URL=... node scripts/fix-role-mismatch.mjs
 *   DATABASE_URL=... node scripts/fix-role-mismatch.mjs --apply
 *   DATABASE_URL=... node scripts/fix-role-mismatch.mjs --rollback role-mismatch-rollback-<ts>.json
 *
 * --apply writes role-mismatch-rollback-<timestamp>.json beside the process
 * cwd before it updates anything. The file stores ids and the previous role only.
 */
import { writeFileSync } from "node:fs";
import pg from "pg";

const url = String(process.env.DATABASE_URL || "").trim();
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const rollbackAt = args.indexOf("--rollback");
const rollbackFile = rollbackAt >= 0 ? args[rollbackAt + 1] : "";

const parentLinked = `
  select p.user_id as id, p.role as from_role
  from profiles p
  where p.role = 'parent'
    and (
      exists (select 1 from provider_daycares d where d.user_id = p.user_id)
      or exists (
        select 1 from centre_members m
        where m.user_id = p.user_id and m.status = 'active'
      )
    )
  order by p.user_id
`;

const daycareWithParentData = `
  select p.user_id as id, p.role as from_role
  from profiles p
  where p.role = 'provider'
    and not exists (select 1 from provider_daycares d where d.user_id = p.user_id)
    and not exists (
      select 1 from centre_members m
      where m.user_id = p.user_id and m.status = 'active'
    )
    and (
      exists (select 1 from saved_daycares s where s.user_id = p.user_id)
      or exists (select 1 from bookings b where b.user_id = p.user_id)
      or exists (select 1 from children c where c.user_id = p.user_id)
    )
  order by p.user_id
`;

const pool = new pg.Pool({ connectionString: url, max: 1 });

async function rollback(file) {
  const { readFileSync } = await import("node:fs");
  const payload = JSON.parse(readFileSync(file, "utf8"));
  const changes = Array.isArray(payload.changes) ? payload.changes : [];
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const change of changes) {
      const id = String(change.id || "");
      const from = change.from === "provider" ? "provider" : change.from === "parent" ? "parent" : "";
      if (!id || !from) continue;
      await client.query(
        `update profiles set role = $1 where user_id = $2 and role in ('parent', 'provider')`,
        [from, id],
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
  console.log(JSON.stringify({ rolledBack: changes.length, file }, null, 2));
}

try {
  if (rollbackFile) {
    await rollback(rollbackFile);
  } else {
    const linked = await pool.query(parentLinked);
    const stray = await pool.query(daycareWithParentData);
    const changes = [
      ...linked.rows.map((row) => ({ id: row.id, from: "parent", to: "provider" })),
      ...stray.rows.map((row) => ({ id: row.id, from: "provider", to: "parent" })),
    ];
    const summary = {
      dryRun: !apply,
      parentRoleLinkedToCentre: linked.rows.length,
      providerRoleWithParentData: stray.rows.length,
      ids: changes.map((change) => change.id),
    };
    if (!apply) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      const file = `role-mismatch-rollback-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      writeFileSync(file, JSON.stringify({ changes }, null, 2));
      const client = await pool.connect();
      try {
        await client.query("begin");
        for (const change of changes) {
          await client.query(
            `update profiles set role = $1 where user_id = $2 and role = $3`,
            [change.to, change.id, change.from],
          );
        }
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw err;
      } finally {
        client.release();
      }
      console.log(JSON.stringify({ ...summary, applied: true, rollback: file }, null, 2));
    }
  }
} finally {
  await pool.end();
}
