import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  DAYCARE_ALREADY_LISTED,
  findDuplicateListing,
  isDaycareAlreadyListedMessage,
  listingCreateErrorMessage,
  normalizeCentreName,
  sameDaycareListing,
  sameLicenseNumber,
} from "../src/lib/listing-identity.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const kidsWorld = {
  name: "Kids World",
  address: "123 Main Street",
  city: "Winnipeg",
  province: "MB",
  postalCode: "R3C 1A1",
  licenseNumber: "103205",
};

test("same centre matches on name+city+province with address or postal", () => {
  assert.equal(normalizeCentreName("Kids World Daycare"), "kids world");
  assert.equal(
    sameDaycareListing(kidsWorld, {
      ...kidsWorld,
      name: "Kids World Daycare",
      address: "123 Main St.",
      postalCode: "r3c1a1",
    }),
    true,
  );
  assert.equal(
    sameDaycareListing(
      { ...kidsWorld, address: "", postalCode: "", licenseNumber: "" },
      { ...kidsWorld, address: "9 Other Ave", postalCode: "R2C 2B2", licenseNumber: "" },
    ),
    false,
  );
  assert.equal(
    sameDaycareListing(
      { ...kidsWorld, address: "", postalCode: "", licenseNumber: "" },
      { ...kidsWorld, address: "9 Other Ave", postalCode: "R2C 2B2", licenseNumber: "" },
      { sameOwner: true },
    ),
    true,
  );
});

test("licence or address+postal match even when the name differs", () => {
  assert.equal(sameLicenseNumber("103-205", "103205"), true);
  assert.equal(sameLicenseNumber("n/a", "n/a"), false);
  assert.equal(
    sameDaycareListing(
      { ...kidsWorld, name: "Kids World QA" },
      { ...kidsWorld, name: "Something Else" },
    ),
    true,
  );
  assert.equal(
    sameDaycareListing(
      { name: "Renamed Centre", address: "123 Main St", city: "Winnipeg", postalCode: "R3C 1A1", licenseNumber: "" },
      { name: "Kids World", address: "123 Main Street", city: "Winnipeg", postalCode: "R3C1A1", licenseNumber: "" },
    ),
    true,
  );
});

test("distinct centres are not treated as duplicates", () => {
  const littleFox = {
    name: "Little Fox Child Care Centre",
    address: "50 Provencher Blvd",
    city: "Winnipeg",
    province: "MB",
    postalCode: "R2H 0G2",
    licenseNumber: "200001",
  };
  assert.equal(sameDaycareListing(kidsWorld, littleFox), false);
  assert.equal(
    sameDaycareListing(kidsWorld, { ...kidsWorld, city: "Brandon", address: "10 1st St", postalCode: "R7A 0A1", licenseNumber: "" }),
    false,
  );
  assert.equal(
    findDuplicateListing(littleFox, [{ ...kidsWorld, id: "d-kw", userId: "u-kyle" }], "u-kyle"),
    null,
  );
});

test("same-owner repeat create is rejected; other-account / catalogue use the same prompt", () => {
  const owned = findDuplicateListing(kidsWorld, [{ ...kidsWorld, id: "d-kw", userId: "u-kyle" }], "u-kyle");
  assert.equal(owned?.kind, "same_owner");
  assert.equal(owned?.message, DAYCARE_ALREADY_LISTED);
  assert.equal(owned?.message, "Daycare already Listed");

  const claimed = findDuplicateListing(
    kidsWorld,
    [{ ...kidsWorld, id: "d-kw", userId: "u-other" }],
    "u-kyle",
  );
  assert.equal(claimed?.kind, "other_account");
  assert.equal(claimed?.message, DAYCARE_ALREADY_LISTED);

  const catalog = findDuplicateListing(kidsWorld, [{ ...kidsWorld, id: "mb-103205", userId: null }], "u-kyle");
  assert.equal(catalog?.kind, "catalogue");
  assert.equal(catalog?.message, DAYCARE_ALREADY_LISTED);

  const sameOwnerHard = findDuplicateListing(
    { ...kidsWorld, address: "88 New Site", postalCode: "R3T 2N2", licenseNumber: "" },
    [{ ...kidsWorld, id: "d-kw", userId: "u-kyle", licenseNumber: "" }],
    "u-kyle",
  );
  assert.equal(sameOwnerHard?.kind, "same_owner");
});

test("createListing blocks duplicates before insert and still queues first-time Waiting", () => {
  const family = src("src/lib/server/family.ts");
  const start = family.indexOf("export const createListing");
  const end = family.indexOf("export const updateCapacity", start);
  const createListing = family.slice(start, end === -1 ? undefined : end);
  const guardAt = createListing.indexOf("assertNewListingAllowed");
  const insertAt = createListing.indexOf("insert into daycares");
  const enqueueAt = createListing.indexOf("enqueueProviderCreatedListing");
  assert.ok(guardAt !== -1, "createListing must call assertNewListingAllowed");
  assert.ok(insertAt !== -1, "createListing must still insert");
  assert.ok(enqueueAt !== -1, "first-time create must still enqueue Admin Waiting");
  assert.ok(guardAt < insertAt, "duplicate check runs before insert");
  assert.ok(insertAt < enqueueAt, "Waiting enqueue stays after a successful insert");
  assert.match(createListing, /licenseNumber: data\.licenseNumber/);
  assert.match(createListing, /postalCode: data\.postalCode/);

  const guard = src("src/lib/server/listing-guard.ts");
  assert.match(guard, /DAYCARE_ALREADY_LISTED/);
  assert.match(guard, /findDuplicateListing/);
  assert.match(guard, /getCatalog/);
  assert.doesNotMatch(guard, /You already manage this location/);
});

test("provider desk shows Daycare already Listed from locale copy", () => {
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /daycareAlreadyListed: "Daycare already Listed"/);
  assert.match(copy, /daycareAlreadyListed: "Garderie déjà inscrite"/);
  assert.equal(isDaycareAlreadyListedMessage("Daycare already Listed"), true);
  assert.equal(listingCreateErrorMessage(new Error(DAYCARE_ALREADY_LISTED)), DAYCARE_ALREADY_LISTED);

  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /isDaycareAlreadyListedMessage/);
  assert.match(provider, /t\("daycareAlreadyListed"\)/);
  assert.match(provider, /createListing\(\{ data: form \}\)/);
});
