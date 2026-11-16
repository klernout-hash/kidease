import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  centreMatchesSavedView,
  deleteNamedFilter,
  readSavedFilters,
  saveNamedFilter,
  savedFilterId,
} from "../src/lib/admin-saved-filters.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";

test("an admin can save, name, and delete a filter", () => {
  const unclaimed = {
    id: savedFilterId("Unclaimed in ON"),
    name: "Unclaimed in ON",
    tab: "queue",
    stat: "waiting",
    province: "ON",
    docs: false,
  };
  const docs = {
    id: savedFilterId("Docs waiting"),
    name: "Docs waiting",
    tab: "verify",
    stat: "license",
    docs: true,
  };
  const saved = saveNamedFilter([unclaimed], docs);
  assert.equal(saved[0]?.name, "Docs waiting");
  assert.equal(saved.some((row) => row.name === "Unclaimed in ON"), true);
  assert.equal(deleteNamedFilter(saved, docs.id).some((row) => row.id === docs.id), false);
  const roundTrip = readSavedFilters(JSON.stringify(saved));
  assert.equal(roundTrip[1]?.province, "ON");
});

test("a province filter and docs waiting both narrow the list", () => {
  assert.equal(centreMatchesSavedView({ province: "ON" }, { province: "ON" }, false), true);
  assert.equal(centreMatchesSavedView({ province: "BC" }, { province: "ON" }, false), false);
  assert.equal(centreMatchesSavedView({ province: "ON" }, { docs: true }, false), false);
  assert.equal(centreMatchesSavedView({ province: "ON" }, { province: "ON", docs: true }, true), true);
  assert.equal(FLAG_DEFAULTS.FEATURE_ADMIN_SAVED_FILTERS, true);
  const page = readFileSync(new URL("../src/components/admin-desk-page.tsx", import.meta.url), "utf8");
  assert.match(page, /AdminSavedFilters/);
});
