import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parseCsvRecords, parseMasterContacts } from "../src/lib/catalog-master.ts";
import { dropStoredDuplicateAdditions, masterListingId, syncMasterCatalogue } from "../src/lib/catalog-master-sync.ts";
import { DAYCARE_UPSERT_SQL } from "../src/lib/catalog-upsert.ts";
import { assertMasterLock, parseSeedArgs } from "./seed-catalog-to-neon.mjs";
import { isSafeSitemapSlug, mergeListingSitemapSlugs, publicSitemapSlugs } from "../src/lib/sitemap.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const CSV = `facility_id,name,licence_number,facility_type,street_address,city,province,postal_code,phone,email,website,fees,ages_served
BC|Bonnie|V7P2W8,Bonnie Bairns,1,Centre,2260 Philip Ave,North Vancouver,BC,V7P 2W8,,new@example.com,https://new.example,40,infant
ON|NewPlace|M5V2T6,New Place Daycare,99,Family Home,1 King St,Toronto,ON,M5V 2T6,416-555-0199,place@example.com,https://place.example,55,3-5
NY|UsKids|1,US Kids,1,Centre,1 Broadway,New York,NY,10001,212-555-0100,us@example.com,https://us.example,,
NB|NoGeo|2,No Geo Home,2,Family Home,1 Lane,Scoudouc,NB,,,,,
"QC|Quoted|G5J3H7","Centre ""Les P'Tits""",3,CPE,"7, rue Saint-Augustin",Amqui,QC,G5J 3H7,"418-629-5363
(cell)",qc@example.com,,,
ON|Ghost|8,TEST Ghost Claim Lab,8,Centre,100 KidEase Test Lane,Toronto,ON,M5V 2T6,416-555-0101,ghost@example.com,,
`;

function catalogue() {
  return [
    {
      id: "bc-1",
      slug: "bonnie-bairns",
      name: "Bonnie Bairns",
      city: "North Vancouver",
      province: "BC",
      postalCode: "V7P 2W8",
      licenseNumber: "1",
      lat: 49.33,
      lng: -123.11,
      phone: "604-983-2600",
      contactEmail: "keep@example.com",
      website: "",
    },
    {
      id: "on-9",
      slug: "only-in-catalogue",
      name: "Only In Catalogue",
      city: "Toronto",
      province: "ON",
      postalCode: "M5V 2T6",
      licenseNumber: "9",
      lat: 43.64,
      lng: -79.38,
      phone: "",
      contactEmail: "",
      website: "https://keep.example",
    },
  ];
}

describe("master catalogue sync", () => {
  it("parses quoted newlines without dropping the Canada lock", () => {
    const records = parseCsvRecords(CSV);
    assert.equal(records.length, 7);
    assert.equal(records[5][0], "QC|Quoted|G5J3H7");
    assert.match(records[5][8], /418-629-5363/);
    const contacts = parseMasterContacts(CSV);
    assert.equal(contacts.get("3")?.phone.includes("418-629-5363"), true);
  });

  it("appends Canada rows, keeps filled contacts, and does not invent Live data", () => {
    const before = catalogue();
    const plan = syncMasterCatalogue(before, CSV);
    assert.equal(plan.summary.masterRows, 6);
    assert.equal(plan.summary.matched, 1);
    assert.equal(plan.summary.added, 1);
    assert.equal(plan.summary.skippedNonCanada, 1);
    assert.equal(plan.summary.skippedNoGeo, 2);
    assert.equal(plan.summary.skippedInvalid, 1);
    assert.equal(
      plan.summary.matched +
        plan.summary.added +
        plan.summary.skippedNoGeo +
        plan.summary.skippedNonCanada +
        plan.summary.skippedInvalid,
      plan.summary.masterRows,
    );
    assert.ok(plan.summary.catalogueRows >= plan.summary.masterRows - plan.summary.skippedNoGeo - plan.summary.skippedNonCanada);
    assert.equal(plan.rows.length, before.length + 1);
    assert.equal(plan.rows[0].id, "bc-1");
    assert.equal(plan.rows[0].phone, "604-983-2600");
    assert.equal(plan.rows[0].contactEmail, "keep@example.com");
    assert.equal(plan.rows[0].website, "https://new.example");
    assert.equal(plan.rows[1].id, "on-9");
    assert.equal(plan.rows[1].website, "https://keep.example");
    const added = plan.rows[2];
    assert.equal(added.id, masterListingId("ON|NewPlace|M5V2T6"));
    assert.equal(added.name, "New Place Daycare");
    assert.equal(added.province, "ON");
    assert.equal(added.phone, "416-555-0199");
    assert.equal(added.ageMinMonths, 0);
    assert.equal(added.ageMaxMonths, 0);
    assert.equal(added.infantMonthly, null);
    assert.equal(added.toddlerMonthly, null);
    assert.equal(added.preschoolMonthly, null);
    assert.equal(added.spotsInfant, 0);
    assert.deepEqual(added.photos, []);
    assert.equal(added.visibility, "public");
    assert.equal(added.isTest, false);
    assert.ok(added.lat > 41 && added.lng < -52);
    assert.equal(plan.rows.some((row) => row.province === "NY"), false);
    assert.equal(plan.rows.some((row) => /test/i.test(row.name) && row.id !== "on-9"), false);
    assert.doesNotMatch(DAYCARE_UPSERT_SQL, /claim_status/);
    assert.match(DAYCARE_UPSERT_SQL, /claimed_at is null/);
    assert.equal(plan.summary.catalogueRows, plan.rows.length);
    assert.ok(plan.summary.catalogueRows > before.length);
  });

  it("refuses a catalogue that would land under the master lock", () => {
    assert.throws(
      () =>
        assertMasterLock(
          {
            masterRows: 10,
            matched: 10,
            added: 0,
            skippedNoGeo: 0,
            skippedNonCanada: 0,
            skippedInvalid: 0,
            catalogueRows: 4,
            publicSlugs: 4,
            contactsFilled: 0,
          },
          10,
        ),
      /below master lock/,
    );
  });

  it("does not insert a second row for a centre already stored under another id", () => {
    const seed = catalogue();
    seed.push({
      id: "mx-new",
      slug: "kids-world-daycare-edmonton",
      name: "Kids World Daycare",
      city: "Edmonton",
      province: "AB",
      postalCode: "T5J 0N3",
      licenseNumber: "70051797",
      lat: 53.54,
      lng: -113.49,
      phone: "",
      contactEmail: "",
      website: "",
    });
    const stored = [
      {
        id: "d_d85jtifbkh2t",
        slug: "kids-world-daycare-kh2t",
        name: "Kids World Daycare",
        city: "Edmonton",
        province: "AB",
        postalCode: "T5J 0N3",
        licenseNumber: "70051797",
      },
      catalogue()[0],
    ];
    const out = dropStoredDuplicateAdditions(seed, stored);
    assert.equal(out.dropped, 1);
    assert.deepEqual(
      out.rows.map((row) => row.id),
      ["bc-1", "on-9"],
    );
  });

  it("parse flags include the master lock", () => {
    const opts = parseSeedArgs(["--dry-run", "--expect-master=23927", "--master-csv=/secure/master.csv"]);
    assert.equal(opts.dryRun, true);
    assert.equal(opts.expectMaster, 23927);
    assert.equal(opts.masterCsvPath, "/secure/master.csv");
  });
});

describe("listing sitemap slug union", () => {
  it("keeps real hyphenated slugs and never shrinks the bundled public set", () => {
    assert.equal(isSafeSitemapSlug("la-bulle-de-lait-"), true);
    assert.equal(isSafeSitemapSlug("wind-and-tide-child-development-centre-sw-maple--358"), true);
    assert.equal(isSafeSitemapSlug("not a slug"), false);
    assert.equal(isSafeSitemapSlug("test-ghost-claim-lab"), false);
    const centres = JSON.parse(readFileSync(join(root, "src/lib/data/centres.json"), "utf8"));
    const slugs = publicSitemapSlugs(centres, 100_000);
    assert.equal(slugs.length, 20845);
    assert.equal(slugs.includes("la-bulle-de-lait-"), true);
    assert.equal(slugs.includes("peninsula-montessori-academy-oak-3572"), false);
    assert.equal(slugs.includes("test-ghost-claim-lab"), false);
    const merged = mergeListingSitemapSlugs(
      ["sunny-side-child-care", "la-bulle-de-lait-"],
      ["new-master-centre", "test-ghost-claim-lab", ""],
    );
    assert.deepEqual(merged, ["sunny-side-child-care", "la-bulle-de-lait-", "new-master-centre"]);
    const partial = mergeListingSitemapSlugs(["sunny-side-child-care", "second-centre"], ["test-ghost"]);
    assert.deepEqual(partial, ["sunny-side-child-care", "second-centre"]);
  });
});
