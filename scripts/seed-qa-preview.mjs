#!/usr/bin/env node
/**
 * Extra QA rows for the combined preview database only.
 * Does not print passwords, emails, or the database URL.
 *
 *   QA_BRANCH_ENDPOINT=ep-... \
 *   QA_PREVIEW_URL=https://... \
 *   QA_LOGIN_FILE=/path/qa-preview-logins.json \
 *   DATABASE_URL=... \
 *   node scripts/seed-qa-preview.mjs
 */
import { randomBytes } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";

const PARENT_EMAIL = "kyle+qa-parent2@kidease.ca";
const GUARDIAN_EMAIL = "kyle+qa-guardian2@kidease.ca";
const STAFF_EMAIL = "kyle+qa-staff@kidease.ca";
const CENTRE_ID = "qa-preview-centre-2";
const CENTRE_SLUG = "qa-preview-hidden-centre";
const CHILD_ID = "qa-preview-child-2";
const LINK_ID = "qa-preview-guardian-link";
const INCIDENT_ID = "qa-preview-incident-1";
const STORY_ID = "qa-preview-story-1";
const DOC_ID = "qa-preview-doc-1";
const NEWS_ID = "qa-preview-news-1";
const THREAD_ID = "qa-preview-thread-2";

function redact(value) {
  return String(value || "")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]")
    .replace(/ep-[a-z0-9-]+/gi, "[endpoint]");
}

function password() {
  return randomBytes(18).toString("base64url");
}

function newId() {
  return randomBytes(16).toString("hex");
}

async function columns(client, table) {
  const res = await client.query(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
    [table],
  );
  return new Set(res.rows.map((row) => row.column_name));
}

async function upsertUser(client, { email, name, role, secret }) {
  const existing = await client.query(`select id from "user" where lower(email) = $1 limit 1`, [email]);
  let userId = existing.rows[0]?.id;
  if (!userId) {
    userId = newId();
    await client.query(
      `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       values ($1, $2, $3, true, now(), now())`,
      [userId, name, email],
    );
  }
  await client.query(
    `update "user" set name = $2, "emailVerified" = true, "twoFactorEnabled" = false, "updatedAt" = now() where id = $1`,
    [userId, name],
  );
  const hash = await hashPassword(secret);
  const cred = await client.query(
    `select id from account where "userId" = $1 and "providerId" = 'credential' limit 1`,
    [userId],
  );
  if (cred.rows[0]) {
    await client.query(`update account set password = $1, "updatedAt" = now() where id = $2`, [hash, cred.rows[0].id]);
  } else {
    await client.query(
      `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       values ($1, $2, 'credential', $2, $3, now(), now())`,
      [newId(), userId, hash],
    );
  }
  await client.query(
    `insert into profiles (user_id, role, display_name, city, is_test)
     values ($1, $2, $3, 'Winnipeg', 1)
     on conflict (user_id) do update set role = excluded.role, display_name = excluded.display_name, is_test = 1`,
    [userId, role, name],
  );
  await client.query(
    `insert into email_suppressions (email, reason)
     values ($1, 'manual')
     on conflict (email) do update set reason = 'manual', updated_at = now()`,
    [email],
  ).catch(() => undefined);
  return userId;
}

async function main() {
  const endpoint = String(process.env.QA_BRANCH_ENDPOINT || "").trim();
  const databaseUrl = String(process.env.DATABASE_URL || "");
  const loginFile = String(process.env.QA_LOGIN_FILE || "").trim();
  const previewUrl = String(process.env.QA_PREVIEW_URL || "").trim();
  if (!endpoint || !endpoint.startsWith("ep-")) throw new Error("QA branch endpoint is missing");
  if (!databaseUrl.includes(endpoint)) throw new Error("DATABASE_URL is not the QA branch");
  if (databaseUrl.includes("sslmode=require") === false && !databaseUrl.includes("sslmode=")) {
    // Neon accepts either. Do not rewrite the URL into a log.
  }
  if (!loginFile || !previewUrl.startsWith("https://")) throw new Error("login file or preview URL is missing");

  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: true } });
  await client.connect();
  try {
    const probe = await client.query(`select current_database() as db`);
    if (!probe.rows[0]?.db) throw new Error("database probe failed");

    const owner = await client.query(
      `select pd.user_id, u.email, d.id as daycare_id
         from provider_daycares pd
         join "user" u on u.id = pd.user_id
         join daycares d on d.id = pd.daycare_id
        where d.slug in ('ke-qa-test-daycare-001', 'qa-reviewer-demo-centre')
           or d.id in ('ke-qa-test-daycare-001', 'qa-reviewer-demo')
        order by d.slug
        limit 1`,
    );
    const providerUserId = owner.rows[0]?.user_id;
    const providerEmail = owner.rows[0]?.email || "";
    const homeCentreId = owner.rows[0]?.daycare_id || null;
    if (!providerUserId) throw new Error("QA provider was not found on this branch");

    const parentSecret = password();
    const guardianSecret = password();
    const staffSecret = password();
    const parentId = await upsertUser(client, {
      email: PARENT_EMAIL,
      name: "QA Parent Two",
      role: "parent",
      secret: parentSecret,
    });
    const guardianId = await upsertUser(client, {
      email: GUARDIAN_EMAIL,
      name: "QA Guardian Two",
      role: "parent",
      secret: guardianSecret,
    });
    const staffId = await upsertUser(client, {
      email: STAFF_EMAIL,
      name: "QA Staff Reader",
      role: "provider",
      secret: staffSecret,
    });

    const childCols = await columns(client, "children");
    const child = {
      id: CHILD_ID,
      user_id: parentId,
      name: "Sample Child Two",
      birthdate: "2022-04-04",
      notes: "Fictional child for preview QA. Not a real child. No photo.",
    };
    if (childCols.has("allergies")) child.allergies = "Sample: none";
    if (childCols.has("medications")) child.medications = "Sample: none";
    if (childCols.has("medical_notes")) child.medical_notes = "Fictional note. Not a real child.";
    const childKeys = Object.keys(child);
    await client.query(
      `insert into children (${childKeys.join(", ")})
       values (${childKeys.map((_, i) => `$${i + 1}`).join(", ")})
       on conflict (id) do update set user_id = excluded.user_id, name = excluded.name, notes = excluded.notes`,
      childKeys.map((key) => child[key]),
    );

    await client.query(
      `insert into coparent_links (id, owner_user_id, member_user_id, access, status, invite_token, accepted_at)
       values ($1, $2, $3, 'full', 'active', $4, now())
       on conflict (id) do update set
         owner_user_id = excluded.owner_user_id,
         member_user_id = excluded.member_user_id,
         status = 'active',
         removed_at = null`,
      [LINK_ID, parentId, guardianId, `qa-preview-token-${LINK_ID}`],
    );

    const description =
      "Fictional second centre for preview QA. Not a real licensed daycare. Hidden from search. Not published. Claim is not approved.";
    await client.query(
      `insert into daycares (
         id, slug, name, name_fr, tagline, tagline_fr, description, description_fr,
         address, city, province, postal_code, lat, lng, phone, hours, hours_fr,
         age_min_months, age_max_months, infant_monthly, toddler_monthly, preschool_monthly,
         spots_infant, spots_toddler, spots_preschool, waitlist, rating_x10, review_count,
         license_number, photos, verified, visibility, is_test, is_demo, claim_status, claimed_at, listing_active
       ) values (
         $1, $2, 'QA Hidden Centre Two', 'Centre caché QA deux',
         'Fictional sample. Not a real centre.', 'Exemple fictif. Pas un vrai centre.',
         $3, $3,
         '18 Sample Lane', 'Winnipeg', 'MB', 'R3C 0A1', 49.895, -97.138, null,
         'Monday to Friday, 7:30 a.m. to 5:30 p.m.', 'Lundi au vendredi, 7 h 30 à 17 h 30.',
         0, 144, null, null, null,
         0, 0, 0, 1, 0, 0,
         'QA-PREVIEW-0002', '/photos/playroom.jpg', 0, 'admin_only', 1, 1, 'pending', null, 0
       )
       on conflict (id) do update set
         slug = excluded.slug,
         name = excluded.name,
         visibility = 'admin_only',
         is_test = 1,
         verified = 0,
         claim_status = 'pending',
         claimed_at = null,
         listing_active = 0,
         rating_x10 = 0,
         review_count = 0,
         photos = excluded.photos`,
      [CENTRE_ID, CENTRE_SLUG, description],
    );
    await client.query(
      `insert into provider_daycares (user_id, daycare_id) values ($1, $2) on conflict do nothing`,
      [providerUserId, CENTRE_ID],
    );

    for (const daycareId of [CENTRE_ID, homeCentreId].filter(Boolean)) {
      await client.query(
        `insert into centre_members (id, daycare_id, user_id, role, status)
         values ($1, $2, $3, 'read_only', 'active')
         on conflict (daycare_id, user_id) do update set role = 'read_only', status = 'active', revoked_at = null`,
        [`qa-preview-staff-${daycareId}`, daycareId, staffId],
      );
    }

    await client.query(
      `insert into care_incidents (
         id, daycare_id, child_id, child_name, parent_user_id, day, occurred_at,
         location, kind, description, action_taken, first_aid, author_user_id, author_name
       ) values (
         $1, $2, $3, 'Sample Child Two', $4, current_date, now(),
         'Play room', 'bump',
         'Fictional sample incident for preview QA. Not a real child.',
         'Comfort and a parent note in the desk. Nothing was sent.',
         false, $5, 'QA Staff Reader'
       )
       on conflict (id) do update set description = excluded.description, parent_notified_at = null`,
      [INCIDENT_ID, CENTRE_ID, CHILD_ID, parentId, staffId],
    );

    const storyCols = await columns(client, "learning_stories");
    if (storyCols.has("framework")) {
      await client.query(
        `insert into learning_stories (
           id, daycare_id, child_id, title, body, framework, domain, observed_on, is_private, author_id
         ) values (
           $1, $2, $3, 'Sample story', 'Fictional learning story for preview QA. Not a real child.',
           'none', 'play', current_date, 1, $4
         )
         on conflict (id) do update set body = excluded.body, is_private = 1`,
        [STORY_ID, CENTRE_ID, CHILD_ID, providerUserId],
      );
    } else if (storyCols.has("author_user_id")) {
      await client.query(
        `insert into learning_stories (
           id, daycare_id, child_id, parent_user_id, author_user_id, title, body, photos, media_private
         ) values (
           $1, $2, $3, $4, $5, 'Sample story',
           'Fictional learning story for preview QA. Not a real child.',
           $6::jsonb, true
         )
         on conflict (id) do update set body = excluded.body, media_private = true`,
        [STORY_ID, CENTRE_ID, CHILD_ID, parentId, providerUserId, JSON.stringify(["/photos/playroom.jpg"])],
      );
    }

    await client.query(
      `insert into family_documents (id, user_id, kind, file_name, mime, byte_size, storage_ref)
       values ($1, $2, 'immunization', 'qa-placeholder.png', 'image/png', 68, 'qa-preview/placeholder.png')
       on conflict (id) do update set file_name = excluded.file_name, storage_ref = excluded.storage_ref`,
      [DOC_ID, parentId],
    );

    await client.query(
      `insert into conversations (id, user_id, daycare_id) values ($1, $2, $3) on conflict do nothing`,
      [THREAD_ID, parentId, CENTRE_ID],
    );
    const messageCols = await columns(client, "messages");
    const newsBody = "Sample news post for preview QA. Not published. Nothing was emailed or texted.";
    if (messageCols.has("kind")) {
      await client.query(
        `insert into messages (id, conversation_id, sender, body, kind)
         values ($1, $2, 'provider', $3, 'chat')
         on conflict (id) do update set body = excluded.body`,
        [NEWS_ID, THREAD_ID, newsBody],
      );
    } else {
      await client.query(
        `insert into messages (id, conversation_id, sender, body)
         values ($1, $2, 'provider', $3)
         on conflict (id) do update set body = excluded.body`,
        [NEWS_ID, THREAD_ID, newsBody],
      );
    }

    const existing = await client.query(
      `select u.email, p.role
         from "user" u
         join profiles p on p.user_id = u.id
        where lower(u.email) in (
          'kyle@kidease.ca',
          'klernout45@gmail.com',
          'reviewer-parent@kidease.ca',
          'reviewer.parent@kidease.ca',
          'reviewer-provider@kidease.ca',
          'reviewer.daycare@kidease.ca'
        )
        order by u.email`,
    );
    const accounts = [
      ...existing.rows.map((row) => ({
        email: row.email,
        password: "",
        role: row.role || "existing",
        url: previewUrl,
        passwordStatus: "unchanged",
      })),
      { email: PARENT_EMAIL, password: parentSecret, role: "parent", url: previewUrl, passwordStatus: "generated" },
      { email: GUARDIAN_EMAIL, password: guardianSecret, role: "guardian", url: previewUrl, passwordStatus: "generated" },
      { email: STAFF_EMAIL, password: staffSecret, role: "staff-read-only", url: previewUrl, passwordStatus: "generated" },
    ];
    if (providerEmail && !accounts.some((row) => row.email.toLowerCase() === providerEmail.toLowerCase())) {
      accounts.unshift({ email: providerEmail, password: "", role: "provider", url: previewUrl, passwordStatus: "unchanged" });
    }
    await mkdir(dirname(loginFile), { recursive: true });
    await writeFile(loginFile, `${JSON.stringify({ previewUrl, accounts }, null, 2)}\n`, { mode: 0o600 });
    await chmod(loginFile, 0o600);
    console.log(`seeded qa preview rows; login file written`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(redact(err && err.message ? err.message : err));
  process.exit(1);
});
