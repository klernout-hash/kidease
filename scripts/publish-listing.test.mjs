import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { listingPublishMissing, mergeListingDraft } from "../src/lib/listing-publish.ts";
import { tx } from "../src/lib/copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const empty = {
  name: "",
  address: "",
  city: "Winnipeg",
  postalCode: "",
  licenseNumber: "",
  infantMonthly: 1200,
  toddlerMonthly: 1100,
  preschoolMonthly: 1000,
  storefront: "",
  staffLanguages: [],
  culturalPrograms: [],
  culturalTeamNote: "",
};

test("publish reads filled fields from the form when React state is still empty", () => {
  const dom = new FormData();
  dom.set("name", "River Centre");
  dom.set("address", "1 Main St");
  dom.set("city", "Winnipeg");
  dom.set("postalCode", "R3C 0A1");
  dom.set("licenseNumber", "000000");
  dom.set("infantMonthly", "1200");
  const next = mergeListingDraft(empty, dom);
  assert.equal(next.name, "River Centre");
  assert.equal(next.address, "1 Main St");
  assert.equal(next.postalCode, "R3C 0A1");
  assert.equal(next.licenseNumber, "000000");
  assert.equal(next.infantMonthly, 1200);
  assert.equal(next.toddlerMonthly, 1100);
  assert.deepEqual(listingPublishMissing(next), []);
  assert.deepEqual(listingPublishMissing(empty), ["name", "address", "postalCode", "licenseNumber"]);
});

test("publish keeps a typed React value when the matching form field is blank", () => {
  const next = mergeListingDraft({ ...empty, name: "Typed Centre", licenseNumber: "000000" }, new FormData());
  assert.equal(next.name, "Typed Centre");
  assert.equal(next.licenseNumber, "000000");
  assert.deepEqual(listingPublishMissing(next), ["address", "postalCode"]);
});

test("Publish listing stays clickable and reports inline status", () => {
  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /data-ke="publish-listing-form"/);
  assert.match(provider, /data-ke="publish-listing"/);
  assert.match(provider, /data-ke="publish-listing-status"/);
  assert.match(provider, /mergeListingDraft\(form, new FormData\(e\.currentTarget\)\)/);
  assert.match(provider, /listingPublishMissing\(next\)/);
  assert.match(provider, /createListing\(\{ data: next \}\)/);
  assert.match(provider, /t\("publishListingMissing"\)/);
  assert.match(provider, /t\("publishListingDone"\)/);
  assert.match(provider, /disabled=\{publishing\}/);
  assert.doesNotMatch(provider, /listingFormDirty/);
  assert.doesNotMatch(provider, /disabled=\{!listingFormDirty\}/);
  assert.doesNotMatch(provider, /listings\.length === 0\) \{\s*setShowNewForm\(false\)/);
  assert.match(provider, /id === "add"[\s\S]*setShowNewForm\(true\)/);
  assert.match(provider, /name="name"/);
  assert.match(provider, /name="licenseNumber"/);
  assert.match(provider, /name="postalCode"/);
  assert.equal(
    tx("en", "publishListingMissing"),
    "Add the centre name, licence number, address, city, and postal code, then publish again.",
  );
  assert.match(tx("fr", "publishListingDone"), /Fiche publiée/);
  assert.doesNotMatch(tx("fr", "publishListingMissing"), /Add the centre/);
});
