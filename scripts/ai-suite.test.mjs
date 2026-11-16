import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import {
  AI_SUITE_FLAGS,
  dailyUpdateDraft,
  leadScore,
  phoneReceptionScript,
  postDraft,
  reviewRequestDraft,
  smartStaffingNote,
  tourFollowUpDraft,
  waitlistFillDraft,
} from "../src/lib/ai/suite.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("every AI suite flag defaults off and sends nothing", () => {
  for (const key of AI_SUITE_FLAGS) assert.equal(FLAG_DEFAULTS[key], false);
  const follow = tourFollowUpDraft({ enabled: false, centre: "Oak Room", parentName: "Sam", visited: true });
  assert.equal(follow.enabled, false);
  assert.equal(follow.sent, false);
  assert.equal(follow.body, "");
  const phone = phoneReceptionScript({ enabled: true, centre: "Oak Room", hours: "7:30 to 17:30" });
  assert.equal(phone.callPlaced, false);
  assert.equal(phone.paidService, false);
  assert.match(phone.script, /did not place this call/);
  const offer = waitlistFillDraft({ enabled: true, centre: "Oak Room", openSpots: 1, nextFamily: "Sam" });
  assert.equal(offer.sent, false);
  assert.match(offer.body, /nothing was sent/i);
});

test("drafts use only the facts given and stay quiet without a visit or a note", () => {
  assert.equal(tourFollowUpDraft({ enabled: true, centre: "Oak", parentName: "Sam", visited: false }).body, "");
  const follow = tourFollowUpDraft({ enabled: true, locale: "fr", centre: "Chêne", parentName: "Sam", visited: true });
  assert.match(follow.body, /Chêne/);
  assert.equal(follow.sent, false);
  assert.equal(leadScore({ enabled: true, messages: 2, tours: 0, enrolled: false }).band, "talking");
  assert.equal(leadScore({ enabled: false, messages: 2, tours: 1, enrolled: true }).band, null);
  assert.equal(dailyUpdateDraft({ enabled: true, childName: "Ada", note: "" }).body, "");
  const update = dailyUpdateDraft({ enabled: true, childName: "Ada", note: "Played outside." });
  assert.match(update.body, /Played outside/);
  assert.equal(update.sent, false);
  assert.equal(reviewRequestDraft({ enabled: true, centre: "Oak", parentName: "Sam", visited: false }).body, "");
  const review = reviewRequestDraft({ enabled: true, centre: "Oak", parentName: "Sam", visited: true });
  assert.match(review.body, /your own note/);
  assert.doesNotMatch(review.body, /\b[1-5] stars?\b|government/i);
  const staff = smartStaffingNote({ enabled: true, room: "Toddlers", children: 6, educators: 2 });
  assert.match(staff.body, /6 children and 2 educators/);
  assert.match(staff.body, /not a licensing decision/);
  assert.doesNotMatch(staff.body, /government/i);
  const post = postDraft({ enabled: true, centre: "Oak", fact: "Open house Saturday." });
  assert.match(post.body, /Open house Saturday/);
  assert.match(post.body, /does not post it/);
});

test("the suite does not call a sender or a paid phone line", () => {
  const src = read("src/lib/ai/suite.ts") + read("src/lib/server/ai-suite.ts") + read("src/components/ai-suite-panel.tsx");
  assert.doesNotMatch(src, /notifyConsented|sendMail|twilio|stripe|government/i);
  assert.match(src, /callPlaced: false/);
  assert.match(src, /sent: false/);
});
