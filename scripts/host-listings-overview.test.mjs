import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  DEMO_DAYCARE_PHOTOS,
  centrePublication,
  demoPhotoAlt,
  filterOwnedCentres,
  isQaStandInPhoto,
  usesDemoPhotoPreview,
} from "../src/lib/host-listings-overview.ts";

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

test("QA stand-in tiles use the local 10-photo demo set and real sets do not", () => {
  assert.equal(DEMO_DAYCARE_PHOTOS.length, 10);
  assert.equal(isQaStandInPhoto("/photos/qa-test-image.jpg"), true);
  assert.equal(isQaStandInPhoto("https://media.kidease.ca/photos/QA%20TEST%20IMAGE.png"), true);
  assert.equal(isQaStandInPhoto("/photos/buildings/mb-101384.jpg"), false);
  assert.equal(usesDemoPhotoPreview({ name: "KidEase Test Daycare (QA)", photos: "/uploads/navy.jpg" }), true);
  assert.equal(
    usesDemoPhotoPreview({
      name: "KidEase Test Daycare (QA)",
      photos: "https://media.kidease.ca/a.jpg,https://media.kidease.ca/b.jpg",
    }),
    false,
  );
  assert.equal(usesDemoPhotoPreview({ name: "Maple Room", photos: "/photos/buildings/mb-1.jpg" }), false);
  assert.equal(usesDemoPhotoPreview({ name: "Maple Room", photos: "/photos/qa-test-image.jpg" }), true);
  assert.match(demoPhotoAlt("Demo photo {n} of {total}. Not a photo of this centre.", 2, 10), /2/);
  assert.match(demoPhotoAlt("Demo photo {n} of {total}. Not a photo of this centre.", 2, 10), /not a photo of this centre/i);
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
  const forms = src("src/components/provider-listing-forms.tsx");
  assert.match(forms, /data-ke="demo-photo-preview"/);
  assert.doesNotMatch(forms, /setGallery\(\s*DEMO_DAYCARE_PHOTOS/);
});
