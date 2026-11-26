import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { spotsByAgeCopy, spotsFromAgeCounts } from "../src/lib/open-spots-by-age.ts";

test("exact counts by age keep only the listing's age groups", () => {
  const out = spotsFromAgeCounts(["toddler", "preschool"], {
    infant: 4,
    toddler: "2",
    preschool: 5,
  });
  assert.deepEqual(out, {
    ok: true,
    spots: { infant: 0, toddler: 2, preschool: 5 },
    total: 7,
    band: 3,
  });
  assert.deepEqual(spotsFromAgeCounts(["infant"], { infant: "" }), {
    ok: true,
    spots: { infant: 0, toddler: 0, preschool: 0 },
    total: 0,
    band: 0,
  });
  assert.equal(spotsFromAgeCounts(["infant"], { infant: 1 }).band, 1);
});

test("bad counts are refused", () => {
  assert.deepEqual(spotsFromAgeCounts(["infant"], { infant: -1 }), { ok: false });
  assert.deepEqual(spotsFromAgeCounts(["infant"], { infant: 1.5 }), { ok: false });
  assert.deepEqual(spotsFromAgeCounts(["infant"], { infant: 100 }), { ok: false });
  assert.deepEqual(spotsFromAgeCounts([], { infant: 1 }), { ok: false });
});

test("EN and FR copy match keys", () => {
  assert.deepEqual(
    Object.keys(spotsByAgeCopy("fr")).sort(),
    Object.keys(spotsByAgeCopy("en")).sort(),
  );
  assert.equal(spotsByAgeCopy("fr").infant, "Poupons");
});

test("the no-login check-in page saves by age through the same signed link", () => {
  const page = readFileSync(new URL("../src/routes/spots.$token.tsx", import.meta.url), "utf8");
  assert.match(page, /saveOpenSpotsByAge\(\{ data: \{ token, \.\.\.byAge \} \}\)/);
  const server = readFileSync(
    new URL("../src/lib/server/open-spots-checkin.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    server,
    /export async function applyOpenSpotsByAge[\s\S]*verifyOpenSpotsToken\(token, openSpotsTokenSecret\(\), now\)/,
  );
  assert.match(server, /aboutTestListing: isAdminOnlyListing/);
});
