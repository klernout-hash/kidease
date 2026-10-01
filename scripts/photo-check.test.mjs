import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { AI_FLAGS, aiFlagDefaultOn } from "../src/lib/ai/flags.ts";
import { aiFeatureVisible } from "../src/lib/ai/flag-gate.ts";
import {
  localPhotoFacts,
  photoCheckOutcome,
  photoCheckSchema,
  PHOTO_CHECK_SYSTEM,
} from "../src/lib/ai/photo-check.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("ai-photo-check stays off when PostHog is off or unreachable", () => {
  assert.equal(aiFlagDefaultOn(AI_FLAGS.photoCheck, 0), false);
  assert.equal(
    aiFeatureVisible({ flag: AI_FLAGS.photoCheck, bucket: 0, snapshot: { reached: false, flags: {} } }),
    false,
  );
  assert.equal(
    aiFeatureVisible({
      flag: AI_FLAGS.photoCheck,
      bucket: 0,
      snapshot: { reached: true, flags: { "ai-photo-check": false } },
    }),
    false,
  );
  assert.equal(
    aiFeatureVisible({
      flag: AI_FLAGS.photoCheck,
      bucket: 99,
      snapshot: { reached: true, flags: { "ai-photo-check": true } },
    }),
    true,
  );
});

test("a failed model uses measured blur and dark, and does not invent a child's face", () => {
  const local = localPhotoFacts({ meanLuma: 10, edgeScore: 2, sha256: "abc", existingHashes: [] });
  assert.equal(local.dark, true);
  assert.equal(local.blurry, true);
  const outcome = photoCheckOutcome({ model: null, local });
  assert.equal(outcome.source, "fallback");
  assert.equal(outcome.hold, false);
  assert.deepEqual(outcome.warnings, ["blurry", "dark"]);
});

test("a duplicate is a matching hash, and a child's face cannot be kept", () => {
  const same = "a".repeat(64);
  const local = localPhotoFacts({ meanLuma: 180, edgeScore: 20, sha256: same, existingHashes: [same] });
  assert.equal(local.duplicate, true);
  const kept = photoCheckOutcome({
    model: { blurry: false, dark: false, childFace: true },
    local,
  });
  assert.equal(kept.hold, true);
  assert.deepEqual(kept.warnings, ["duplicate"]);
  const clear = photoCheckOutcome({
    model: { blurry: false, dark: false, childFace: false },
    local: { ...local, duplicate: false },
  });
  assert.equal(clear.hold, false);
  assert.deepEqual(clear.warnings, []);
});

test("the model cannot add a fee, a licence, or a review", () => {
  assert.equal(photoCheckSchema.safeParse({ blurry: true, dark: false, childFace: false, fee: "10" }).success, false);
  assert.equal(photoCheckSchema.safeParse({ blurry: false, dark: false, childFace: false }).success, true);
  assert.match(PHOTO_CHECK_SYSTEM, /Do not guess a daycare, fee, licence, spot, or review/);
  assert.doesNotMatch(PHOTO_CHECK_SYSTEM, /invent a daycare name/i);
});

test("upload uses the server check and a held photo is not added", () => {
  const form = read("src/components/provider-listing-forms.tsx");
  const server = read("src/lib/server/photo-check.ts");
  const client = read("src/lib/ai/client.ts");
  const gate = read("src/lib/ai/flag-gate.ts");
  assert.match(form, /useAiFeatureFlag\(AI_FLAGS\.photoCheck\)/);
  assert.match(form, /checkListingPhoto/);
  assert.match(form, /if \(result\.hold\)/);
  assert.match(form, /photo_check_held/);
  assert.match(server, /feature: "ai-photo-check"/);
  assert.match(server, /callAi/);
  assert.match(server, /imageDataUrl: data\.dataUrl/);
  assert.doesNotMatch(server, /resend|nodemailer|sendMail/);
  assert.match(client, /image_url/);
  assert.match(gate, /AI_FLAGS\.photoCheck/);
  assert.match(read("src/routes/admin-ai.tsx"), /PhotoCheckReview/);
});
