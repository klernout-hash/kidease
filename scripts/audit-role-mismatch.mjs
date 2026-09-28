#!/usr/bin/env node
/**
 * Read-only role mismatch audit. Prints counts and user ids only.
 *
 *   DATABASE_URL=... node scripts/audit-role-mismatch.mjs
 *
 * (a) profiles.role = parent and the account owns a centre or is an active member
 * (b) profiles.role = provider, no centre, and the account has parent data
 */
import pg from "pg";

const url = String(process.env.DATABASE_URL || "").trim();
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const parentLinked = `
  select p.user_id as id
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
  select p.user_id as id
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
try {
  const linked = await pool.query(parentLinked);
  const stray = await pool.query(daycareWithParentData);
  const report = {
    parentRoleLinkedToCentre: { count: linked.rowCount ?? linked.rows.length, ids: linked.rows.map((row) => row.id) },
    providerRoleWithParentData: { count: stray.rowCount ?? stray.rows.length, ids: stray.rows.map((row) => row.id) },
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  await pool.end();
}
