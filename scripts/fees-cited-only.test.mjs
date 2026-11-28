import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  CITED_LISTING_FEE_SQL,
  feeIsCitedListingFee,
  hasCitedListingFee,
  isDefaultFeeSource,
} from "../src/lib/cited-fee.ts";
import { CATALOG_COUNT_SQL, catalogCountsFromRow } from "../src/lib/catalog-counts.ts";
import { listingFeeNotes, monthlyFeeVisible } from "../src/lib/public-programs.ts";
import { parentListingMonthlyFee } from "../src/lib/public-fees.ts";
import { copy } from "../src/lib/copy.ts";

const src = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("KB-55: only a listing-level, cited fee counts", () => {
  assert.equal(feeIsCitedListingFee({ feeConfidence: "centre", factSource: "Centre fee sheet" }), true);
  assert.equal(feeIsCitedListingFee({ feeConfidence: "estimate", factSource: "https://kids.example.ca/fees" }), false);
  assert.equal(feeIsCitedListingFee({ factSource: "https://kids.example.ca/fees" }), true);
  assert.equal(feeIsCitedListingFee({ factSource: "Centre fee sheet, phoned 2026-10-02" }), true);
  // City and province defaults are not this centre's fee.
  assert.equal(feeIsCitedListingFee({ factSource: "https://www.ontario.ca/page/child-care-ontario" }), false);
  assert.equal(feeIsCitedListingFee({ factSource: "https://www.gov.mb.ca/education/childcare/" }), false);
  assert.equal(feeIsCitedListingFee({ factSource: "https://www2.gov.bc.ca/gov/content/family-social-supports" }), false);
  assert.equal(feeIsCitedListingFee({ factSource: "https://www.quebec.ca/famille" }), false);
  assert.equal(feeIsCitedListingFee({ feeConfidence: "centre" }), false);
  assert.equal(feeIsCitedListingFee({ factSource: "https://kids.example.ca/photos" }), false);
  assert.equal(feeIsCitedListingFee({}), false);
  assert.equal(feeIsCitedListingFee({ factSource: "   " }), false);
  // A centre website on .ca is fine; "ontario" inside a centre's own domain is fine.
  assert.equal(isDefaultFeeSource("https://littleontariokids.ca/rates"), false);
  assert.equal(isDefaultFeeSource("https://canada.ca/en/early-learning"), true);

  assert.equal(hasCitedListingFee({ feeConfidence: "centre", factSource: "Centre fee sheet", preschoolMonthly: 1025 }), true);
  assert.equal(hasCitedListingFee({ feeConfidence: "centre", factSource: "Centre fee sheet", preschoolMonthly: 218 }), false);
  assert.equal(hasCitedListingFee({ preschoolMonthly: 1025 }), false);
});

test("KB-55: a city default on a live or claimed listing is not shown as a fee", () => {
  const liveDefault = listingFeeNotes({ live: true, province: "MB", preschoolMonthly: 1025 });
  assert.equal(liveDefault.priceList, false);
  assert.equal(liveDefault.confidence, "estimate");

  const sourced = listingFeeNotes({ live: false, province: "MB", preschoolMonthly: 1025, factSource: "https://paradise.example.ca/fees" });
  assert.equal(sourced.priceList, true);
  assert.equal(sourced.source, "website");

  const typed = listingFeeNotes({ live: true, preschoolMonthly: 1025, feeConfidence: "centre", factSource: "Centre fee sheet" });
  assert.equal(typed.priceList, true);
  assert.equal(typed.confidence, "centre");

  assert.equal(monthlyFeeVisible(1025, { feeConfidence: null, factSource: null }), false);
  assert.equal(monthlyFeeVisible(1025, { feeConfidence: "centre", factSource: "Centre fee sheet" }), true);
  assert.equal(parentListingMonthlyFee({ fromPrice: 1025, feeConfirmed: true, province: "MB" }), null);
  assert.equal(parentListingMonthlyFee({ fromPrice: 1025, feeConfidence: "centre", factSource: "Centre fee sheet", province: "MB" }), 1025);

  const readiness = src("src/lib/listing-readiness.ts");
  assert.match(readiness, /feeConfirmed: hasCitedListingFee\(d\)/);
  assert.doesNotMatch(readiness, /Boolean\(d\.feeConfirmed\) \|\| hasListedFees\(d\)/);
});

test("KB-55: Ask the centre copy in English and Canadian French; no fee pills on home cards", () => {
  assert.equal(copy.en.feeAskCentre, "Ask the centre");
  assert.equal(copy.fr.feeAskCentre, "Renseignez-vous auprès du centre");
  const card = src("src/components/daycare-card.tsx");
  assert.match(card, /hasCitedListingFee\(item\)/);
  assert.match(card, /t\("feeAskCentre"\)/);
  assert.doesNotMatch(card, /live \|\| Boolean\(item\.feeConfirmed\) \|\| Boolean\(subsidy\)/);
  const home = src("src/components/home-discovery.tsx");
  assert.equal((home.match(/showFees=\{false\}/g) || []).length, 3);
  assert.match(src("src/routes/daycare.$slug.tsx"), /feeAskCentre/);
});

async function catalogDb() {
  const pg = new PGlite();
  await pg.exec(`
    create table daycares (
      id text primary key, slug text, name text, city text, province text, address text,
      license_number text, merged_into text, import_fault text, listing_active int, is_test int, is_demo int,
      visibility text, claim_status text, pause_code text, pause_reason text, removed_at timestamptz,
      photos text, ages_confirmed int, fee_program text, fact_source text, fee_confidence text,
      infant_monthly numeric, toddler_monthly numeric, preschool_monthly numeric, part_time_monthly numeric
    );
  `);
  return pg;
}

async function addColumnsUntilItRuns(pg, text) {
  for (let i = 0; i < 20; i++) {
    try {
      return await pg.query(text);
    } catch (err) {
      const m = /column "([a-z_]+)" does not exist/.exec(String(err?.message));
      if (!m) throw err;
      await pg.exec(`alter table daycares add column ${m[1]} text`);
    }
  }
  throw new Error("too many missing columns");
}

test("KB-55: /api/health feesConfirmed counts only listing-level cited fees (PGlite)", async () => {
  const pg = await catalogDb();
  const rows = [
    // City default on every row: amount, no citation (the 37k case).
    ["city-1", "Winnipeg", null, null, 1025, null],
    ["city-2", "Winnipeg", null, null, 900, null],
    // Province page citation is still a default.
    ["prov-1", "Toronto", "https://www.ontario.ca/page/child-care-ontario", null, 477, null],
    // Public estimate tag never counts, even with a source.
    ["est-1", "Winnipeg", "https://kids.example.ca/fees", "estimate", 1100, null],
    // $10-a-day program flag with no amount is not a listing fee.
    ["prog-1", "Winnipeg", null, null, null, "mb-10-day"],
    // 218 catalogue guess is never a fee.
    ["guess-1", "Winnipeg", "https://kids.example.ca/fees", "centre", 218, null],
    // Listing-level and cited.
    ["centre-1", "Winnipeg", "Centre fee sheet", "centre", 1180, null],
    ["site-1", "Brandon", "https://brandonkids.example.ca/rates", null, 950, null],
  ];
  for (const [id, city, source, confidence, fee, program] of rows) {
    await pg.query(
      `insert into daycares (id, slug, name, city, province, license_number, fact_source, fee_confidence, preschool_monthly, fee_program, photos)
       values ($1, $1, $1, $2, 'MB', $1, $3, $4, $5, $6, '')`,
      [id, city, source, confidence, fee, program],
    );
  }
  const result = await addColumnsUntilItRuns(pg, CATALOG_COUNT_SQL);
  const counts = catalogCountsFromRow(result.rows[0]);
  assert.equal(counts.listingsTotal, 8);
  assert.equal(counts.feesConfirmed, 2);

  const ids = await pg.query(`select id from daycares where ${CITED_LISTING_FEE_SQL} order by id`);
  assert.deepEqual(ids.rows.map((r) => r.id), ["centre-1", "guess-1", "site-1"]);

  // Display/query only: nothing was rewritten.
  const after = await pg.query(`select count(*)::int as n from daycares where preschool_monthly is not null`);
  assert.equal(after.rows[0].n, 7);
});

test("KB-55: gov demand fee counts use the same cited rule", () => {
  const gov = src("src/lib/server/gov-data.server.ts");
  assert.match(gov, /CITED_LISTING_FEE_SQL\}\)::int as "feesConfirmed"/);
  assert.match(gov, /not \$\{CITED_LISTING_FEE_SQL\}\)::int as "feesUncited"/);
  assert.doesNotMatch(gov, /when btrim\(coalesce\(fact_source, ''\)\) <> '' then 'confirmed'/);
});
