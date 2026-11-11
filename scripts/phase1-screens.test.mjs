// Flags on these cards stay off.
import assert from "node:assert/strict";
import { test } from "node:test";
import { PHASE1_CARD_COPY, phase1CardsFor } from "../src/lib/phase1-screens.ts";

test("a parent and a billing role cannot open staff health tools", () => {
  const parent = phase1CardsFor("parent");
  const billing = phase1CardsFor("billing");
  assert.equal(parent.includes("audit"), false);
  assert.equal(parent.includes("roll"), false);
  assert.equal(parent.includes("allergy"), false);
  assert.equal(parent.includes("toilet"), true);
  assert.equal(billing.includes("toilet"), false);
  assert.equal(billing.includes("allergy"), false);
  assert.equal(billing.includes("incident"), false);
  assert.equal(billing.includes("revenue"), true);
  assert.equal(phase1CardsFor("staff").includes("revenue"), false);
  assert.equal(phase1CardsFor("guest").length, 0);
  assert.equal(PHASE1_CARD_COPY.toilet.fr, "Toilettes");
  assert.match(PHASE1_CARD_COPY.offers.detailEn, /No email/);
});
