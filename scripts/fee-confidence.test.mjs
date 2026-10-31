import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseOptionalMonthlyFee, resolveFeeConfidence } from "../src/lib/fee-confidence.ts";
import { listingFeeNotes } from "../src/lib/public-programs.ts";
import { copy } from "../src/lib/copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("backfilled bands are a provincial estimate and centre-entered fees are confirmed", () => {
  assert.equal(resolveFeeConfidence({ preschoolMonthly: 480 }), "estimate");
  assert.equal(resolveFeeConfidence({ preschoolMonthly: 480, live: true }), "centre");
  assert.equal(resolveFeeConfidence({ preschoolMonthly: 480, live: true, feeConfidence: "estimate" }), "estimate");
  assert.equal(resolveFeeConfidence({ preschoolMonthly: 218 }), null);
  assert.equal(resolveFeeConfidence({ preschoolMonthly: 218, feeConfidence: "centre" }), "centre");
  assert.equal(resolveFeeConfidence({}), null);

  const backfill = listingFeeNotes({ preschoolMonthly: 520, province: "ON", factSource: "https://www.ontario.ca/page/child-care-ontario" });
  assert.equal(backfill.confidence, "estimate");
  assert.equal(backfill.priceList, false);

  const typed = listingFeeNotes({ live: true, preschoolMonthly: 1025, feeConfidence: "centre" });
  assert.equal(typed.confidence, "centre");
  assert.equal(typed.priceList, true);

  assert.equal(copy.en.feeProvincialEstimate, "Provincial estimate");
  assert.equal(copy.fr.feeProvincialEstimate, "Estimation provinciale");
  assert.equal(copy.en.feeConfirmedByCentre, "Confirmed by centre");
  assert.equal(copy.fr.feeConfirmedByCentre, "Confirmé par le centre");
  assert.doesNotMatch(`${copy.en.feeProvincialEstimateLead} ${copy.fr.feeConfirmedByCentreLead}`, /—/);
});

test("claim and check-in accept a real monthly fee and ignore blanks", () => {
  assert.equal(parseOptionalMonthlyFee(""), null);
  assert.equal(parseOptionalMonthlyFee("0"), null);
  assert.equal(parseOptionalMonthlyFee("1025"), 1025);
  assert.equal(parseOptionalMonthlyFee("$1,200"), 1200);
  assert.equal(parseOptionalMonthlyFee("9000"), null);
  assert.match(src("src/routes/claim.tsx"), /claimFeeLead/);
  assert.match(src("src/routes/spots.\$token.tsx"), /feesLead/);
  assert.match(src("src/lib/server/claims.ts"), /saveCentreMonthlyFees/);
  assert.match(src("src/lib/server/open-spots-checkin.ts"), /saveCentreMonthlyFees/);
  assert.match(src("src/lib/server/fee-confidence.ts"), /fee_confidence = 'centre'/);
  assert.match(src("migrations/0108_fee_confidence.sql"), /add column if not exists fee_confidence/);
  assert.match(src("src/routes/daycare.\$slug.tsx"), /feeProvincialEstimate/);
});
