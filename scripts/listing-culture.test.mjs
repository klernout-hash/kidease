import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CULTURAL_PROGRAM_OPTIONS,
  CULTURAL_TEAM_NOTE_MAX,
  cultureFieldsToSql,
  hasListingCulture,
  listingCultureFrom,
  normalizeCulturalTeamNote,
  normalizeStaffLanguages,
  parseStringList,
  STAFF_LANGUAGE_OPTIONS,
  staffLanguageLabel,
} from "../src/lib/listing-culture.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("listing culture helpers", () => {
  it("parses jsonb arrays, JSON strings, and comma lists with empty defaults", () => {
    assert.deepEqual(parseStringList(null), []);
    assert.deepEqual(parseStringList(""), []);
    assert.deepEqual(parseStringList(["English", " french ", "english"]), ["English", "french"]);
    assert.deepEqual(parseStringList('["punjabi","Cree"]'), ["punjabi", "Cree"]);
    assert.deepEqual(parseStringList("mandarin,cantonese"), ["mandarin", "cantonese"]);
    assert.equal(normalizeCulturalTeamNote("  hello   world  ".padEnd(400, "x")).length, CULTURAL_TEAM_NOTE_MAX);
    assert.equal(normalizeCulturalTeamNote("   "), null);
    assert.deepEqual(normalizeStaffLanguages(["english", "Cree", "english"]), ["english", "Cree"]);
  });

  it("maps row columns and hides empty public cards", () => {
    const empty = listingCultureFrom({});
    assert.deepEqual(empty.staffLanguages, []);
    assert.deepEqual(empty.culturalPrograms, []);
    assert.equal(empty.culturalTeamNote, null);
    assert.equal(hasListingCulture(empty), false);
    const filled = listingCultureFrom({
      staff_languages: ["english", "Cree"],
      cultural_programs: ["bilingual"],
      cultural_team_note: "We greet families in English and Cree.",
    });
    assert.equal(hasListingCulture(filled), true);
    const sql = cultureFieldsToSql(filled);
    assert.equal(sql.staffLanguagesJson, JSON.stringify(["english", "Cree"]));
    assert.equal(sql.culturalProgramsJson, JSON.stringify(["bilingual"]));
    assert.equal(staffLanguageLabel("punjabi", "en"), "Punjabi");
  });

  it("offers language and program chips without racial categories", () => {
    const ids = STAFF_LANGUAGE_OPTIONS.map((o) => o.id).join(",");
    assert.match(ids, /english,french,punjabi,mandarin,cantonese,tagalog,arabic,spanish/);
    assert.match(ids, /hindi,urdu,korean,vietnamese,portuguese,ukrainian,polish,somali/);
    const programs = CULTURAL_PROGRAM_OPTIONS.map((o) => o.id);
    assert.deepEqual(programs, [
      "bilingual",
      "indigenous-programming",
      "multicultural",
      "faith-aware",
      "dietary",
    ]);
    const lib = src("src/lib/listing-culture.ts");
    assert.match(lib, /never staff race or ethnicity/i);
    assert.doesNotMatch(lib, /race checkbox|ethnicity checkbox|shop by race|caregiver race/i);
  });
});

describe("listing culture wiring", () => {
  it("adds schema columns and maps them end to end", () => {
    const migration = src("migrations/0042_listing_culture.sql");
    assert.match(migration, /staff_languages jsonb/);
    assert.match(migration, /cultural_programs jsonb/);
    assert.match(migration, /cultural_team_note text/);
    assert.match(migration, /Never staff race/);

    const types = src("src/lib/types.ts");
    assert.match(types, /staffLanguages\?: string\[\]/);
    assert.match(types, /culturalPrograms\?: string\[\]/);
    assert.match(types, /culturalTeamNote\?: string \| null/);

    const neon = src("src/lib/server/catalog-neon.ts");
    assert.match(neon, /staff_languages, cultural_programs, cultural_team_note/);
    assert.match(neon, /listingCultureFrom\(row\)/);

    const mapRow = src("src/lib/server/map-row.ts");
    assert.match(mapRow, /listingCultureFrom\(r\)/);

    const hydrate = src("src/lib/catalog-hydrate.ts");
    assert.match(hydrate, /listingCultureFrom\(raw\)/);

    const daycares = src("src/lib/server/daycares.ts");
    assert.match(daycares, /staffLanguages: d\.staffLanguages \?\? \[\]/);

    const upsert = src("src/lib/catalog-upsert.ts");
    assert.doesNotMatch(upsert, /staff_languages = excluded/);
  });

  it("lets daycares save the fields on desk edit and new listing", () => {
    const claims = src("src/lib/server/claims.ts");
    assert.match(claims, /staffLanguages\?: string\[\]/);
    assert.match(claims, /staff_languages = \$\{culture\.staffLanguagesJson\}::jsonb/);

    const family = src("src/lib/server/family.ts");
    assert.match(family, /staffLanguages\?: string\[\]/);
    assert.match(family, /staff_languages = \$\{culture\.staffLanguagesJson\}::jsonb/);

    const form = src("src/components/provider-listing-forms.tsx");
    assert.match(form, /ListingCultureFields/);
    assert.match(form, /staffLanguages: state\.staffLanguages/);

    const provider = src("src/routes/provider.tsx");
    assert.match(provider, /ListingCultureFields/);
    assert.match(provider, /staffLanguages: form\.staffLanguages/);
  });

  it("shows a public card only when data is present and never adds race filters", () => {
    const card = src("src/components/listing-culture-card.tsx");
    assert.match(card, /hasListingCulture/);
    assert.match(card, /languagesCulture/);
    assert.doesNotMatch(card, /race|ethnicity|immigration status/i);

    const listing = src("src/routes/daycare.\$slug.tsx");
    assert.match(listing, /ListingCultureCard/);

    const fields = src("src/components/listing-culture-fields.tsx");
    assert.match(fields, /languagesCulturePrivacy/);
    assert.match(fields, /staffLanguageOtherPh/);
    assert.doesNotMatch(fields, /staff race|ethnicity checkbox|shop by race/i);

    const search = src("src/routes/search.tsx");
    assert.doesNotMatch(search, /staffLanguages|culturalPrograms|filter by race|caregiver race/i);

    const copy = src("src/lib/copy.ts");
    assert.match(copy, /Share languages and programs only/);
    assert.match(copy, /Do not list staff members’ race, ethnicity, immigration status/);
    assert.doesNotMatch(copy, /shop by race|caregiver race|racial categor/i);
  });
});
