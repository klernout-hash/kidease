import test from "node:test";
import assert from "node:assert/strict";
import * as v2 from "../src/lib/legal-copy-v2.ts";
import { centreAgreementBody } from "../src/lib/docusign-packs.ts";
const all = Object.values(v2).flatMap((d) => (Array.isArray(d) ? d : d?.sections ? [d] : []));
test("no Sponsored/Featured placement copy in legal v2", () => {
  const s = JSON.stringify(all);
  assert.ok(!/Featured placement|marked Sponsored|mention Commandité sur/.test(s));
});
test("every new doc has EN+FR pair with matching section ids", () => {
  for (const k of ["PROVIDER_TERMS", "GOV_TERMS", "ACCESSIBILITY"]) assert.deepEqual(v2[k + "_EN"].sections.map((x) => x.id), v2[k + "_FR"].sections.map((x) => x.id));
  for (const k of ["TERMS_ADD", "PRIVACY_ADD", "COOKIES_ADD"]) assert.deepEqual(v2[k + "_EN"].map((x) => x.id), v2[k + "_FR"].map((x) => x.id));
});
test("gov terms carry non-endorsement; cookies list Stripe, Turnstile, Sentry", () => {
  assert.ok(v2.GOV_TERMS_EN.intro.includes(v2.NON_ENDORSEMENT_EN));
  assert.deepEqual(v2.COOKIES_ADD_EN.map((x) => x.id), ["stripe", "turnstile", "sentry"]);
});
test("Licensed Centre Agreement links Stripe Connect and Provider Terms, no numbered company", () => {
  const b = centreAgreementBody({ centreName: "Little Stars" });
  assert.ok(b.includes(v2.STRIPE_CONNECT_AGREEMENT_URL) && b.includes("/provider-terms") && b.includes("founding"));
  assert.ok(!/\b\d{7,}\s*(Canada|Manitoba|Ontario)\s*(Inc|Ltd)/i.test(b));
});
