import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { messageIsBlocked, safetyText, viewerHasBlocked } from "../src/lib/safety.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("a block stops chat in both directions and covers later centre staff", () => {
  const blocks = [
    { blockerUserId: "parent", blockedUserId: "director", daycareId: "centre" },
    { blockerUserId: "parent", blockedUserId: null, daycareId: "centre" },
  ];
  assert.equal(
    messageIsBlocked({
      senderId: "director",
      parentUserId: "parent",
      daycareId: "centre",
      centreUserIds: ["director"],
      blocks,
    }),
    true,
  );
  assert.equal(
    messageIsBlocked({
      senderId: "parent",
      parentUserId: "parent",
      daycareId: "centre",
      centreUserIds: ["director"],
      blocks,
    }),
    true,
  );
  assert.equal(
    messageIsBlocked({
      senderId: "new-staff",
      parentUserId: "parent",
      daycareId: "centre",
      centreUserIds: ["new-staff"],
      blocks,
    }),
    true,
  );
  assert.equal(
    messageIsBlocked({
      senderId: "director",
      parentUserId: "other",
      daycareId: "other-centre",
      centreUserIds: ["director"],
      blocks: [],
    }),
    false,
  );
});

test("the viewer can see their own block and undo it", () => {
  const blocks = [{ blockerUserId: "parent", blockedUserId: null, daycareId: "centre" }];
  assert.equal(
    viewerHasBlocked({
      viewerId: "parent",
      parentUserId: "parent",
      daycareId: "centre",
      centreUserIds: [],
      blocks,
    }),
    true,
  );
  assert.equal(
    viewerHasBlocked({
      viewerId: "director",
      parentUserId: "parent",
      daycareId: "centre",
      centreUserIds: ["director"],
      blocks,
    }),
    false,
  );
});

test("help publishes a real safety contact and the admin queue is wired", () => {
  const en = safetyText("en");
  const fr = safetyText("fr");
  assert.match(en.helpLead, /report a listing, a centre, or a message/i);
  assert.match(fr.helpLead, /signaler une fiche/);
  assert.match(src("src/routes/help.tsx"), /data-ke="safety-contact"/);
  assert.match(src("src/routes/help.tsx"), /SUPPORT_INBOX_EMAIL/);
  assert.match(src("src/routes/help.tsx"), /PRIVACY_CONTACT_EMAIL/);
  assert.match(src("src/routes/help.tsx"), /companyAddress/);
  assert.doesNotMatch(src("src/routes/help.tsx"), /1-800|555-/);
  assert.match(src("src/components/safety-review-queue.tsx"), /listSafetyQueue/);
  assert.match(src("src/components/admin-trust.tsx"), /SafetyReviewQueue/);
  assert.match(src("src/lib/server/inbox.ts"), /assertChatNotBlocked/);
  assert.match(src("src/routes/inbox.$id.tsx"), /safety-block|BlockMessagesButton/);
  assert.match(src("src/routes/daycare.$slug.tsx"), /target="listing"/);
  assert.match(src("src/routes/daycare.$slug.tsx"), /target="centre"/);
  assert.match(src("migrations/0094_safety_reports.sql"), /safety_reports/);
  assert.match(src("migrations/0094_safety_reports.sql"), /safety_blocks/);
});
