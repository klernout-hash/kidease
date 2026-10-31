import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { parentMayReadStory, parseStory } from "../src/lib/learning-stories.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("learning stories stay off, private, and without photos", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_LEARNING_PORTFOLIOS, false);
  assert.match(src(".env.example"), /^FEATURE_LEARNING_PORTFOLIOS=0$/m);
  const server = src("src/lib/server/learning-stories.ts");
  assert.match(server, /is_private = 1/);
  assert.match(server, /status = any/);
  assert.match(server, /do not take photos/);
  assert.doesNotMatch(server, /photo_url|image_url|type=.file/);
  assert.doesNotMatch(src("migrations/0111_learning_stories.sql"), /\bphoto\b/);
  assert.doesNotMatch(src("src/routes/daycare.$slug.tsx"), /learning_stories|LearningStories/);
});

test("a story is for one enrolled child and a public visitor cannot read it", () => {
  const story = parseStory({
    childId: "ch_1",
    title: "Block tower",
    body: "She stacked three blocks and asked a friend to try.",
    framework: "hdlh",
    domain: "engagement",
    observedOn: "2026-10-31",
  });
  assert.equal(story.ok, true);
  if (story.ok) assert.equal(story.story.isPrivate, true);
  assert.equal(parseStory({ childId: "ch_1", title: "A", body: "B", framework: "hdlh", domain: "engagement", observedOn: "2026-10-31", photo: "face.jpg" }).ok, false);
  assert.equal(parseStory({ childId: "ch_1", title: "A", body: "B", framework: "hdlh", domain: "nope", observedOn: "2026-10-31" }).ok, false);
  assert.equal(parentMayReadStory({ enrolled: true, ownsChild: true }), true);
  assert.equal(parentMayReadStory({ enrolled: false, ownsChild: true }), false);
  assert.equal(parentMayReadStory({ enrolled: true, ownsChild: false }), false);
});
