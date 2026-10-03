import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ageGroupsInRange,
  applyOpenSpotsBand,
  checkinDispatchPlan,
  checkinEmailText,
  checkinSmsText,
  checkinWeekKey,
  viewsWindowStart,
} from "../src/lib/open-spots-checkin.ts";
import { signOpenSpotsToken, verifyOpenSpotsToken } from "../src/lib/open-spots-checkin-token.ts";
import { openSpotsCopy } from "../src/lib/open-spots-checkin-copy.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { openSpotsCheckinMailEnabled, openSpotsCheckinSmsEnabled } from "../src/lib/features.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("open spots check-in stays off and does not invent an age split", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_OPEN_SPOTS_CHECKIN_MAIL, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_OPEN_SPOTS_CHECKIN_SMS, false);
  assert.equal(openSpotsCheckinMailEnabled({}), false);
  assert.equal(openSpotsCheckinSmsEnabled({ FEATURE_OPEN_SPOTS_CHECKIN_SMS: "1" }), true);
  assert.equal(checkinDispatchPlan(false, false).reason, "flags-off");
  assert.equal(checkinDispatchPlan(true, false).email, true);
  assert.equal(checkinDispatchPlan(true, false).sms, false);

  const zero = applyOpenSpotsBand({ infant: 2, toddler: 1, preschool: 4 }, ["infant", "toddler"], 0);
  assert.deepEqual(zero.spots, { infant: 0, toddler: 0, preschool: 0 });
  assert.equal(zero.splitKnown, true);

  const infant = applyOpenSpotsBand({ infant: 0, toddler: 0, preschool: 0 }, ageGroupsInRange(0, 12), 2);
  assert.deepEqual(infant.spots, { infant: 2, toddler: 0, preschool: 0 });
  assert.equal(infant.splitKnown, true);

  const mixed = applyOpenSpotsBand({ infant: 1, toddler: 0, preschool: 4 }, ageGroupsInRange(0, 48), 1);
  assert.equal(mixed.spots.preschool, 4);
  assert.equal(mixed.confirmedOpenSpots, 1);
  assert.equal(mixed.splitKnown, false);

  const matched = applyOpenSpotsBand({ infant: 0, toddler: 0, preschool: 3 }, ["preschool"], 3);
  assert.equal(matched.spots.preschool, 3);
  assert.equal(matched.splitKnown, true);

  const now = Date.parse("2026-10-03T15:00:00.000Z");
  assert.equal(viewsWindowStart(now), "2026-09-27");
  assert.match(checkinWeekKey(now), /^2026-W/);

  const secret = "test-secret";
  const token = signOpenSpotsToken({ daycareId: "d_1", exp: now + 1000 }, secret);
  assert.ok(token);
  assert.deepEqual(verifyOpenSpotsToken(token, secret, now), { daycareId: "d_1", exp: now + 1000 });
  assert.equal(signOpenSpotsToken({ daycareId: "d_1", exp: now + 1000 }, ""), null);
  assert.equal(verifyOpenSpotsToken(token, "", now), null);
  assert.equal(verifyOpenSpotsToken(token, secret, now + 5000), null);

  const mail = checkinEmailText({
    name: "Little Oaks",
    views: 4,
    links: { 0: "https://www.kidease.ca/spots/t?band=0", 1: "https://www.kidease.ca/spots/t?band=1", 2: "https://www.kidease.ca/spots/t?band=2", 3: "https://www.kidease.ca/spots/t?band=3" },
  });
  assert.match(mail.text, /4 times/);
  assert.match(mail.text, /band=3/);
  assert.doesNotMatch(`${mail.subject} ${mail.text} ${checkinSmsText({ name: "Little Oaks", views: 4, pageUrl: "https://www.kidease.ca/spots/t" })}`, /—|free forever|Winnipeg-based/);
  const copy = openSpotsCopy("en");
  const fr = openSpotsCopy("fr");
  assert.match(copy.smsSoon, /coming soon/);
  assert.match(fr.title, /places libres/);
  assert.doesNotMatch(`${copy.title} ${copy.why} ${fr.why} ${copy.smsSoon}`, /—|free forever|Winnipeg-based/);

  const server = readFileSync(join(root, "src/lib/server/open-spots-checkin.ts"), "utf8");
  assert.match(server, /flags-off/);
  assert.match(server, /last_vacancy_updated_at = now\(\)/);
  assert.match(server, /daycare_views/);
  assert.match(readFileSync(join(root, "vercel.json"), "utf8"), /\/api\/open-spots-checkin/);
});
