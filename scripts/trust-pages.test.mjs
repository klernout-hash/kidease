import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  COMPANY_ADDRESS_EN,
  COMPANY_ADDRESS_FR,
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_OFFICER_NAME,
  companyAddress,
  companyOperatorLine,
  privacyOfficerLine,
} from "../src/lib/company.ts";
import { LICENSING_OFFICES } from "../src/lib/licensing-offices.ts";
import { hreflangLinks, localePath, SITEMAP_FR_PATHS } from "../src/lib/locale-path.ts";
import { pageSeoHead, MARKETING_PAGE_SEO, MARKETING_PAGE_SEO_FR } from "../src/lib/page-seo.ts";
import { SITEMAP_STATIC_PATHS } from "../src/lib/sitemap.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("company facts stay in one config and hide an empty address", () => {
  assert.equal(PRIVACY_OFFICER_NAME, "Kyle Lernout");
  assert.equal(PRIVACY_CONTACT_EMAIL, "privacy@kidease.ca");
  assert.match(companyOperatorLine("en"), /10037493 Manitoba Ltd\./);
  assert.match(companyOperatorLine("en"), /725275721/);
  assert.match(companyOperatorLine("en"), /Canadian corporation/);
  assert.match(companyOperatorLine("fr"), /société canadienne/);
  assert.match(companyOperatorLine("fr"), /Numéro d’entreprise de l’ARC : 725275721/);
  assert.equal(companyAddress("en"), COMPANY_ADDRESS_EN);
  assert.equal(companyAddress("fr"), COMPANY_ADDRESS_FR);
  assert.match(privacyOfficerLine("en"), /Kyle Lernout, Privacy Officer, privacy@kidease\.ca/);
  assert.match(privacyOfficerLine("fr"), /Responsable de la protection des renseignements personnels/);
  assert.doesNotMatch(companyOperatorLine("en") + privacyOfficerLine("en"), /\[Address\]|\[name|Winnipeg-based|free forever|—/);
});

test("report pages are paired, canonical, and in the sitemap", () => {
  assert.equal(localePath("/report", "fr"), "/fr/report");
  assert.equal(localePath("/report", "en"), "/report");
  assert.ok(SITEMAP_STATIC_PATHS.includes("/report"));
  assert.ok(SITEMAP_FR_PATHS.includes("/fr/report"));
  const en = pageSeoHead(MARKETING_PAGE_SEO.report);
  const fr = pageSeoHead(MARKETING_PAGE_SEO_FR.report);
  assert.equal(en.links.find((link) => link.rel === "canonical")?.href, "https://www.kidease.ca/report");
  assert.equal(fr.links.find((link) => link.rel === "canonical")?.href, "https://www.kidease.ca/fr/report");
  assert.deepEqual(
    hreflangLinks("/report").map((link) => link.hrefLang),
    ["en", "fr", "x-default"],
  );
  const sitemap = readFileSync(join(root, "public/sitemap.xml"), "utf8");
  assert.match(sitemap, /<loc>https:\/\/www\.kidease\.ca\/report<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/www\.kidease\.ca\/fr\/report<\/loc>/);
});

test("licensing offices cover all 13 jurisdictions with a phone and https link", () => {
  assert.equal(LICENSING_OFFICES.length, 13);
  const codes = LICENSING_OFFICES.map((office) => office.code);
  assert.deepEqual(codes, ["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"]);
  for (const office of LICENSING_OFFICES) {
    assert.match(office.href, /^https:\/\//, office.code);
    assert.ok(office.phones.length > 0, office.code);
    for (const phone of office.phones) {
      assert.match(phone.tel, /^\+\d{10,15}$/, `${office.code} ${phone.display}`);
      assert.ok(phone.display.length > 6, phone.display);
      assert.equal(phone.labelEn.includes("—") || phone.labelFr.includes("—"), false);
    }
    const blob = `${office.noteEn || ""} ${office.noteFr || ""}`;
    assert.equal(blob.includes("—"), false, office.code);
  }
});
