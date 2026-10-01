import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { geocode, isIqaluitQuery } from "../src/lib/geo.ts";
import { explicitCityQuery } from "../src/lib/search-query.ts";
import { renderSitemapXml } from "../src/lib/sitemap.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("Laval is Laval, not Winnipeg", () => {
  const hit = geocode("Laval");
  assert.ok(hit);
  assert.match(hit.label, /Laval/);
  assert.doesNotMatch(hit.label, /Winnipeg/);
  assert.equal(geocode("H7A 1A1")?.label, hit.label);
});

test("Québec and Quebec mean Québec City, not Montréal", () => {
  for (const query of ["Québec", "Quebec", "Quebec City", "Ville de Québec"]) {
    const hit = geocode(query);
    assert.ok(hit, query);
    assert.match(hit.label, /Québec City/, query);
    assert.doesNotMatch(hit.label, /Montréal|Montreal/, query);
  }
  const province = geocode("QC");
  assert.ok(province);
  assert.match(province.label, /Montréal/);
});

test("Winnipeg Beach is not Winnipeg", () => {
  const beach = geocode("Winnipeg Beach");
  assert.notEqual(beach?.label, "Winnipeg, MB");
  assert.equal(geocode("Winnipeg")?.label, "Winnipeg, MB");
  assert.equal(geocode("Winnipeg, MB")?.label, "Winnipeg, MB");
  assert.equal(geocode("winnip")?.label, "Winnipeg, MB");
  assert.equal(geocode("Winnipeg MB")?.label, "Winnipeg, MB");
  assert.equal(explicitCityQuery("Winnipeg Beach"), null);
  assert.equal(explicitCityQuery("Winnipeg, MB")?.label, "Winnipeg, MB");
});

test("Iqaluit stays Iqaluit and the empty state says so", () => {
  const hit = geocode("Iqaluit");
  assert.ok(hit);
  assert.match(hit.label, /Iqaluit/);
  assert.equal(isIqaluitQuery("Iqaluit, NU"), true);
  assert.equal(isIqaluitQuery("Winnipeg"), false);
  const search = readFileSync(join(root, "src/routes/search.tsx"), "utf8");
  assert.match(search, /searchIqaluitEmpty/);
  assert.match(search, /searchPlacePending/);
  assert.match(search, /locationKnown/);
});

test("listing sitemap points French pages at the same centre", () => {
  const xml = renderSitemapXml({ paths: ["/daycare/city/winnipeg"], listingSlugs: ["sunny-side"] });
  assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  assert.match(xml, /<loc>https:\/\/www\.kidease\.ca\/daycare\/sunny-side<\/loc>/);
  assert.match(xml, /hreflang="fr" href="https:\/\/www\.kidease\.ca\/fr\/daycare\/sunny-side"/);
  assert.match(xml, /hreflang="fr" href="https:\/\/www\.kidease\.ca\/fr\/daycare\/city\/winnipeg"/);
  assert.match(xml, /hreflang="en" href="https:\/\/www\.kidease\.ca\/daycare\/sunny-side"/);
});

test("llms.txt names KidEase and the main pages", () => {
  const text = readFileSync(join(root, "public/llms.txt"), "utf8");
  assert.match(text, /KidEase/);
  assert.match(text, /https:\/\/www\.kidease\.ca\/search/);
  assert.match(text, /https:\/\/www\.kidease\.ca\/fr\/search/);
  assert.match(text, /https:\/\/www\.kidease\.ca\/faq/);
  const sitemap = readFileSync(join(root, "public/sitemap.xml"), "utf8");
  assert.match(sitemap, /https:\/\/www\.kidease\.ca\/fr\/daycare\/city\/winnipeg/);
  assert.match(sitemap, /https:\/\/www\.kidease\.ca\/fr\/daycare\/city\/laval|https:\/\/www\.kidease\.ca\/fr\/daycare\/city\/toronto/);
  assert.doesNotMatch(text, /free forever/i);
  assert.doesNotMatch(text, /based in Winnipeg/i);
});
