import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { AI_FLAGS } from "../src/lib/ai/flags.ts";
import { ADMIN_REMOTE_FLAGS, SERVER_FLAG_KEYS, aiFeatureVisible } from "../src/lib/ai/flag-gate.ts";
import {
  PROTECTED_LISTING_ID,
  applyApprovedTruthChange,
  demandMapCells,
  diffListingAgainstWebsite,
  parseAgeRangeMonths,
  readLicenceText,
  safeWebsiteUrl,
  scoreSpam,
  triageSupport,
  truthTargets,
  websitePlainText,
} from "../src/lib/admin-tools.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFileSync(join(root, path), "utf8");

test("admin flags stay off when PostHog cannot be reached and are part of the server read", () => {
  for (const flag of ADMIN_REMOTE_FLAGS) {
    assert.equal(aiFeatureVisible({ flag, bucket: 0, snapshot: { reached: false, flags: {} } }), false);
    assert.equal(aiFeatureVisible({ flag, bucket: 0, snapshot: { reached: true, flags: {} } }), false);
    assert.equal(SERVER_FLAG_KEYS.includes(flag), true);
  }
  assert.equal(aiFeatureVisible({
    flag: AI_FLAGS.truthChecker,
    bucket: 0,
    snapshot: { reached: true, flags: { "ai-truth-checker": true } },
  }), true);
});

test("website diffs do not change the listing until a person approves", () => {
  const listing = {
    id: "centre-1",
    phone: "204-555-0100",
    hours: "7am-6pm",
    ageLabel: "18 months to 5 years",
    address: "1 Main St",
  };
  const before = { ...listing };
  const changes = diffListingAgainstWebsite(
    listing,
    "Phone: 204-555-0199. Hours: 8am-5pm. Ages: 12 months to 4 years. Address: 9 Oak Ave.",
  );
  assert.deepEqual(listing, before);
  assert.equal(changes.length, 4);
  const refused = applyApprovedTruthChange(listing, changes[0], false);
  assert.equal(refused, listing);
  const approved = applyApprovedTruthChange(listing, changes[0], true);
  assert.equal(approved.phone, "204-555-0199");
  assert.equal(listing.phone, "204-555-0100");
  const locked = applyApprovedTruthChange(
    { ...listing, id: PROTECTED_LISTING_ID },
    changes[0],
    true,
  );
  assert.equal(locked.phone, "204-555-0100");
  const claimed = applyApprovedTruthChange({ ...listing, agesConfirmed: 1 }, changes.find((row) => row.field === "ages"), true);
  assert.equal(claimed.ageLabel, listing.ageLabel);
  assert.equal(diffListingAgainstWebsite({ ...listing, agesConfirmed: true }, "Ages: 1 year to 2 years.").some((row) => row.field === "ages"), false);
});

test("age text is saved only when the range is clear", () => {
  assert.deepEqual(parseAgeRangeMonths("18 months to 5 years"), { min: 18, max: 60 });
  assert.equal(parseAgeRangeMonths("school age"), null);
});

test("licence text is a suggestion and is never approved", () => {
  const read = readLicenceText("Licence number: AB-12345. Holder: Ada Lovelace. Expiry: 2027-04-01.");
  assert.equal(read.licenceNumber, "AB-12345");
  assert.equal(read.holderName, "Ada Lovelace");
  assert.equal(read.expiry, "2027-04-01");
  assert.equal(read.confirmed, false);
  const server = source("src/lib/server/admin-tools.ts");
  assert.match(server, /approved: false/);
  assert.doesNotMatch(server, /claim_status\s*=\s*'approved'|set verified = 1/);
});

test("spam scores signups, messages, and reviews, and only high scores are a queue", () => {
  const quiet = scoreSpam({ kind: "message", text: "Can we tour on Tuesday?", email: "parent@example.com" });
  assert.equal(quiet.high, false);
  const loud = scoreSpam({
    kind: "review",
    text: "Click here for bitcoin and guaranteed income https://a.test https://b.test https://c.test",
    email: "x@mailinator.com",
  });
  assert.equal(loud.high, true);
  assert.equal(loud.kind, "review");
  const signup = scoreSpam({ kind: "signup", text: "Ada", email: "ada@guerrillamail.com" });
  assert.equal(signup.high, true);
});

test("support triage drafts a reply and never sends it", () => {
  const draft = triageSupport("I need a refund on my invoice");
  assert.equal(draft.tag, "billing");
  assert.equal(draft.send, false);
  assert.match(draft.draft, /admin will read this/);
  const server = source("src/lib/server/admin-tools.ts");
  assert.match(server, /sent = 0|sent, 0/);
  assert.doesNotMatch(server, /set sent = 1/);
});

test("demand map groups city and age without a street map", () => {
  const cells = demandMapCells([
    { city: "Laval", ageGroup: "toddler", searches: 4, saves: 1, spotRequests: 0, listings: 2, confirmedOpenings: 1 },
    { city: "Laval", ageGroup: "infant", searches: 1, saves: 0, spotRequests: 0, listings: 8, confirmedOpenings: 2 },
  ]);
  assert.equal(cells[0].city, "Laval");
  assert.equal(cells[0].ageGroup, "toddler");
  assert.equal(cells[0].gap, 2);
  assert.match(source("src/routes/admin-ranking.tsx"), /admin-demand-map/);
  assert.doesNotMatch(source("src/routes/admin-ranking.tsx"), /mapbox|google\.maps/i);
});

test("the nightly check does nothing when the flag is off and skips the protected listing", () => {
  const job = source("src/lib/server/admin-tools.ts");
  assert.match(job, /if \(!on\) return \{ ok: true as const, skipped: "flag-off" as const, queued: 0 \}/);
  const targets = truthTargets([
    { id: PROTECTED_LISTING_ID, website: "https://example.com" },
    { id: "ok", website: "http://127.0.0.1/secret" },
    { id: "live", website: "https://centre.example/about" },
  ]);
  assert.deepEqual(targets.map((row) => row.id), ["live"]);
  assert.equal(safeWebsiteUrl("file:///etc/passwd"), null);
  assert.match(websitePlainText("<script>secret</script><p>Phone: 204-555-0100</p>"), /Phone: 204-555-0100/);
  assert.doesNotMatch(websitePlainText("<script>secret</script>"), /secret/);
  assert.match(source("src/inngest/functions.ts"), /truth-checker-nightly/);
  assert.match(source("src/inngest/functions.ts"), /runTruthCheckerJob/);
});
