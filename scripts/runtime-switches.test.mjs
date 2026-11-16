import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  RUNTIME_SWITCH_KEYS,
  assertRuntimeSwitch,
  runtimeSwitchCopy,
  runtimeSwitchOn,
  runtimeSwitchSnapshot,
} from "../src/lib/runtime-switches.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("kill switches stay on until the env value is 0", () => {
  for (const key of RUNTIME_SWITCH_KEYS) {
    assert.equal(runtimeSwitchOn(key, {}), true, key);
    assert.equal(runtimeSwitchOn(key, { [key]: "" }), true, key);
    assert.equal(runtimeSwitchOn(key, { [key]: "1" }), true, key);
    assert.equal(runtimeSwitchOn(key, { [key]: "0" }), false, key);
    assert.equal(runtimeSwitchOn(key, { [key]: "false" }), false, key);
    assert.equal(runtimeSwitchOn(key, { [key]: "off" }), false, key);
    const en = runtimeSwitchCopy(key, "en");
    const fr = runtimeSwitchCopy(key, "fr");
    assert.ok(en.title && en.body, key);
    assert.ok(fr.title && fr.body, key);
    assert.notEqual(en.title, fr.title, key);
  }
  const off = runtimeSwitchSnapshot({ FEATURE_PUBLIC_MAP: "0", FEATURE_INBOX: "0" });
  assert.equal(off.publicMap, false);
  assert.equal(off.inbox, false);
  assert.equal(off.tourBooking, true);
  assert.equal(off.claimListing, true);
  assert.throws(() => assertRuntimeSwitch("FEATURE_INBOX", { FEATURE_INBOX: "0" }), /search for care/i);
});

test("paused screens and server actions use the same switches", () => {
  const files = {
    "src/routes/__root.tsx": /readRuntimeSwitches/,
    "src/routes/search.tsx": /publicMap/,
    "src/components/listing-map.tsx": /FEATURE_PUBLIC_MAP|id="publicMap"/,
    "src/routes/inbox.tsx": /id="inbox"/,
    "src/lib/server/inbox.ts": /FEATURE_INBOX/,
    "src/lib/server/tours.ts": /FEATURE_TOUR_BOOKING/,
    "src/components/tour-card.tsx": /id="tourBooking"/,
    "src/lib/server/spot-offers.ts": /FEATURE_WAITLIST_SPOTS/,
    "src/lib/server/area-waitlist.ts": /FEATURE_WAITLIST_SPOTS/,
    "src/routes/claim.tsx": /id="claimListing"/,
    "src/lib/server/claims.ts": /FEATURE_CLAIM_LISTING/,
    "src/routes/vacancy-index.tsx": /vacancyIndex/,
    "src/components/jobs-interest-form.tsx": /intent: "job-interest"/,
    "src/lib/server/notify.ts": /FEATURE_JOB_INTEREST/,
  };
  for (const [file, pattern] of Object.entries(files)) {
    assert.match(src(file), pattern, file);
  }
  const example = src(".env.example");
  for (const key of RUNTIME_SWITCH_KEYS) {
    assert.match(example, new RegExp(`# ${key}=0`));
    assert.doesNotMatch(example, new RegExp(`^${key}=`, "m"));
  }
  assert.match(src("docs/flags.md"), /Runtime kill switches/);
  assert.match(src("docs/flags.md"), /PostHog does not override/);
});
