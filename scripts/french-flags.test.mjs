import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { AI_FLAGS, aiBucket } from "../src/lib/ai/flags.ts";
import { aiFeatureVisible } from "../src/lib/ai/flag-gate.ts";
import { tx } from "../src/lib/copy.ts";
import { assignRankingVariant, parseRankingOverride, rankingFlagOn } from "../src/lib/ranking/variant.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("French search follows ranking-best-match the same way as English", () => {
  assert.equal(rankingFlagOn({ reached: false, flags: {} }), false);
  assert.equal(rankingFlagOn({ reached: true, flags: { "ranking-best-match": false } }), false);
  assert.equal(rankingFlagOn({ reached: true, flags: { "ranking-best-match": true } }), true);
  assert.equal(assignRankingVariant({ flag: true }), "best_match");
  assert.equal(assignRankingVariant({ flag: false }), "nearest");
  assert.equal(assignRankingVariant({ flag: undefined }), "nearest");
  assert.equal(assignRankingVariant({ flag: false, override: "best" }), "best_match");
  assert.equal(assignRankingVariant({ flag: true, override: "nearest" }), "nearest");
  assert.equal(parseRankingOverride("best"), "best");
  assert.equal(parseRankingOverride("nearest"), "nearest");

  const fr = read("src/routes/fr.search.tsx");
  const en = read("src/routes/search.tsx");
  assert.match(fr, /SearchScreen/);
  assert.match(en, /useRankingBestMatchFlag/);
  assert.match(en, /assignRankingVariant/);
  assert.match(en, /parseRankingOverride/);
  assert.match(en, /t\("sortBest"\)/);
  assert.doesNotMatch(en, /isPostHogFlagEnabled|getPostHog/);
  assert.equal(tx("fr", "sortBest"), "Meilleure correspondance");
  assert.match(read("src/lib/ranking/use-ranking-flag.ts"), /readAiFeatureFlags/);
  assert.match(read("src/lib/ranking/use-ranking-flag.ts"), /kidease-ai-id/);
});

test("Find my match and Write it for me use one flag read and the same visitor id", () => {
  const id = "same-visitor-id";
  const bucket = aiBucket(id);
  assert.equal(aiBucket(id), bucket);
  assert.equal(
    aiFeatureVisible({
      flag: AI_FLAGS.smartMatch,
      bucket,
      snapshot: { reached: true, flags: { "smart-match": false } },
    }),
    false,
  );
  assert.equal(
    aiFeatureVisible({
      flag: AI_FLAGS.listingWriter,
      bucket,
      snapshot: { reached: true, flags: { "ai-listing-writer": true } },
    }),
    true,
  );
  assert.equal(
    aiFeatureVisible({ flag: AI_FLAGS.smartMatch, bucket: 0, snapshot: { reached: false, flags: {} } }),
    true,
  );
  assert.equal(
    aiFeatureVisible({ flag: AI_FLAGS.listingWriter, bucket: 0, snapshot: { reached: false, flags: {} } }),
    true,
  );
  assert.equal(
    aiFeatureVisible({ flag: AI_FLAGS.smartMatch, bucket: 90, snapshot: { reached: false, flags: {} } }),
    false,
  );
  assert.equal(
    aiFeatureVisible({ flag: AI_FLAGS.listingWriter, bucket: 90, snapshot: { reached: false, flags: {} } }),
    false,
  );

  const fr = read("src/routes/search.tsx");
  const smartUi = read("src/components/smart-match.tsx");
  const writerUi = read("src/components/listing-writer.tsx");
  const smartServer = read("src/lib/server/smart-match.ts");
  const writerServer = read("src/lib/server/listing-writer.ts");
  assert.match(fr, /SmartMatchEntry/);
  assert.match(smartUi, /useAiFeatureFlag\(AI_FLAGS\.smartMatch\)/);
  assert.match(smartUi, /helpBubbleDistinctId/);
  assert.match(writerUi, /useAiFeatureFlag\(AI_FLAGS\.listingWriter\)/);
  assert.match(smartServer, /aiFeatureOn\(AI_FLAGS\.smartMatch/);
  assert.match(writerServer, /aiFeatureOn\(AI_FLAGS\.listingWriter, context\.userId\)/);
  assert.match(read("src/lib/ai/use-ai-flag.ts"), /kidease-ai-id/);
  assert.match(read("src/lib/server/ai-feature.ts"), /sanitizeAiDistinctId/);
  assert.match(read("src/lib/server/ai-feature.ts"), /aiBucket/);
  assert.doesNotMatch(read("src/routes/fr.daycare.$slug.tsx"), /draftListingCopy|refineSmartMatch/);
});
