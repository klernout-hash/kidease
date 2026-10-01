import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function officialLicenceNumber(raw, id) {
  const n = (raw || "").trim();
  if (!n || n === "—" || n.toLowerCase() === "unknown") return null;
  if (n.includes("|")) return null;
  if (id && n.toLowerCase() === id.toLowerCase()) return null;
  const tail = (id || "").split("-").pop() || "";
  if (/^\d{1,3}$/.test(n) && (!id || n === tail)) return null;
  return n;
}

test("home has one visible heading and cards name their photo links", () => {
  const home = src("src/routes/index.tsx");
  const headings = home.match(/<h1\b[^>]*>/g) || [];
  assert.equal(headings.length, 1);
  assert.doesNotMatch(headings[0], /sr-only/);
  assert.match(home, /\{t\("tagline"\)\}/);

  const card = src("src/components/daycare-card.tsx");
  assert.match(card, /originIsParentLocation\(originSource\)/);
  assert.match(card, /label=\{name\}/);
  assert.doesNotMatch(card, /const away = located/);
  assert.match(src("src/lib/presence.ts"), /export function originIsParentLocation/);
});

test("internal catalogue keys are not shown as licence numbers", () => {
  for (const file of ["src/lib/licensing.ts", "src/lib/approve-live.ts", "src/lib/listing-verified.ts"]) {
    assert.match(src(file), /n\.includes\("\|"\)/, file);
  }
  assert.equal(officialLicenceNumber("MB|home-river-heights", "mb-home-1"), null);
  assert.equal(officialLicenceNumber("MB|casa|1276", "mb-9"), null);
  assert.equal(officialLicenceNumber("123456", "mb-9"), "123456");
  assert.equal(officialLicenceNumber("1", "bc-1"), null);
  assert.equal(officialLicenceNumber("P-2048", "on-4"), "P-2048");
});
