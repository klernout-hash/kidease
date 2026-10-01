import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { AI_FLAGS, aiFlagDefaultOn } from "../src/lib/ai/flags.ts";
import { aiFeatureVisible } from "../src/lib/ai/flag-gate.ts";
import {
  groundReplyDraft,
  replyDraftModelUser,
  replyDraftQuiet,
  replyDraftSchema,
  REPLY_DRAFT_SYSTEM,
} from "../src/lib/ai/reply-drafts.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const facts = {
  centre: "Harbour Kids",
  city: "Winnipeg",
  hours: "7:30 to 17:30",
  infant: 1,
  toddler: 0,
  preschool: 0,
  ageMin: 12,
  ageMax: 60,
  parentMessage: "Do you have an infant spot in November?",
};

test("ai-reply-drafts stays off when PostHog is off or unreachable", () => {
  assert.equal(aiFlagDefaultOn(AI_FLAGS.replyDrafts, 0), false);
  assert.equal(
    aiFeatureVisible({ flag: AI_FLAGS.replyDrafts, bucket: 0, snapshot: { reached: false, flags: {} } }),
    false,
  );
  assert.equal(
    aiFeatureVisible({
      flag: AI_FLAGS.replyDrafts,
      bucket: 10,
      snapshot: { reached: true, flags: { "ai-reply-drafts": false } },
    }),
    false,
  );
  assert.equal(
    aiFeatureVisible({
      flag: AI_FLAGS.replyDrafts,
      bucket: 99,
      snapshot: { reached: true, flags: { "ai-reply-drafts": true } },
    }),
    true,
  );
});

test("a failed or invented reply is dropped and does not add a fee", () => {
  assert.equal(groundReplyDraft(null, facts).source, "fallback");
  assert.equal(groundReplyDraft(null, facts).body, "");
  const invented = groundReplyDraft({ body: "Yes, the infant fee is $10 a day and we have 4 spots." }, facts);
  assert.equal(invented.source, "fallback");
  assert.equal(invented.body, "");
  const kept = groundReplyDraft({ body: "Yes, Harbour Kids has 1 infant spot. Hours are 7:30 to 17:30." }, facts);
  assert.equal(kept.source, "model");
  assert.equal(replyDraftSchema.safeParse({ body: kept.body, fee: "10" }).success, false);
  assert.match(REPLY_DRAFT_SYSTEM, /Do not add a fee/);
  const user = replyDraftModelUser(facts);
  assert.doesNotMatch(user, /@/);
  assert.doesNotMatch(user, /birthdate/i);
});

test("a drafted reply is not sent after 9 PM Winnipeg", () => {
  assert.equal(replyDraftQuiet(new Date("2026-10-01T02:30:00.000Z")), true);
  assert.equal(replyDraftQuiet(new Date("2026-10-01T15:00:00.000Z")), false);
  const page = read("src/routes/inbox.$id.tsx");
  const server = read("src/lib/server/reply-drafts.ts");
  assert.match(page, /useAiFeatureFlag\(AI_FLAGS\.replyDrafts\)/);
  assert.match(page, /replyDraftQuiet\(\)/);
  assert.match(page, /draftInboxReply/);
  assert.match(server, /feature: "ai-reply-drafts"/);
  assert.match(server, /scrubText/);
  assert.doesNotMatch(server, /contact_email/);
  assert.match(read("src/lib/ai/flag-gate.ts"), /AI_FLAGS\.replyDrafts/);
});
