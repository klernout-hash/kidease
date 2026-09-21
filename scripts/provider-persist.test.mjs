import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "url";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { DAYCARE_UPSERT_SQL, daycareUpsertParams } from "../src/lib/catalog-upsert.ts";
import { nonNegativeInt } from "../src/lib/spot-counts.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("open spot counts reject blank and non-numeric input", () => {
  assert.equal(nonNegativeInt(3), 3);
  assert.equal(nonNegativeInt(1.6), 2);
  assert.equal(nonNegativeInt(0), 0);
  assert.equal(nonNegativeInt(-4), 0);
  assert.equal(nonNegativeInt(Number.NaN), 0);
  assert.equal(nonNegativeInt(""), 0);
  assert.equal(nonNegativeInt("12"), 12);
});

test("catalogue import leaves provider-owned and claimed rows alone", () => {
  const upsert = src("src/lib/catalog-upsert.ts");
  assert.match(upsert, /where daycares\.claimed_at is null/);
  assert.match(upsert, /not exists \([\s\S]*provider_daycares/);
  assert.match(upsert, /not exists \([\s\S]*listing_claims/);
  assert.match(upsert, /not exists \([\s\S]*centre_members/);
  assert.doesNotMatch(upsert, /claim_status/);
  assert.match(src("migrations/0052_provider_daycare_lookup.sql"), /provider_daycares_daycare_idx/);
});

test("listing save reports failures and keeps parent-desk fields dirty", () => {
  const form = src("src/components/provider-listing-forms.tsx");
  assert.match(form, /facilityType !== savedParent\.facilityType/);
  assert.match(form, /scheduleOptions/);
  assert.match(form, /openingWindow/);
  assert.match(form, /amenityKeys/);
  assert.match(form, /\.catch\(\(err\) => toast\.error/);
  assert.match(form, /listingDeskRevision/);
  const claims = src("src/lib/server/claims.ts");
  assert.match(claims, /assertCentreCanMutateListing/);
  assert.match(claims, /nonNegativeInt\(data\.spotsInfant\)/);
  assert.match(claims, /returning id/);
  assert.match(claims, /update daycares set license_photo/);
  const store = claims.slice(claims.indexOf("async function storeLicensePhoto"), claims.indexOf("export const searchClaimable"));
  assert.doesNotMatch(store, /\.catch\(/);
  const culture = claims.slice(claims.indexOf("const culture = cultureFieldsToSql"), claims.indexOf("const facilityType"));
  assert.doesNotMatch(culture, /\.catch\(\(\) => undefined\)/);
});

test("licence claim accepts a PDF and the provider desk can see a claim-row file", () => {
  const claim = src("src/routes/claim.tsx");
  assert.match(claim, /!license\.startsWith\("data:image"\) && !license\.startsWith\("data:application\/pdf"\)/);
  assert.match(src("src/lib/server/family.ts"), /overlayClaimLicensePhotos/);
  assert.match(src("src/lib/server/daycares.ts"), /provider_daycares pd where pd\.daycare_id = d\.id/);
  assert.match(src("src/lib/server/trust.ts"), /assertCentreCanMutateListing/);
  assert.match(src("src/routes/api/license-docs.$daycareId.ts"), /assertCentreCanMutateListing/);
});

function sampleListing(id, spotsInfant) {
  return {
    id,
    slug: id,
    name: "Prairie Kids",
    nameFr: "Prairie Kids",
    tagline: "t",
    taglineFr: "t",
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
    infantMonthly: 800,
    toddlerMonthly: 700,
    preschoolMonthly: 600,
    partTimeMonthly: null,
    spotsInfant,
    spotsToddler: 1,
    spotsPreschool: 1,
    waitlist: 0,
    ratingX10: 40,
    reviewCount: 0,
    licenseNumber: "MB-1",
    languages: "en",
    amenities: "meals",
    photos: ["/photos/cottage.jpg"],
  };
}

test("catalogue upsert keeps provider open spots and screening metadata sticks", async () => {
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
      claimed_at timestamptz
    );
    create table provider_daycares (
      user_id text not null,
      daycare_id text not null references daycares(id),
      primary key (user_id, daycare_id)
    );
    create table listing_claims (
      id text primary key,
      daycare_id text not null,
      user_id text
    );
    create table centre_members (
      id text primary key,
      daycare_id text not null
    );
    create table provider_screening_documents (
      id text primary key,
      daycare_id text not null,
      person_id text not null,
      doc_kind text not null,
      status text not null,
      issued_on date,
      expires_on date,
      storage_ref text,
      storage_mime text,
      original_filename text,
      reviewer_notes text,
      reviewed_by text,
      reviewed_at timestamptz,
      letter_generated_at timestamptz,
      uploaded_by text,
      uploaded_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create unique index provider_screening_docs_person_kind_uidx
      on provider_screening_documents (person_id, doc_kind);
  `);

  await pg.query(DAYCARE_UPSERT_SQL, daycareUpsertParams(sampleListing("owned", 2)));
  await pg.query(`update daycares set spots_infant = 9, claimed_at = null where id = 'owned'`);
  await pg.query(`insert into provider_daycares (user_id, daycare_id) values ('prov', 'owned')`);
  await pg.query(DAYCARE_UPSERT_SQL, daycareUpsertParams(sampleListing("owned", 0)));
  const owned = await pg.query(`select spots_infant from daycares where id = 'owned'`);
  assert.equal(owned.rows[0].spots_infant, 9);

  await pg.query(DAYCARE_UPSERT_SQL, daycareUpsertParams(sampleListing("fresh", 4)));
  await pg.query(DAYCARE_UPSERT_SQL, daycareUpsertParams(sampleListing("fresh", 0)));
  const fresh = await pg.query(`select spots_infant from daycares where id = 'fresh'`);
  assert.equal(fresh.rows[0].spots_infant, 0);

  const screeningSrc = src("src/lib/server/provider-screening.ts");
  const block = screeningSrc.slice(
    screeningSrc.indexOf("insert into provider_screening_documents ("),
    screeningSrc.indexOf("returning id, storage_ref, status"),
  );
  let n = 0;
  const screeningSql = `${block.replace(/\$\{[^}]+\}/g, () => `$${++n}`)} returning id, storage_ref, status`;
  assert.equal(n, 16);
  const upload = [
    "sd1",
    "owned",
    "person-1",
    "vsc",
    "admin_review",
    "2026-09-01",
    "2027-09-01",
    "screening/owned/person-1/vsc-1.pdf",
    "application/pdf",
    "vsc.pdf",
    null,
    null,
    null,
    null,
    "prov",
    "2026-09-21T15:00:00.000Z",
  ];
  const saved = await pg.query(screeningSql, upload);
  assert.equal(saved.rows[0].status, "admin_review");
  assert.equal(saved.rows[0].storage_ref, "screening/owned/person-1/vsc-1.pdf");
  const empty = [...upload];
  empty[0] = "sd2";
  empty[4] = "admin_review";
  empty[7] = null;
  const kept = await pg.query(screeningSql, empty);
  assert.equal(kept.rows[0].status, "admin_review");
  assert.equal(kept.rows[0].storage_ref, "screening/owned/person-1/vsc-1.pdf");
  await pg.close();
});

test("screening upload writes status with the file and does not archive people when member sync fails", () => {
  const screening = src("src/lib/server/provider-screening.ts");
  assert.match(screening, /on conflict \(person_id, doc_kind\)/);
  assert.match(screening, /Document did not save/);
  assert.match(screening, /visibleScreeningStatus/);
  const sync = screening.slice(
    screening.indexOf("async function syncScreeningPeople"),
    screening.indexOf("async function refreshScreeningOnFile"),
  );
  assert.match(sync, /Member list failed/);
  assert.doesNotMatch(sync.slice(0, sync.indexOf("for (const member")), /\.catch\(\(\) => \[\]\)/);
});
