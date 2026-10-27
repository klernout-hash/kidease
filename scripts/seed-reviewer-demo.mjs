#!/usr/bin/env node
/**
 * App Store / Play reviewer accounts. One parent, one daycare, one demo centre.
 *
 *   DATABASE_URL=… \
 *   REVIEWER_ACCOUNT_PASSWORD=… \
 *   npm run ops:reviewer-demo
 *
 * One password, from REVIEWER_ACCOUNT_PASSWORD, is used for both accounts.
 * --password-file writes that password when the variable is blank. This file
 * never prints it. The password file stays out of git.
 *
 *   node scripts/seed-reviewer-demo.mjs --password-file /path/demo-accounts.txt
 *
 * The centre is a fictional Winnipeg sample. Public search hides it
 * (visibility admin_only, is_test = 1). It is not a real licensed daycare:
 * no fee, no rating, no child photo, licence marked QA. Photos are the
 * standard new-listing samples, not pictures of this centre.
 *
 * Not wired into db:migrate. Re-running updates the same rows.
 *
 * The parent account gets complimentary Parent Plus (video tours). There is
 * no Stripe customer, subscription, or price. The daycare account is not granted Plus.
 */
import { randomBytes } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";

export const REVIEWER_PARENT_EMAIL_DEFAULT = "reviewer.parent@kidease.ca";
export const REVIEWER_DAYCARE_EMAIL_DEFAULT = "reviewer.daycare@kidease.ca";

/** Stable ids. Public catalogue filters hide this row. */
export const REVIEWER_LISTING = {
  id: "qa-reviewer-demo",
  slug: "qa-reviewer-demo-centre",
  name: "North Elm Family Daycare",
  nameFr: "Garderie familiale North Elm",
  address: "214 North Elm Crescent",
  city: "Winnipeg",
  province: "MB",
  postalCode: "R3L 0P6",
  lat: 49.8951,
  lng: -97.1384,
  licenseNumber: "QA-REVIEWER-0001",
};

export const REVIEWER_PARENT_NAME = "Alex Morgan";
export const REVIEWER_PROVIDER_NAME = "Jordan Singh";

const CHILD_ID = "qa-reviewer-child";
const CHILD_TWO_ID = "qa-reviewer-child-2";
const BOOKING_ID = "qa-reviewer-request";
const CONVERSATION_ID = "qa-reviewer-thread";
const MESSAGE_ID = "qa-reviewer-msg";
const REPLY_ID = "qa-reviewer-reply";
const TOUR_ID = "qa-reviewer-tour";
const WAITLIST_ID = "qa-reviewer-waitlist";
/** Same paths as STOCK_CREATE_PHOTOS. Sample rooms, not this centre. */
const REVIEWER_PHOTOS = "/photos/community.jpg,/photos/playroom.jpg";
const REVIEWER_HOURS = "Monday to Friday, 7:30 a.m. to 5:30 p.m.";
const REVIEWER_HOURS_FR = "Lundi au vendredi, 7 h 30 à 17 h 30.";

function newId() {
  return randomBytes(16).toString("hex");
}

function emailOf(env, key, fallback) {
  return String(env[key] || fallback)
    .trim()
    .toLowerCase();
}

function passwordOf(env, key) {
  return String(env[key] || "").trim();
}

/** One fresh password for both reviewer accounts. Callers must not print it. */
export function generatedReviewerPasswords() {
  const password = randomBytes(18).toString("base64url");
  return {
    password,
    parentPassword: password,
    daycarePassword: password,
  };
}

/** John Doe and Jonny Doey are separate QA accounts. This seed must not write them. */
export function isProtectedQaIdentity(value) {
  return /john[\s._-]*doe|jonn?y[\s._-]*doey/i.test(String(value || ""));
}

/**
 * Write emails and passwords to one file. Mode 0600. This function does not
 * log the body. The file must stay out of git.
 */
export async function writeReviewerPasswordFile(filePath, plan) {
  const body = [
    "KidEase store-review demo accounts",
    "Do not commit this file. Do not paste it into a pull request.",
    `parent_email=${plan.parentEmail}`,
    `parent_name=${REVIEWER_PARENT_NAME}`,
    `parent_password=${plan.parentPassword}`,
    `provider_email=${plan.daycareEmail}`,
    `provider_name=${REVIEWER_PROVIDER_NAME}`,
    `provider_password=${plan.daycarePassword}`,
    `listing=${plan.listing.name}`,
    `listing_slug=${plan.listing.slug}`,
    `city=${plan.listing.city}, ${plan.listing.province}`,
    "",
  ].join("\n");
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, body, { mode: 0o600 });
  await chmod(filePath, 0o600);
}

/**
 * What the seed will write. Password strings stay on this object for the
 * caller that hashes them. Logs must use `publicReviewerPlan` instead.
 */
export function reviewerCredentialPlan(env = process.env) {
  const parentEmail = emailOf(env, "REVIEWER_PARENT_EMAIL", REVIEWER_PARENT_EMAIL_DEFAULT);
  const daycareEmail = emailOf(env, "REVIEWER_DAYCARE_EMAIL", REVIEWER_DAYCARE_EMAIL_DEFAULT);
  const password = passwordOf(env, "REVIEWER_ACCOUNT_PASSWORD");
  const parentPassword = password;
  const daycarePassword = password;
  return {
    parentEmail,
    daycareEmail,
    parentPassword,
    daycarePassword,
    listing: REVIEWER_LISTING,
  };
}

/** Safe to print. No password fields. */
export function publicReviewerPlan(plan) {
  return {
    parentEmail: plan.parentEmail,
    daycareEmail: plan.daycareEmail,
    parentPasswordSet: plan.parentPassword.length > 0,
    daycarePasswordSet: plan.daycarePassword.length > 0,
    listingId: plan.listing.id,
    listingSlug: plan.listing.slug,
    hiddenFromPublicSearch: true,
  };
}

export function assertReviewerPlan(plan) {
  if (!plan.parentPassword || !plan.daycarePassword) return "skipped";
  if (plan.parentPassword.length < 8 || plan.daycarePassword.length < 8) {
    throw new Error("[reviewer-demo] each password must be at least 8 characters");
  }
  if (plan.parentEmail === plan.daycareEmail) {
    throw new Error("[reviewer-demo] parent and daycare emails must differ");
  }
  for (const email of [plan.parentEmail, plan.daycareEmail]) {
    if (!email.includes("@") || email.startsWith("@")) {
      throw new Error("[reviewer-demo] an email is invalid");
    }
  }
  if (plan.parentEmail === "kyle@kidease.ca" || plan.daycareEmail === "kyle@kidease.ca") {
    throw new Error("[reviewer-demo] refusing to reuse the operator mailbox");
  }
  if (isProtectedQaIdentity(plan.parentEmail) || isProtectedQaIdentity(plan.daycareEmail)) {
    throw new Error("[reviewer-demo] refusing to change a John Doe or Jonny Doey account");
  }
  if (plan.listing.slug !== REVIEWER_LISTING.slug || plan.listing.id !== REVIEWER_LISTING.id) {
    throw new Error("[reviewer-demo] listing id drifted");
  }
  return "ready";
}

async function upsertCredential(client, { email, name, password, role }) {
  if (isProtectedQaIdentity(email) || isProtectedQaIdentity(name)) {
    throw new Error("[reviewer-demo] refusing to change a John Doe or Jonny Doey account");
  }
  const existing = await client.query(
    `select id, name from "user" where lower(email) = $1 limit 1`,
    [email],
  );
  if (isProtectedQaIdentity(existing.rows[0]?.name)) {
    throw new Error("[reviewer-demo] refusing to change a John Doe or Jonny Doey account");
  }
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
  await client.query(`delete from "twoFactor" where "userId" = $1`, [userId]);
  const admin = await client.query(`select role from profiles where user_id = $1`, [userId]);
  const current = String(admin.rows[0]?.role || "");
  if (current === "admin" || current === "support" || current === "support_lead") {
    throw new Error("[reviewer-demo] refusing to change a staff account");
  }
  const hash = await hashPassword(password);
  const cred = await client.query(
    `select id from account where "userId" = $1 and "providerId" = 'credential' limit 1`,
    [userId],
  );
  if (cred.rows[0]) {
    await client.query(`update account set password = $1, "updatedAt" = now() where id = $2`, [
      hash,
      cred.rows[0].id,
    ]);
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
     on conflict (email) do update set
       reason = case
         when email_suppressions.reason = 'complaint' then email_suppressions.reason
         else 'manual'
       end,
       updated_at = now()`,
    [email],
  );
  return userId;
}

/**
 * Complimentary Parent Plus for the reviewer parent only.
 * Video tours read plus_plan and plus_status. No Stripe object and no price.
 */
async function grantComplimentaryParentPlus(client, parentUserId) {
  await client.query(
    `update profiles
        set plus_plan = 'plus',
            plus_status = 'active',
            plus_interval = 'month',
            plus_subscription_id = null,
            plus_cancel_at_period_end = false,
            plus_current_period_end = null
      where user_id = $1
        and role = 'parent'`,
    [parentUserId],
  );
}

async function upsertListing(client, daycareUserId) {
  const row = REVIEWER_LISTING;
  const description =
    "Fictional Winnipeg centre for store review only. Not a real licensed daycare and not a real family. Hidden from public search. No fee, rating, child photo, or open spots are on file. The photos are KidEase sample rooms, not this centre.";
  await client.query(
    `insert into daycares (
       id, slug, name, name_fr, tagline, tagline_fr, description, description_fr,
       address, city, province, postal_code, lat, lng, phone, hours, hours_fr,
       age_min_months, age_max_months, infant_monthly, toddler_monthly, preschool_monthly,
       spots_infant, spots_toddler, spots_preschool, waitlist, rating_x10, review_count,
       license_number, photos, verified, visibility, is_test, claim_status, claimed_at, listing_active
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $7,
       $8, $9, $10, $11, $12, $13, null, $14, $15,
       0, 144, null, null, null,
       0, 0, 0, 1, 0, 0,
       $16, $17, 0, 'admin_only', 1, 'approved', now(), 1
     )
     on conflict (id) do update set
       slug = excluded.slug,
       name = excluded.name,
       name_fr = excluded.name_fr,
       description = excluded.description,
       description_fr = excluded.description_fr,
       address = excluded.address,
       hours = excluded.hours,
       hours_fr = excluded.hours_fr,
       visibility = 'admin_only',
       is_test = 1,
       rating_x10 = 0,
       review_count = 0,
       google_rating_x10 = null,
       google_review_count = null,
       infant_monthly = null,
       toddler_monthly = null,
       preschool_monthly = null,
       verified = 0,
       photos = excluded.photos,
       waitlist = 1,
       claim_status = 'approved',
       listing_active = 1,
       license_number = excluded.license_number`,
    [
      row.id,
      row.slug,
      row.name,
      row.nameFr,
      "Fictional sample for store review. Not a real centre.",
      "Exemple fictif pour la revue des boutiques. Pas un vrai centre.",
      description,
      row.address,
      row.city,
      row.province,
      row.postalCode,
      row.lat,
      row.lng,
      REVIEWER_HOURS,
      REVIEWER_HOURS_FR,
      row.licenseNumber,
      REVIEWER_PHOTOS,
    ],
  );
  await client.query(`delete from provider_daycares where daycare_id = $1 and user_id <> $2`, [
    row.id,
    daycareUserId,
  ]);
  await client.query(
    `insert into provider_daycares (user_id, daycare_id) values ($1, $2) on conflict do nothing`,
    [daycareUserId, row.id],
  );
}

async function upsertParentSamples(client, parentUserId) {
  const listingId = REVIEWER_LISTING.id;
  await client.query(
    `insert into children (id, user_id, name, birthdate, notes, allergies, medications, medical_notes)
     values ($1, $2, 'Rowan Sample', '2023-06-15', 'Fictional child for store review. Not a real child. No photo is stored.', 'Sample: peanuts', 'Sample: none', 'Fictional note for review only. Not a real child. No photo.')
     on conflict (id) do update set
       user_id = excluded.user_id,
       name = excluded.name,
       notes = excluded.notes,
       allergies = excluded.allergies,
       medications = excluded.medications,
       medical_notes = excluded.medical_notes`,
    [CHILD_ID, parentUserId],
  );
  await client.query(
    `insert into children (id, user_id, name, birthdate, notes, allergies, medications, medical_notes)
     values ($1, $2, 'Avery Sample', '2021-03-20', 'Second fictional child for store review. Not a real child. No photo is stored.', 'Sample: none', 'Sample: none', 'Fictional note for review only. Not a real child. No photo.')
     on conflict (id) do update set
       user_id = excluded.user_id,
       name = excluded.name,
       notes = excluded.notes`,
    [CHILD_TWO_ID, parentUserId],
  );
  await client.query(
    `insert into saved_daycares (user_id, daycare_id) values ($1, $2) on conflict do nothing`,
    [parentUserId, listingId],
  );
  await client.query(
    `insert into bookings (
       id, user_id, daycare_id, child_id, start_month, schedule, age_group, status, monthly_amount, parent_note
     ) values (
       $1, $2, $3, $4, '2026-11', 'full', 'toddler', 'pending', 0,
       'App review demo request. Not a real family.'
     )
     on conflict (id) do update set
       user_id = excluded.user_id,
       daycare_id = excluded.daycare_id,
       monthly_amount = 0,
       status = 'pending'`,
    [BOOKING_ID, parentUserId, listingId, CHILD_ID],
  );
  await client.query(
    `insert into conversations (id, user_id, daycare_id)
     values ($1, $2, $3)
     on conflict (user_id, daycare_id) do nothing`,
    [CONVERSATION_ID, parentUserId, listingId],
  );
  const convo = await client.query(
    `select id from conversations where user_id = $1 and daycare_id = $2 limit 1`,
    [parentUserId, listingId],
  );
  const conversationId = convo.rows[0]?.id;
  if (!conversationId) return;
  await client.query(
    `insert into messages (id, conversation_id, sender, body, kind)
     values ($1, $2, 'parent', $3, 'chat')
     on conflict (id) do nothing`,
    [
      MESSAGE_ID,
      conversationId,
      "Hello — this is a fictional message for store review. Not a real parent.",
    ],
  );
  await client.query(
    `insert into messages (id, conversation_id, sender, body, kind)
     values ($1, $2, 'provider', $3, 'chat')
     on conflict (id) do nothing`,
    [
      REPLY_ID,
      conversationId,
      "Hello — this is the daycare demo reply. It stays in KidEase messages, not in a text.",
    ],
  );
  await client.query(`update conversations set last_at = now() where id = $1`, [conversationId]);
  await client.query(
    `insert into tour_requests (
       id, conversation_id, user_id, daycare_id, child_id, child_name, preferred_times, parent_note, status
     ) values (
       $1, $2, $3, $4, $5, 'Rowan Sample', 'Tuesday or Thursday morning',
       'Fictional tour request for store review. Not a real family.', 'pending'
     )
     on conflict (id) do update set
       conversation_id = excluded.conversation_id,
       user_id = excluded.user_id,
       daycare_id = excluded.daycare_id,
       child_id = excluded.child_id,
       status = 'pending'`,
    [TOUR_ID, conversationId, parentUserId, listingId, CHILD_ID],
  );
  await client.query(
    `delete from daycare_waitlist
     where daycare_id = $1 and user_id = $2 and id <> $3 and status in ('waiting', 'offered')`,
    [listingId, parentUserId, WAITLIST_ID],
  );
  await client.query(
    `insert into daycare_waitlist (id, daycare_id, user_id, age_group, child_label, note, status)
     values (
       $1, $2, $3, 'toddler', 'Rowan Sample',
       'Fictional waitlist entry for store review. Not a real family.', 'waiting'
     )
     on conflict (id) do update set
       daycare_id = excluded.daycare_id,
       user_id = excluded.user_id,
       age_group = excluded.age_group,
       child_label = excluded.child_label,
       status = 'waiting',
       updated_at = now()`,
    [WAITLIST_ID, listingId, parentUserId],
  );
}

/**
 * Hash and upsert the two reviewer accounts plus the hidden demo centre.
 * Returns a status string with no secret material. "skipped" when either
 * password env is blank.
 */
export async function applyReviewerDemoFromEnv(databaseUrl, env = process.env) {
  const plan = reviewerCredentialPlan(env);
  const gate = assertReviewerPlan(plan);
  if (gate === "skipped") return "skipped";
  if (!databaseUrl?.trim()) {
    throw new Error("[reviewer-demo] DATABASE_URL is required when reviewer passwords are set");
  }
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const parentId = await upsertCredential(client, {
      email: plan.parentEmail,
      name: REVIEWER_PARENT_NAME,
      password: plan.parentPassword,
      role: "parent",
    });
    await grantComplimentaryParentPlus(client, parentId);
    const daycareId = await upsertCredential(client, {
      email: plan.daycareEmail,
      name: REVIEWER_PROVIDER_NAME,
      password: plan.daycarePassword,
      role: "provider",
    });
    await upsertListing(client, daycareId);
    await upsertParentSamples(client, parentId);
    await client.query("COMMIT");
    return `ready parent=${plan.parentEmail} daycare=${plan.daycareEmail} listing=${plan.listing.slug} hidden=admin_only parentPlus=complimentary`;
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

function passwordFileArg(argv) {
  const index = argv.indexOf("--password-file");
  if (index === -1) return "";
  return String(argv[index + 1] || "").trim();
}

async function main() {
  const filePath = passwordFileArg(process.argv);
  let env = process.env;
  if (filePath) {
    const current = reviewerCredentialPlan(env);
    if (!current.parentPassword) {
      const generated = generatedReviewerPasswords();
      env = {
        ...env,
        REVIEWER_ACCOUNT_PASSWORD: generated.password,
      };
    }
    const plan = reviewerCredentialPlan(env);
    assertReviewerPlan(plan);
    await writeReviewerPasswordFile(filePath, plan);
    console.log("[reviewer-demo] password file written; passwords were not printed");
  }
  if (!process.env.DATABASE_URL?.trim()) {
    console.log("[reviewer-demo] DATABASE_URL unset — production accounts were not created");
    if (!filePath && env.REVIEWER_ACCOUNT_PASSWORD) {
      throw new Error("[reviewer-demo] DATABASE_URL is required when reviewer passwords are set");
    }
    return;
  }
  const result = await applyReviewerDemoFromEnv(process.env.DATABASE_URL, env);
  if (result === "skipped") {
    console.log("[reviewer-demo] REVIEWER_ACCOUNT_PASSWORD unset — skip");
    return;
  }
  console.log(`[reviewer-demo] ${result}`);
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  main().catch((err) => {
    const message = err instanceof Error ? err.message : "reviewer demo failed";
    console.error(message);
    process.exit(1);
  });
}
