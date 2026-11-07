import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { centrePublication, filterOwnedCentres } from "../src/lib/host-listings-overview.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const owned = [
  { id: "a", name: "KidEase Test Daycare (QA)", city: "Winnipeg", address: "1 Main" },
  { id: "b", name: "Maple Room", nameFr: "Salle érable", city: "Saint-Boniface", address: "2 Rue" },
];

test("search stays inside the centres the owner already has", () => {
  assert.equal(filterOwnedCentres(owned, "").length, 2);
  assert.deepEqual(filterOwnedCentres(owned, "  maple ").map((row) => row.id), ["b"]);
  assert.deepEqual(filterOwnedCentres(owned, "érable").map((row) => row.id), ["b"]);
  assert.deepEqual(filterOwnedCentres(owned, "winnipeg").map((row) => row.id), ["a"]);
  assert.equal(filterOwnedCentres(owned, "toronto").length, 0);
});

test("publication status follows the live flag only", () => {
  assert.equal(centrePublication(true), "listed");
  assert.equal(centrePublication(false), "unpublished");
  assert.equal(centrePublication(null), "unpublished");
});

test("the editor does not swap a QA listing for synthetic demo photos", () => {
  const desk = src("src/components/host-listing-desk.tsx");
  const forms = src("src/components/provider-listing-forms.tsx");
  assert.doesNotMatch(desk + forms, /usesDemoPhotoPreview|DEMO_DAYCARE_PHOTOS|demo-photo-preview/);
});

test("add chooser reuses claim and the existing create form, and does not invent copy-listing", () => {
  const desk = src("src/components/host-listing-desk.tsx");
  const provider = src("src/routes/provider.tsx");
  assert.match(desk, /to="\/claim"/);
  assert.match(desk, /providerOnboardingListNew/);
  assert.match(desk, /data-ke="host-add-centre"/);
  assert.match(desk, /data-ke="host-listings-search"/);
  assert.match(provider, /data-ke="list-missing-centre"/);
  assert.match(provider, /onCreateListing/);
  assert.doesNotMatch(desk, /copyListing|duplicateListing|Copy listing/i);
  assert.doesNotMatch(provider, /providerListNewHide/);
  assert.match(src("src/components/provider-listing-forms.tsx"), /ListingSpacesEditor/);
});
