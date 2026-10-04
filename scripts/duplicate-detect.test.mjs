import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { planSafeDuplicateGroups } from "../src/lib/duplicate-detect.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function row(id, extra = {}) {
  return {
    id,
    slug: id,
    name: "Harbour Kids",
    postalCode: "R3C 0A1",
    phone: "",
    licenseNumber: "",
    claimed: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    ...extra,
  };
}

test("unclaimed duplicates plan a redirect and claimed rows stay", () => {
  const result = planSafeDuplicateGroups([
    row("keep", { licenseNumber: "MB-100200", createdAt: "2020-01-01T00:00:00.000Z" }),
    row("copy", { licenseNumber: "MB100200", createdAt: "2024-05-01T00:00:00.000Z" }),
    row("claimed-a", { phone: "204-555-0100", claimed: true, name: "North Care" }),
    row("claimed-b", { phone: "2045550100", claimed: true, name: "North Care" }),
    row("d_d85jtifbkh2t", { slug: "kids-world-daycare-kh2t", licenseNumber: "MB-100200", name: "Kids World" }),
    row("plain", { name: "Other Place", postalCode: "T5J 0N3", licenseNumber: "AB-9" }),
  ]);
  assert.equal(result.plans.length, 1);
  assert.equal(result.plans[0].keeperId, "keep");
  assert.deepEqual(result.plans[0].retiredIds, ["copy"]);
  assert.equal(result.plans[0].redirectTo, "keep");
  assert.ok(result.skipped.some((row) => row.skip === "both_claimed"));
  const ids = result.plans.flatMap((plan) => [plan.keeperId, ...plan.retiredIds]);
  assert.equal(ids.includes("d_d85jtifbkh2t"), false);
  assert.equal(ids.includes("claimed-a"), false);
  assert.equal(ids.includes("claimed-b"), false);
});

test("name plus postal groups unclaimed copies and the detect script cannot apply", () => {
  const result = planSafeDuplicateGroups([
    row("a", { name: "École du Quartier", postalCode: "H2X 1Y4", createdAt: "2021-01-01" }),
    row("b", { name: "Ecole du Quartier", postalCode: "H2X1Y4", createdAt: "2023-01-01" }),
    row("owned", { name: "École du Quartier", postalCode: "H2X 1Y4", ownerCount: 1 }),
  ]);
  assert.equal(result.plans.length, 1);
  assert.equal(result.plans[0].reason, "name_postal");
  assert.equal(result.plans[0].keeperId, "owned");
  assert.deepEqual(result.plans[0].retiredIds, ["a", "b"]);

  const script = readFileSync(join(root, "scripts/detect-duplicate-listings.mjs"), "utf8");
  assert.match(script, /Refusing --apply/);
  assert.match(script, /DATABASE_URL/);
  assert.match(script, /process\.exit\(2\)/);
  assert.doesNotMatch(script, /getSql|neon|applyMerge/);
  const route = readFileSync(join(root, "src/routes/daycare.$slug.tsx"), "utf8");
  assert.match(route, /statusCode: 301/);
  const merge = readFileSync(join(root, "src/lib/listing-merge.ts"), "utf8");
  assert.match(merge, /kids-world-daycare-kh2t/);
});
