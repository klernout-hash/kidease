import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CATALOG_SOURCE_ENV,
  NEON_CATALOG_MIN_COUNT,
  catalogSourceFromEnv,
  describeCatalogRuntime,
  neonCatalogMinCount,
  preferNeonCatalog,
} from "../src/lib/catalog-source.ts";
import {
  DAYCARE_UPSERT_SQL,
  daycareUpsertParams,
  preserveFilledContact,
} from "../src/lib/catalog-upsert.ts";
import { mergeBlankContacts, parseMasterContacts, splitCsvLine } from "../src/lib/catalog-master.ts";
import { clampSeedLimit, clampSeedOffset, seedCatalogChunk } from "../src/lib/catalog-seed.ts";
import { parseSeedArgs, seedHelpText } from "./seed-catalog-to-neon.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function sampleListing(over = {}) {
  return {
    id: "bc-1",
    slug: "bonnie-bairns-childcare-services-1",
    name: "Bonnie Bairns",
    nameFr: "Bonnie Bairns",
    tagline: "Licensed centre in North Vancouver, BC.",
    taglineFr: "Centre permis.",
    description: "A licensed centre.",
    descriptionFr: "Un centre permis.",
    address: "2260 Philip Ave",
    city: "North Vancouver",
    province: "BC",
    postalCode: "V7P 2W8",
    lat: 49.33,
    lng: -123.11,
    phone: "604-983-2600",
    hours: "",
    hoursFr: "",
    ageMinMonths: 0,
    ageMaxMonths: 0,
    infantMonthly: null,
    toddlerMonthly: null,
    preschoolMonthly: null,
    partTimeMonthly: null,
    spotsInfant: 0,
    spotsToddler: 0,
    spotsPreschool: 0,
    waitlist: 0,
    ratingX10: 0,
    reviews: [],
    licenseNumber: "1",
    languages: "en",
    amenities: "licensed,funded",
    photos: ["/photos/buildings/bc-1.jpg"],
    googlePlaceId: null,
    visibility: "public",
    isTest: false,
    ...over,
  };
}

describe("catalog source preference", () => {
  it("defaults to auto and requires a national-scale count", () => {
    assert.equal(catalogSourceFromEnv({}), "auto");
    assert.equal(catalogSourceFromEnv({ [CATALOG_SOURCE_ENV]: "neon" }), "neon");
    assert.equal(catalogSourceFromEnv({ [CATALOG_SOURCE_ENV]: "JSON" }), "json");
    assert.equal(neonCatalogMinCount({}), NEON_CATALOG_MIN_COUNT);
    assert.equal(neonCatalogMinCount({ NEON_CATALOG_MIN_COUNT: "50" }), 50);
    assert.equal(preferNeonCatalog({ neonAvailable: true, publicCount: 400, source: "auto" }), false);
    assert.equal(
      preferNeonCatalog({ neonAvailable: true, publicCount: NEON_CATALOG_MIN_COUNT, source: "auto" }),
      true,
    );
    assert.equal(preferNeonCatalog({ neonAvailable: true, publicCount: 12, source: "neon" }), true);
    assert.equal(preferNeonCatalog({ neonAvailable: true, publicCount: 20_000, source: "json" }), false);
    assert.equal(preferNeonCatalog({ neonAvailable: false, publicCount: 20_000, source: "neon" }), false);
    assert.equal(preferNeonCatalog({ neonAvailable: true, publicCount: 0, source: "neon" }), false);
  });

  it("describes Neon as SoT and never treats Drive CSV as runtime truth", () => {
    const neon = describeCatalogRuntime({
      neonAvailable: true,
      publicCount: NEON_CATALOG_MIN_COUNT,
      source: "auto",
    });
    assert.equal(neon.runtime, "neon");
    assert.equal(neon.preferred, true);
    assert.match(neon.reason, /seed-only/);
    const json = describeCatalogRuntime({ neonAvailable: false, publicCount: 0, source: "auto" });
    assert.equal(json.runtime, "json");
    assert.match(json.reason, /Drive|CSV|JSON/);
    assert.doesNotMatch(src("src/lib/catalog.ts"), /MASTER_CSV/);
    assert.doesNotMatch(src("src/lib/server/catalog-neon.ts"), /MASTER_CSV/);
    assert.match(src("src/lib/server/catalog-neon.ts"), /readCatalogHealth/);
    assert.match(src("src/lib/server/catalog-health.ts"), /getCatalogHealth/);
    assert.match(src("src/routes/admin.tsx"), /getCatalogHealth/);
    assert.match(src("docs/catalog-source.md"), /never treats Drive/);
  });
});

describe("upsert blank-preservation", () => {
  it("keeps a filled contact when the incoming value is blank", () => {
    assert.equal(preserveFilledContact("204-555-0100", ""), "204-555-0100");
    assert.equal(preserveFilledContact("204-555-0100", "   "), "204-555-0100");
    assert.equal(preserveFilledContact("", "204-555-0199"), "204-555-0199");
    assert.equal(preserveFilledContact(null, null), "");
    assert.equal(preserveFilledContact("a@b.ca", ""), "a@b.ca");
    assert.equal(preserveFilledContact("", "https://centre.example"), "https://centre.example");
  });

  it("SQL never updates claimed rows and never blanks filled contacts", () => {
    assert.match(DAYCARE_UPSERT_SQL, /where daycares\.claimed_at is null/);
    assert.match(DAYCARE_UPSERT_SQL, /excluded\.phone is null or btrim\(excluded\.phone\) = ''/);
    assert.match(DAYCARE_UPSERT_SQL, /excluded\.contact_email is null or btrim\(excluded\.contact_email\) = ''/);
    assert.match(DAYCARE_UPSERT_SQL, /excluded\.website is null or btrim\(excluded\.website\) = ''/);
    assert.match(DAYCARE_UPSERT_SQL, /tagline = excluded\.tagline/);
    assert.match(DAYCARE_UPSERT_SQL, /address = excluded\.address/);
    const params = daycareUpsertParams(sampleListing({ phone: "", contactEmail: "", website: "" }));
    assert.equal(params[14], null);
    assert.equal(params[35], null);
    assert.equal(params[36], null);
  });

  it("seedDaycare uses the shared upsert SQL", () => {
    const seed = src("src/lib/server/seed.ts");
    assert.match(seed, /DAYCARE_UPSERT_SQL/);
    assert.match(seed, /daycareUpsertParams/);
    assert.doesNotMatch(seed, /spots_infant = excluded\.spots_infant\n\s+where daycares\.claimed_at/);
  });
});

describe("master CSV blank-only merge", () => {
  it("parses contacts and fills blanks only", () => {
    const csv = `id,phone,email,website
bc-1,,ops@example.com,https://example.com
bc-1,204-555-0100,,
`;
    const master = parseMasterContacts(csv);
    const filled = mergeBlankContacts(
      sampleListing({ phone: "604-983-2600", contactEmail: "", website: "" }),
      master,
    );
    assert.equal(filled.phone, "604-983-2600");
    assert.equal(filled.contactEmail, "ops@example.com");
    assert.equal(filled.website, "https://example.com");
    const empty = mergeBlankContacts(sampleListing({ phone: "", contactEmail: "", website: "" }), master);
    assert.equal(empty.phone, "204-555-0100");
    assert.equal(splitCsvLine('a,"b,c",d').join("|"), "a|b,c|d");
  });
});

describe("seed chunk runner", () => {
  it("upserts a slice and reports progress", async () => {
    const queries = [];
    const sql = {
      query: async (text, params) => {
        queries.push({ text, params });
      },
    };
    const rows = [sampleListing(), sampleListing({ id: "bc-2", slug: "two" }), sampleListing({ id: "bc-3", slug: "three" })];
    const result = await seedCatalogChunk(sql, rows, { offset: 1, limit: 2, concurrency: 2 });
    assert.equal(result.attempted, 2);
    assert.equal(result.upserted, 2);
    assert.equal(result.failed, 0);
    assert.equal(result.nextOffset, 3);
    assert.equal(result.done, true);
    assert.equal(queries.length, 2);
    assert.match(queries[0].text, /claimed_at is null/);
    assert.equal(clampSeedOffset(-3, 10), 0);
    assert.equal(clampSeedLimit(900), 500);
  });
});

describe("seed script smoke", () => {
  it("parses flags and documents Production seed without secrets", () => {
    const opts = parseSeedArgs(["--offset=40", "--chunk=50", "--dry-run", "--resume"], {
      MASTER_CSV_PATH: "/tmp/private-master.csv",
    });
    assert.equal(opts.offset, 40);
    assert.equal(opts.chunk, 50);
    assert.equal(opts.dryRun, true);
    assert.equal(opts.resume, true);
    assert.equal(opts.masterCsvPath, "/tmp/private-master.csv");
    const help = seedHelpText();
    assert.match(help, /DATABASE_URL/);
    assert.match(help, /MASTER_CSV_PATH/);
    assert.match(help, /CRON_SECRET/);
    assert.doesNotMatch(help, /604-983-2600|@example\.com/);
    assert.match(src("package.json"), /ops:seed-catalog/);
    assert.doesNotMatch(src("package.json"), /build": ".*ops:seed-catalog/);
    assert.doesNotMatch(src("scripts/migrate.mjs"), /seed-catalog/);
    assert.doesNotMatch(src("vercel.json"), /seed-catalog/);
  });
});

describe("null catalog rows stay renderable", () => {
  it("coerces a missing name and skips rows without id or slug", () => {
    const neon = src("src/lib/server/catalog-neon.ts");
    const utils = src("src/lib/utils.ts");
    assert.match(utils, /value: string \| null \| undefined/);
    assert.match(utils, /String\(value \?\? ""\)/);
    assert.match(neon, /export function catalogRowRenderable/);
    assert.match(neon, /rows\.filter\(catalogRowRenderable\)/);
    assert.match(neon, /correctCentreNameTypos\(String\(row\.name \|\| ""\)\.trim\(\)\) \|\| slug/);
    assert.match(neon, /Licensed centre/);
  });
});

describe("runtime SoT prefers Neon when populated", () => {
  it("catalog and nearby fall back to JSON only when Neon is empty", () => {
    const catalog = src("src/lib/catalog.ts");
    const nearby = src("src/lib/server/nearby.ts");
    const neon = src("src/lib/server/catalog-neon.ts");
    assert.match(catalog, /loadJsonCatalog/);
    assert.match(catalog, /loadNeonCatalogIfPreferred/);
    assert.match(catalog, /nearbyFromNeonIfPreferred/);
    assert.match(nearby, /isNeonCatalogPreferred/);
    assert.match(nearby, /catalogNearFromJson/);
    assert.match(nearby, /void importCatalogSlice/);
    assert.match(nearby, /nearby-sql-timeout/);
    assert.match(neon, /st_dwithin/i);
    assert.match(neon, /st_makepoint\(\$1, \$2\)/);
    assert.match(neon, /PUBLIC_LISTING_SQL/);
    assert.match(src("src/lib/listing-visibility.ts"), /name not like 'TEST %'/);
    assert.match(src("src/lib/server/daycares.ts"), /catalogByIdsGet/);
    assert.match(src("src/lib/server/daycares.ts"), /isPublicListing/);
  });
});
