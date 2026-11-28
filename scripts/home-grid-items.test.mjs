import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

await register(new URL("./alias-loader.mjs", import.meta.url), import.meta.url);
const { homeGridItems, isLiveLookingCard } = await import("../src/lib/now-loops.ts");

function listing(id, over = {}) {
  return {
    id,
    agesKnown: true,
    ageMinMonths: 12,
    ageMaxMonths: 60,
    infantMonthly: 1200,
    toddlerMonthly: 1100,
    preschoolMonthly: 1000,
    partTimeMonthly: null,
    amenities: "",
    photos: ["/photos/buildings/mb-demo.jpg"],
    province: "MB",
    ...over,
  };
}

test("N-39 home grid leads with live-looking cards and keeps the rest, without duplicates", () => {
  const hollow = listing("hollow", { photos: [], infantMonthly: null, toddlerMonthly: null, preschoolMonthly: null });
  const noAges = listing("no-ages", { agesKnown: false, ageMinMonths: 0, ageMaxMonths: 0 });
  const full = listing("full");
  const full2 = listing("full-2");
  assert.equal(isLiveLookingCard(full), true);
  assert.equal(isLiveLookingCard(hollow), false);
  const rows = [hollow, full, noAges, full2, full];
  assert.deepEqual(homeGridItems(rows).map((r) => r.id), ["full", "full-2", "hollow", "no-ages"]);
  assert.deepEqual(homeGridItems(rows, { limit: 2 }).map((r) => r.id), ["full", "full-2"]);
  assert.deepEqual(homeGridItems([hollow, noAges]).map((r) => r.id), ["hollow", "no-ages"]);
  assert.deepEqual(homeGridItems([]), []);
  const many = Array.from({ length: 20 }, (_, i) => listing(`c${i}`));
  assert.equal(homeGridItems(many).length, 12);
});
