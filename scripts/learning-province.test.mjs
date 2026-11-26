import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FRAMEWORK_DOMAINS, frameworkForProvince, frameworksForProvince, parseStory } from "../src/lib/learning-stories.ts";
import { storiesCopy } from "../src/lib/learning-stories-copy.ts";

test("B05 #28: a Manitoba centre starts on Early Returns and sees it first", () => {
  assert.equal(frameworkForProvince("MB"), "early-returns");
  assert.equal(frameworkForProvince("Manitoba"), "early-returns");
  assert.equal(frameworksForProvince("MB")[0], "early-returns");
  assert.equal(frameworksForProvince("MB").length, 5);
  assert.equal(frameworkForProvince("ON"), "hdlh");
  assert.equal(frameworkForProvince("Québec"), "accueillir");
  assert.equal(frameworkForProvince("NS"), "hdlh");
  assert.deepEqual([...FRAMEWORK_DOMAINS["early-returns"]], ["social", "emotional", "physical", "cognitive"]);
  const parsed = parseStory({ childId: "kid-1", title: "Blocks", body: "Built a tower", framework: "early-returns", domain: "social", observedOn: "2026-11-25" });
  assert.equal(parsed.ok, true);
});

test("B05 #28: the centre picker says Centre / Garderie, not Child", () => {
  assert.equal(storiesCopy("en").centre, "Centre");
  assert.equal(storiesCopy("fr").centre, "Garderie");
  assert.equal(storiesCopy("en").domains["early-returns"][0].label, "Social development");
  const desk = readFileSync(new URL("../src/components/learning-stories-desk.tsx", import.meta.url), "utf8");
  assert.match(desk, /data-ke="learning-centre-select">\s*\{copy\.centre\}/);
  assert.match(desk, /frameworkOrder\.map/);
});
