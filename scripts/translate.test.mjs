import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { AI_FLAGS, aiFlagDefaultOn } from "../src/lib/ai/flags.ts";
import { aiFeatureVisible } from "../src/lib/ai/flag-gate.ts";
import { groundListingFrench, translateSchema, TRANSLATE_SYSTEM, translateSource } from "../src/lib/ai/translate.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("ai-translate stays off when PostHog is off or unreachable", () => {
  assert.equal(aiFlagDefaultOn(AI_FLAGS.translate, 0), false);
  assert.equal(
    aiFeatureVisible({ flag: AI_FLAGS.translate, bucket: 0, snapshot: { reached: false, flags: {} } }),
    false,
  );
  assert.equal(
    aiFeatureVisible({
      flag: AI_FLAGS.translate,
      bucket: 4,
      snapshot: { reached: true, flags: { "ai-translate": false } },
    }),
    false,
  );
  assert.equal(
    aiFeatureVisible({
      flag: AI_FLAGS.translate,
      bucket: 90,
      snapshot: { reached: true, flags: { "ai-translate": true } },
    }),
    true,
  );
});

test("a French draft that invents a fee or a number is refused", () => {
  const source = translateSource("Open 7:30 to 17:30 for infants and toddlers.", "Harbour Kids");
  assert.match(source, /7:30/);
  assert.equal(groundListingFrench("Ouvert de 7:30 a 17:30 pour les poupons.", source).length > 0, true);
  assert.equal(groundListingFrench("Les frais sont de 10 $ par jour.", source), "");
  assert.equal(groundListingFrench("Numero de licence 12345.", source), "");
  assert.equal(groundListingFrench("Ecrivez a owner@example.com.", source), "");
  assert.equal(translateSchema.safeParse({ french: "Bonjour", fee: 1 }).success, false);
  assert.match(TRANSLATE_SYSTEM, /Do not add a fee/);
});

test("the draft is not saved and the model only sees listing text", () => {
  const page = read("src/components/listing-translate.tsx");
  const server = read("src/lib/server/translate.ts");
  const claims = read("src/lib/server/claims.ts");
  assert.match(page, /useAiFeatureFlag\(AI_FLAGS\.translate\)/);
  assert.match(page, /translateSave/);
  assert.match(page, /translateAuto/);
  assert.match(server, /feature: "ai-translate"/);
  assert.match(server, /select description, tagline/);
  assert.doesNotMatch(server, /contact_email|phone/);
  assert.match(server, /AI_FLAGS\.translate/);
  assert.match(claims, /descriptionFr/);
  assert.match(read("src/lib/ai/flag-gate.ts"), /AI_FLAGS\.translate/);
  assert.match(read("src/components/provider-parent-fields.tsx"), /ListingTranslate/);
});
