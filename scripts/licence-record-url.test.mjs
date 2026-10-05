import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { licenseRecordUrl } from "../src/lib/licensing.ts";
import { JURISDICTIONS } from "../src/lib/province-registry.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("Kids World no longer opens the retired Alberta lookup page", () => {
  const url = licenseRecordUrl("AB", "Kids World Daycare", "70051797");
  assert.equal(url, "https://childcare.alberta.ca/childcaresearch/?name=Kids+World+Daycare");
  assert.doesNotMatch(url, /lookup-child-care/);
  assert.doesNotMatch(url, /[?&]q=/);
  assert.doesNotMatch(url, /70051797/);
});

test("licence links stay on a real registry page and omit a generic q param", () => {
  const samples = {
    BC: "Bonnie Bairns Childcare Services",
    AB: "Kids World Daycare",
    SK: "USSU Child Care Centre",
    MB: "Little Teaching Lodge",
    ON: "Lakeshore Community Childcare Centre",
    QC: "Centre De La Petite Enfance",
    NB: "GBC Early Learning Centre",
    NS: "Down by the Bay Early Childhood Program",
    PE: "CHANCES Smart Start",
    NL: "A Home Away From Home Child Care Center",
    YT: "Nakwaye Ku Daycare",
    NT: "Solid Touch Dayhome",
    NU: "Aakuluk Daycare",
  };
  for (const row of JURISDICTIONS) {
    const url = licenseRecordUrl(row.code, samples[row.code], "FAKE-1");
    assert.ok(url, row.code);
    assert.match(url, /^https:\/\//, row.code);
    assert.doesNotMatch(url, /[?&]q=/, row.code);
    assert.doesNotMatch(url, /lookup-child-care|finding-child-care|\/page\/licensed-child-care/, row.code);
    const bare = licenseRecordUrl(row.code, "");
    if (row.code === "AB" || row.code === "NL") assert.notEqual(url, bare, row.code);
    else assert.equal(url, bare, row.code);
  }
  assert.equal(licenseRecordUrl("AB"), "https://childcare.alberta.ca/childcaresearch/");
  assert.equal(
    licenseRecordUrl("NL", "Campus Childcare"),
    "https://www.childcare.gov.nl.ca/public/ccr/childcare/?keyword=Campus+Childcare",
  );
  assert.equal(licenseRecordUrl("NT", "Solid Touch Dayhome", "nt-1"), "https://www.ece.gov.nt.ca/en/services/early-learning-and-child-care");
  assert.equal(licenseRecordUrl("ON", "Lakeshore", "1013", "fr")?.includes("lang=fr"), true);
  assert.match(licenseRecordUrl("QC", "CPE", null, "fr") || "", /quebec\.ca\/famille-et-soutien/);
  assert.equal(licenseRecordUrl("XX", "Nope"), null);
  assert.equal(licenseRecordUrl("", "Nope"), null);
});

test("listing cards drop the licence link; the listing page keeps it", () => {
  const card = src("src/components/daycare-card.tsx");
  assert.doesNotMatch(card, /viewLicenceRecord|card-licence|licenseRecordUrl/);
  const home = src("src/routes/index.tsx");
  assert.match(home, /RecentlyViewedRow/);
  assert.doesNotMatch(home, /title=\{t\("recentlyViewed"\)\}/);
  const row = src("src/components/recently-viewed-row.tsx");
  assert.match(row, /if \(!rows\.length\) return null/);
  assert.doesNotMatch(row, /dropdown|Disclosure|select/i);
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(listing, /data-ke="listing-licence"/);
  assert.match(listing, /licenceHref \?/);
});
