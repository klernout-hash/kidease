import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { daycareNameSimilarity, foldDaycareName, matchesDaycareName } from "../src/lib/explore-search.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("French and English names ignore accents, saint forms, and a small typo", () => {
  assert.equal(foldDaycareName("Ste-Catherine"), "sainte catherine");
  assert.equal(foldDaycareName("St. Boniface"), "saint boniface");
  assert.equal(foldDaycareName("Saint-Boniface"), "saint boniface");
  assert.equal(
    matchesDaycareName({ name: "Garderie Sainte-Catherine", nameFr: "" }, "ste catherine"),
    true,
  );
  assert.equal(matchesDaycareName({ name: "Centre Saint-Boniface", nameFr: "" }, "st boniface"), true);
  assert.equal(matchesDaycareName({ name: "Montréal Ouest", nameFr: "" }, "montreal"), true);
  assert.equal(matchesDaycareName({ name: "Bright Beginnings", nameFr: "Débuts brillants" }, "bright"), true);
  assert.equal(matchesDaycareName({ name: "Bright Beginnings", nameFr: "" }, "débuts"), false);
  assert.equal(matchesDaycareName({ name: "Acorn", nameFr: "Débuts brillants" }, "débuts"), true);
  assert.equal(matchesDaycareName({ name: "Acorn", nameFr: null }, "  "), true);
  assert.equal(matchesDaycareName({ name: "River Valley Early Learning", nameFr: "" }, "River"), true);
  assert.equal(matchesDaycareName({ name: "Kids World Daycare", nameFr: "" }, "No Such Centre"), false);
  assert.equal(matchesDaycareName({ name: "Montreal West Child Care", nameFr: "" }, "monreal"), true);
  assert.ok(daycareNameSimilarity("monreal", "montreal") >= 0.45);
  assert.ok(daycareNameSimilarity("No Such Centre", "Kids World Daycare") < 0.45);
});

test("SQL name search uses trigram when Postgres has it and ilike when it does not", () => {
  const sql = readFileSync(join(root, "src/lib/server/daycare-name-search.ts"), "utf8");
  assert.match(sql, /similarity\(lower\(name\)/);
  assert.match(sql, /\.catch\(/);
  assert.match(sql, /name ilike/);
  const migration = readFileSync(join(root, "migrations/0081_name_trgm.sql"), "utf8");
  assert.match(migration, /pg_trgm/);
  assert.match(migration, /unaccent/);
  assert.match(migration, /exception when others then/);
});
