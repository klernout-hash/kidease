import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { interactionIsBlocked, parentIsHidden, safetyText } from "../src/lib/safety.ts";
import "../tests/e2e/block-user.smoke.spec.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const centreBlock = [
  { blockerUserId: "parent", blockedUserId: null, daycareId: "centre" },
  { blockerUserId: "parent", blockedUserId: "director", daycareId: "centre" },
];

test("a block stops calls, requests, and reviews in both directions", () => {
  const shared = {
    parentUserId: "parent",
    daycareId: "centre",
    centreUserIds: ["director", "new-staff"],
    blocks: centreBlock,
  };
  assert.equal(interactionIsBlocked({ ...shared, senderId: "director" }), true);
  assert.equal(interactionIsBlocked({ ...shared, senderId: "parent" }), true);
  assert.equal(interactionIsBlocked({ ...shared, senderId: "new-staff" }), true);
  assert.equal(
    interactionIsBlocked({
      senderId: "parent",
      parentUserId: "parent",
      daycareId: "other",
      centreUserIds: ["director"],
      blocks: [],
    }),
    false,
  );
});

test("either direction hides the parent from the daycare request list", () => {
  assert.equal(
    parentIsHidden({ parentUserId: "parent", daycareId: "centre", blocks: centreBlock }),
    true,
  );
  assert.equal(
    parentIsHidden({
      parentUserId: "parent",
      daycareId: "centre",
      blocks: [{ blockerUserId: "director", blockedUserId: "parent", daycareId: "centre" }],
    }),
    true,
  );
  assert.equal(
    parentIsHidden({
      parentUserId: "other",
      daycareId: "centre",
      blocks: centreBlock,
    }),
    false,
  );
});

test("block copy explains the full block in English and French", () => {
  const en = safetyText("en");
  const fr = safetyText("fr");
  assert.match(en.blockConfirmBody, /both ways/i);
  assert.match(en.blockConfirmBody, /calls/i);
  assert.match(en.blockConfirmBody, /tour/i);
  assert.match(en.blockConfirmBody, /reviews/i);
  assert.match(en.helpLead, /report a listing, a centre, or a message/i);
  assert.match(en.helpLead, /both ways/i);
  assert.match(fr.blockDaycare, /garderie/i);
  assert.match(fr.blockFamily, /famille/i);
  assert.match(fr.blockConfirmBody, /deux sens/i);
  assert.match(fr.helpLead, /signaler une fiche/i);
  assert.equal(en.unblockPerson, "Unblock");
  assert.equal(fr.unblockPerson, "Débloquer");
});

test("block is enforced on messages, calls, requests, reviews, and the menus", () => {
  const safety = read("src/lib/server/safety.ts");
  assert.match(safety, /setMessageBlock/);
  assert.match(safety, /setDaycareBlock/);
  assert.match(safety, /setFamilyBlock/);
  assert.match(safety, /listMyBlocks/);
  assert.match(safety, /clearMyBlock/);
  assert.match(read("src/lib/server/inbox.ts"), /assertChatNotBlocked/);
  assert.match(read("src/lib/server/call-ring-fns.ts"), /assertChatNotBlocked/);
  assert.match(read("src/lib/server/voice-call.ts"), /assertChatNotBlocked/);
  assert.match(read("src/lib/server/video-join.ts"), /assertChatNotBlocked/);
  assert.match(read("src/lib/server/tours.ts"), /assertChatNotBlocked/);
  assert.match(read("src/lib/server/family.ts"), /assertChatNotBlocked/);
  assert.match(read("src/lib/server/reviews.ts"), /assertChatNotBlocked/);
  assert.match(read("src/lib/server/lead-requests.ts"), /assertChatNotBlocked/);
  assert.match(read("src/lib/server/multi-apply.ts"), /assertChatNotBlocked/);
  assert.match(read("src/lib/server/enrol-queue.ts"), /omitHiddenParents/);
  assert.match(read("src/routes/daycare.$slug.tsx"), /BlockDaycareButton/);
  assert.match(read("src/routes/inbox.$id.tsx"), /BlockMessagesButton/);
  assert.match(read("src/components/centre-inbox.tsx"), /side="family"/);
  assert.match(read("src/routes/provider.tsx"), /BlockFamilyButton/);
  assert.match(read("src/components/tour-card.tsx"), /BlockFamilyButton/);
  assert.match(read("src/components/daycare-lead-inbox.tsx"), /BlockFamilyButton/);
  assert.match(read("src/components/app-menu-screen.tsx"), /screen: "blocked"/);
  assert.match(read("src/routes/menu.tsx"), /BlockedListScreen/);
  assert.match(read("src/components/safety-actions.tsx"), /data-ke="block-confirm"/);
  assert.match(read("src/lib/copy-en.ts"), /Privacy & safety/);
  assert.match(read("src/lib/copy-fr.ts"), /Confidentialité et sécurité/);
});
