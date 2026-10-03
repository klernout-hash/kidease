import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { syncMasterCatalogue } from "../src/lib/catalog-master-sync.ts";
import { DAYCARE_UPSERT_SQL, daycareUpsertParams } from "../src/lib/catalog-upsert.ts";
import { formatPublicAgeRange, listingAgeRangeText } from "../src/lib/listing-ages.ts";
import {
  AGES_PROTECTED_LISTING_ID,
  SOURCED_AGES_ID_TRIM,
  SOURCED_AGES_MIGRATION,
  SOURCED_AGES_UNCLAIMED_RETRY,
  applyRecordedSourcedAges,
  applySourcedAgeUpdates,
  parseSourcedAges,
  stampSourcedAge,
} from "../src/lib/sourced-ages.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const csv = readFileSync(join(root, "data/ops/ages-sourced-20261002.csv"), "utf8");

function age(listingId, min, max, source = "website_stated: test", url = "https://example.com/ages") {
  return { listingId, ageMinMonths: min, ageMaxMonths: max, agesSource: source, agesSourceUrl: url };
}

test("sourced ages file parses 17197 approved rows by listing id", () => {
  const ages = parseSourcedAges(csv);
  assert.equal(ages.size, 17197);
  assert.equal(ages.has(AGES_PROTECTED_LISTING_ID), false);
  assert.deepEqual(
    [ages.get("mb-9654").ageMinMonths, ages.get("mb-9654").ageMaxMonths],
    [3, 144],
  );
  assert.deepEqual(
    [ages.get("mb-102660").ageMinMonths, ages.get("mb-102660").ageMaxMonths],
    [24, 72],
  );
  assert.deepEqual(
    [ages.get("mb-1172").ageMinMonths, ages.get("mb-1172").ageMaxMonths],
    [3, 24],
  );
  assert.deepEqual([ages.get("bc-2").ageMinMonths, ages.get("bc-2").ageMaxMonths], [6, 36]);
  assert.deepEqual(
    [ages.get("ns-5515087").ageMinMonths, ages.get("ns-5515087").ageMaxMonths],
    [18, 144],
  );
  assert.match(ages.get("mb-9654").agesSource, /^website_stated:/);
  assert.match(ages.get("mb-9654").agesSourceUrl, /^https:\/\//);

  const messy = parseSourcedAges(`listing_id,age_min_months,age_max_months,ages_source,ages_source_url
ok-1,0,60,registry_open_data+regulation,https://example.com/a
bad-max,10,10,registry_open_data+regulation,https://example.com/b
bad-range,0,217,registry_open_data+regulation,https://example.com/c
bad-blank,1,2,,https://example.com/d
${AGES_PROTECTED_LISTING_ID},1,12,website_stated,https://example.com/e
ok-1,4,8,website_stated,https://example.com/second
`);
  assert.equal(messy.size, 1);
  assert.equal(messy.get("ok-1").ageMinMonths, 0);
  assert.equal(messy.get("ok-1").ageMaxMonths, 60);
  assert.equal(messy.has(AGES_PROTECTED_LISTING_ID), false);
});

test("public age copy is plain words with no dash", () => {
  assert.equal(listingAgeRangeText({ agesKnown: true, ageMinMonths: 24, ageMaxMonths: 72 }), "Ages 2 to 6 years");
  assert.equal(listingAgeRangeText({ agesKnown: true, ageMinMonths: 3, ageMaxMonths: 144 }), "Ages 3 months to 12 years");
  assert.equal(listingAgeRangeText({ agesKnown: true, ageMinMonths: 3, ageMaxMonths: 24 }), "Ages 3 to 24 months");
  assert.equal(listingAgeRangeText({ agesKnown: true, ageMinMonths: 6, ageMaxMonths: 36 }), "Ages 6 to 36 months");
  assert.equal(
    listingAgeRangeText({ agesKnown: true, ageMinMonths: 18, ageMaxMonths: 144 }),
    "Ages 18 months to 12 years",
  );
  assert.equal(formatPublicAgeRange(24, 72, "fr"), "2 à 6 ans");
  assert.equal(listingAgeRangeText({ agesKnown: false, ageMinMonths: 3, ageMaxMonths: 144 }), "");
  for (const text of [
    listingAgeRangeText({ agesKnown: true, ageMinMonths: 24, ageMaxMonths: 72 }),
    listingAgeRangeText({ agesKnown: true, ageMinMonths: 3, ageMaxMonths: 144 }),
    listingAgeRangeText({ agesKnown: true, ageMinMonths: 6, ageMaxMonths: 36 }),
    formatPublicAgeRange(18, 144, "en"),
    formatPublicAgeRange(30, 72, "en"),
  ]) {
    assert.equal(text.includes("\u2013") || text.includes("\u2014"), false);
  }
});

function listing(id, agesConfirmed = 0) {
  return {
    id,
    slug: id,
    name: "Prairie Kids",
    nameFr: "Prairie Kids",
    tagline: "first",
    taglineFr: "first",
    description: "d",
    descriptionFr: "d",
    address: "1 Main",
    city: "Winnipeg",
    province: "MB",
    postalCode: "R3C 0A1",
    lat: 49.8,
    lng: -97.1,
    phone: "204-555-0100",
    hours: "7-5",
    hoursFr: "7-5",
    ageMinMonths: 6,
    ageMaxMonths: 60,
    infantMonthly: null,
    toddlerMonthly: null,
    preschoolMonthly: null,
    partTimeMonthly: null,
    spotsInfant: 1,
    spotsToddler: 1,
    spotsPreschool: 1,
    waitlist: 0,
    ratingX10: 40,
    reviewCount: 0,
    licenseNumber: "MB-1",
    languages: "en",
    amenities: "meals",
    photos: [],
    agesConfirmed,
    agesSource: agesConfirmed === 1 ? "owner-edit" : null,
    agesSourceUrl: agesConfirmed === 1 ? "https://owner.example/ages" : null,
  };
}

async function upsertDb() {
  const pg = new PGlite();
  await pg.exec(`
    create table daycares (
      id text primary key,
      slug text, name text, name_fr text, tagline text, tagline_fr text,
      description text, description_fr text, address text, city text, province text,
      postal_code text, lat double precision, lng double precision, phone text,
      hours text, hours_fr text, age_min_months int, age_max_months int,
      infant_monthly int, toddler_monthly int, preschool_monthly int, part_time_monthly int,
      spots_infant int, spots_toddler int, spots_preschool int, waitlist int,
      rating_x10 int, review_count int, license_number text, languages text,
      amenities text, photos text, verified int, google_place_id text,
      contact_email text, website text, visibility text, is_test boolean,
      ages_confirmed int not null default 0, ages_source text, ages_source_url text,
      claimed_at timestamptz
    );
    create table provider_daycares (user_id text, daycare_id text);
    create table listing_claims (id text, daycare_id text);
    create table centre_members (id text, daycare_id text);
  `);
  return pg;
}

async function readAges(pg, id) {
  const found = await pg.query(
    `select age_min_months, age_max_months, ages_confirmed, ages_source, ages_source_url, tagline
     from daycares where id = $1`,
    [id],
  );
  return found.rows[0];
}

test("upsert never overwrites confirmed, claimed, owner-linked, or filled ages", async () => {
  const pg = await upsertDb();
  const query = (text, params) => pg.query(text, params);

  await query(DAYCARE_UPSERT_SQL, daycareUpsertParams(listing("confirmed", 1)));
  await query(
    DAYCARE_UPSERT_SQL,
    daycareUpsertParams({
      ...listing("confirmed", 1),
      tagline: "changed",
      ageMinMonths: 0,
      ageMaxMonths: 0,
      agesConfirmed: 0,
      agesSource: "",
      agesSourceUrl: "",
    }),
  );
  await query(
    DAYCARE_UPSERT_SQL,
    daycareUpsertParams({
      ...listing("confirmed", 0),
      tagline: "sourced-try",
      ageMinMonths: 3,
      ageMaxMonths: 144,
      agesConfirmed: 1,
      agesSource: "website_stated: new",
      agesSourceUrl: "https://example.com/new",
    }),
  );
  const confirmed = await readAges(pg, "confirmed");
  assert.equal(confirmed.tagline, "sourced-try");
  assert.equal(confirmed.age_min_months, 6);
  assert.equal(confirmed.age_max_months, 60);
  assert.equal(confirmed.ages_confirmed, 1);
  assert.equal(confirmed.ages_source, "owner-edit");
  assert.equal(confirmed.ages_source_url, "https://owner.example/ages");

  await query(DAYCARE_UPSERT_SQL, daycareUpsertParams(listing("claimed", 0)));
  await query(`update daycares set claimed_at = now(), age_min_months = 4, age_max_months = 40 where id = 'claimed'`);
  await query(
    DAYCARE_UPSERT_SQL,
    daycareUpsertParams({
      ...listing("claimed", 1),
      tagline: "should-stay",
      ageMinMonths: 3,
      ageMaxMonths: 24,
      agesSource: "website_stated",
      agesSourceUrl: "https://example.com/ages",
    }),
  );
  const claimed = await readAges(pg, "claimed");
  assert.equal(claimed.tagline, "first");
  assert.equal(claimed.age_min_months, 4);
  assert.equal(claimed.age_max_months, 40);
  assert.equal(Number(claimed.ages_confirmed), 0);

  await query(DAYCARE_UPSERT_SQL, daycareUpsertParams({ ...listing("owned", 0), ageMinMonths: 4, ageMaxMonths: 10 }));
  await query(`insert into provider_daycares (user_id, daycare_id) values ('prov', 'owned')`);
  await query(
    DAYCARE_UPSERT_SQL,
    daycareUpsertParams({
      ...listing("owned", 1),
      ageMinMonths: 3,
      ageMaxMonths: 24,
      agesSource: "website_stated",
      agesSourceUrl: "https://example.com/ages",
    }),
  );
  const owned = await readAges(pg, "owned");
  assert.equal(owned.age_min_months, 4);
  assert.equal(owned.age_max_months, 10);
  assert.equal(Number(owned.ages_confirmed), 0);

  await query(DAYCARE_UPSERT_SQL, daycareUpsertParams({ ...listing("filled", 0), ageMinMonths: 8, ageMaxMonths: 20 }));
  await query(
    DAYCARE_UPSERT_SQL,
    daycareUpsertParams({ ...listing("filled", 0), ageMinMonths: 0, ageMaxMonths: 0, agesSource: "", agesSourceUrl: "" }),
  );
  const filled = await readAges(pg, "filled");
  assert.equal(filled.age_min_months, 8);
  assert.equal(filled.age_max_months, 20);
  assert.equal(filled.ages_source, null);

  await query(
    DAYCARE_UPSERT_SQL,
    daycareUpsertParams({
      ...listing("filled", 1),
      ageMinMonths: 3,
      ageMaxMonths: 24,
      agesSource: "licensing_stated_range",
      agesSourceUrl: "https://example.com/ages",
    }),
  );
  const sourced = await readAges(pg, "filled");
  assert.equal(sourced.age_min_months, 3);
  assert.equal(sourced.age_max_months, 24);
  assert.equal(sourced.ages_confirmed, 1);
  assert.equal(sourced.ages_source, "licensing_stated_range");
  assert.equal(sourced.ages_source_url, "https://example.com/ages");

  await query(
    DAYCARE_UPSERT_SQL,
    daycareUpsertParams({ ...listing("filled", 0), ageMinMonths: 0, ageMaxMonths: 0, tagline: "after" }),
  );
  const kept = await readAges(pg, "filled");
  assert.equal(kept.tagline, "after");
  assert.equal(kept.age_min_months, 3);
  assert.equal(kept.age_max_months, 24);
  assert.equal(kept.ages_confirmed, 1);
  assert.equal(kept.ages_source, "licensing_stated_range");
});

test("sourced age migration updates eligible rows once and leaves the rest", async () => {
  const pg = new PGlite();
  await pg.exec(`
    create table _migrations (name text primary key, applied_at timestamptz not null default now());
    create table daycares (
      id text primary key,
      claimed_at timestamptz,
      age_min_months int,
      age_max_months int,
      ages_confirmed int not null default 0,
      ages_source text,
      ages_source_url text,
      claim_status text not null default 'unclaimed'
    );
    create table provider_daycares (daycare_id text);
    create table listing_claims (daycare_id text);
    create table centre_members (daycare_id text);
    insert into daycares (id, age_min_months, age_max_months, ages_confirmed) values
      ('mb-1172', 0, 0, 0),
      ('mb-9654', 1, 2, 1),
      ('mb-102660', 0, 0, 0),
      ('bc-2', 9, 10, 0),
      ('ns-5515087', 4, 5, 0),
      ('${AGES_PROTECTED_LISTING_ID}', 7, 8, 0);
    update daycares set claimed_at = now() where id = 'bc-2';
    update daycares set ages_source = 'keep' where id = 'mb-9654';
    update daycares set claim_status = 'pending' where id = 'mb-102660';
    insert into provider_daycares (daycare_id) values ('ns-5515087');
    insert into listing_claims (daycare_id) values ('ns-5515087');
    insert into centre_members (daycare_id) values ('mb-1172');
  `);
  const query = (text, params) => pg.query(text, params);
  const file = parseSourcedAges(csv);
  const batch = [
    file.get("mb-1172"),
    file.get("mb-9654"),
    file.get("mb-102660"),
    file.get("bc-2"),
    file.get("ns-5515087"),
    age("missing-id", 1, 2),
    age(AGES_PROTECTED_LISTING_ID, 1, 12),
  ];
  const first = await applySourcedAgeUpdates(query, batch);
  const second = await applySourcedAgeUpdates(query, batch);
  assert.equal(first, 2);
  assert.equal(second, 0);

  const rows = await pg.query(
    `select id, age_min_months, age_max_months, ages_confirmed, ages_source from daycares order by id`,
  );
  const byId = Object.fromEntries(rows.rows.map((row) => [row.id, row]));
  assert.equal(byId["mb-1172"].age_min_months, 3);
  assert.equal(byId["mb-1172"].age_max_months, 24);
  assert.equal(byId["mb-1172"].ages_confirmed, 1);
  assert.match(byId["mb-1172"].ages_source, /licensing_groups/);
  assert.equal(byId["mb-9654"].age_min_months, 1);
  assert.equal(byId["mb-9654"].age_max_months, 2);
  assert.equal(byId["mb-9654"].ages_source, "keep");
  assert.equal(byId["mb-102660"].age_min_months, 0);
  assert.equal(byId["mb-102660"].ages_confirmed, 0);
  assert.equal(byId["bc-2"].age_min_months, 9);
  assert.equal(byId["ns-5515087"].age_min_months, 18);
  assert.equal(byId["ns-5515087"].age_max_months, 144);
  assert.equal(byId["ns-5515087"].ages_confirmed, 1);
  assert.equal(byId[AGES_PROTECTED_LISTING_ID].age_min_months, 7);
  assert.equal(byId[AGES_PROTECTED_LISTING_ID].age_max_months, 8);
  const invented = await pg.query(`select id from daycares where id = 'missing-id'`);
  assert.equal(invented.rows.length, 0);

  const recorded = await applyRecordedSourcedAges(query, root);
  assert.equal(recorded.applied, true);
  assert.equal(recorded.updated, 0);
  const again = await applyRecordedSourcedAges(query, root);
  assert.equal(again.applied, false);
  assert.equal(again.updated, 0);
  const still = await pg.query(
    `select age_min_months, age_max_months, ages_confirmed from daycares where id = 'mb-1172'`,
  );
  assert.equal(still.rows[0].age_min_months, 3);
  assert.equal(still.rows[0].age_max_months, 24);
  assert.equal(still.rows[0].ages_confirmed, 1);
  const marked = await pg.query(`select name from _migrations where name = $1`, [SOURCED_AGES_MIGRATION]);
  assert.equal(marked.rows.length, 1);
  const retry = await applyRecordedSourcedAges(query, root, SOURCED_AGES_UNCLAIMED_RETRY);
  assert.equal(retry.applied, true);
  assert.equal(retry.updated, 0);
  const retryAgain = await applyRecordedSourcedAges(query, root, SOURCED_AGES_UNCLAIMED_RETRY);
  assert.equal(retryAgain.applied, false);
  assert.equal(retryAgain.updated, 0);

  await pg.exec(`
    insert into daycares (id, age_min_months, age_max_months, ages_confirmed, claim_status) values
      ('mb-100034 ', 0, 0, 0, 'unclaimed'),
      ('mb-100926${"\u00a0"}', 0, 0, 0, 'declined'),
      ('mb-101669', 0, 0, 0, 'approved'),
      ('mb-102052', 0, 0, 0, ' Live ');
  `);
  const trimmed = await applyRecordedSourcedAges(query, root, SOURCED_AGES_ID_TRIM);
  assert.equal(trimmed.applied, true);
  assert.equal(trimmed.updated, 2);
  const spaced = await pg.query(`select age_min_months, age_max_months, ages_confirmed from daycares where id = 'mb-100034 '`);
  assert.equal(spaced.rows[0].age_min_months, 3);
  assert.equal(spaced.rows[0].age_max_months, 144);
  assert.equal(spaced.rows[0].ages_confirmed, 1);
  const nbsp = await pg.query(
    `select age_min_months, ages_confirmed from daycares where id = 'mb-100926${"\u00a0"}'`,
  );
  assert.equal(nbsp.rows[0].age_min_months, 60);
  assert.equal(nbsp.rows[0].ages_confirmed, 1);
  const approved = await pg.query(`select age_min_months, ages_confirmed from daycares where id = 'mb-101669'`);
  assert.equal(approved.rows[0].age_min_months, 0);
  assert.equal(approved.rows[0].ages_confirmed, 0);
  const liveStatus = await pg.query(`select age_min_months, ages_confirmed from daycares where id = 'mb-102052'`);
  assert.equal(liveStatus.rows[0].age_min_months, 0);
  assert.equal(liveStatus.rows[0].ages_confirmed, 0);
  const trimmedAgain = await applyRecordedSourcedAges(query, root, SOURCED_AGES_ID_TRIM);
  assert.equal(trimmedAgain.applied, false);
  assert.equal(trimmedAgain.updated, 0);
  const markedTrim = await pg.query(`select name from _migrations where name = $1`, [SOURCED_AGES_ID_TRIM]);
  assert.equal(markedTrim.rows.length, 1);
});

test("deploy migrate logs the confirmed age count and does not print a database url", () => {
  const migrate = readFileSync(join(root, "scripts/migrate.mjs"), "utf8");
  assert.match(migrate, /ages_confirmed=1 count/);
  assert.match(migrate, /applyRecordedSourcedAges/);
  assert.match(migrate, /SOURCED_AGES_UNCLAIMED_RETRY/);
  assert.match(migrate, /SOURCED_AGES_ID_TRIM/);
  assert.doesNotMatch(migrate, /console\.log\(databaseUrl\)/);
  assert.doesNotMatch(migrate, /console\.log\(process\.env\.DATABASE_URL\)/);
});

test("master sync stamps sourced ages by listing id and skips the protected id", () => {
  const ages = `listing_id,facility_id,age_min_months,age_max_months,age_groups,ages_source,ages_source_url
bc-1,BC|1,6,36,infant,website_stated,https://example.com/willow
${AGES_PROTECTED_LISTING_ID},X|1,1,12,infant,website_stated,https://example.com/no
`;
  const plan = syncMasterCatalogue(
    [
      { id: "bc-1", slug: "willow", name: "Willow", province: "BC", city: "Campbell River" },
      { id: AGES_PROTECTED_LISTING_ID, slug: "kids-world", name: "Kids World", province: "AB", city: "Edmonton" },
    ],
    "facility_id,name,licence_number,facility_type,street_address,city,province,postal_code\n",
    ages,
  );
  const willow = plan.rows.find((row) => row.id === "bc-1");
  const locked = plan.rows.find((row) => row.id === AGES_PROTECTED_LISTING_ID);
  assert.equal(willow.ageMinMonths, 6);
  assert.equal(willow.ageMaxMonths, 36);
  assert.equal(willow.agesConfirmed, 1);
  assert.equal(willow.agesSourceUrl, "https://example.com/willow");
  assert.equal(locked.ageMinMonths, undefined);
  assert.equal(stampSourcedAge({ id: AGES_PROTECTED_LISTING_ID, ageMinMonths: 7 }, parseSourcedAges(ages)).ageMinMonths, 7);
});
