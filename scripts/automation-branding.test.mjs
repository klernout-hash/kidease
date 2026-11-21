import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTOMATION_ORIGIN,
  DUNNING_STAGES,
  INVOICE_REMINDER_STAGES,
  MISSING_FIELDS,
  ONBOARD_STEPS,
  claimHref,
  claimListingLetter,
  invoiceLetter,
  missingInfoLetter,
  onboardingLetter,
  parentChildHref,
  parentProfileLetter,
  payHref,
  providerFixHref,
  reviewHref,
  reviewRequestLetter,
  staleSpotLetter,
  tourFollowupLetter,
} from "../src/lib/automations.ts";
import { CASL_SENDER } from "../src/lib/casl.ts";
import { BRAND_BLUE } from "../src/lib/email-layout.ts";
import { prepareMailBody } from "../src/lib/transactional-mail.ts";

function letters(locale) {
  const centreName = "Maple & Friends";
  return [
    [parentProfileLetter(locale), parentChildHref(locale)],
    [
      claimListingLetter({ locale, centreName, daycareId: "centre / 1" }),
      claimHref(locale, "centre / 1"),
    ],
    [staleSpotLetter({ locale, centreName }), providerFixHref(locale, "vacancy")],
    [
      tourFollowupLetter({ locale, centreName, slug: "maple / friends" }),
      reviewHref(locale, "maple / friends"),
    ],
    [
      reviewRequestLetter({ locale, centreName, slug: "maple / friends" }),
      reviewHref(locale, "maple / friends"),
    ],
    ...ONBOARD_STEPS.map((step) => [
      onboardingLetter({ locale, centreName, step }),
      providerFixHref(locale, step === "d7" ? "vacancy" : "hours"),
    ]),
    ...INVOICE_REMINDER_STAGES.map((stage) => [
      invoiceLetter({ locale, centreName, number: "INV-123", kind: "remind", stage }),
      payHref(locale),
    ]),
    ...DUNNING_STAGES.map((stage) => [
      invoiceLetter({ locale, centreName, number: "INV-123", kind: "dunning", stage }),
      payHref(locale),
    ]),
  ];
}

for (const locale of ["en", "fr"]) {
  test(`${locale} automation letters retain destinations, show branded buttons and put the reason in the footer`, async () => {
    for (const [letter, href] of letters(locale)) {
      assert.equal(letter.branded.locale, locale, letter.subject);
      assert.equal(letter.branded.cta.href, href, letter.subject);
      assert.match(letter.html, /class="ke-btn"/);
      assert.ok(letter.html.includes(`background:${BRAND_BLUE}`));
      assert.ok(letter.text.includes(href), letter.subject);
      assert.equal(
        letter.branded.unsubscribeUrl,
        `${AUTOMATION_ORIGIN}${CASL_SENDER.unsubscribePath}`,
      );
      const reason = letter.branded.reason;
      assert.ok(
        reason.startsWith(
          locale === "en" ? "You get this because" : "Vous recevez ce courriel parce que",
        ),
      );
      assert.equal(letter.text.split(reason).length - 1, 1, letter.subject);
      assert.equal(
        letter.html.split(reason.replaceAll("&", "&amp;")).length - 1,
        1,
        letter.subject,
      );
      assert.ok(letter.text.includes(CASL_SENDER.city));
      assert.ok(letter.text.includes(CASL_SENDER.email));
      assert.equal(letter.text.split(CASL_SENDER.city).length - 1, 1);
      for (const block of letter.branded.blocks) {
        if (block.kind === "p") {
          assert.ok(!block.text.includes("https://"), letter.subject);
          assert.ok(!block.text.includes(reason), letter.subject);
          assert.ok(!block.text.includes(CASL_SENDER.city), letter.subject);
        }
      }
      // The sender must preserve the structured action when branded mail is on,
      // and the fallback must keep the same action and localized footer.
      const input = { purpose: "customer_alert", to: "parent@example.ca", ...letter };
      const fallback = await prepareMailBody(input, { BRANDED_EMAILS: "0" });
      const branded = await prepareMailBody(input, { BRANDED_EMAILS: "1" });
      assert.equal(fallback.html, branded.html);
      assert.equal(fallback.text, branded.text);
    }
  });

  test(`${locale} missing-info email keeps every field-specific action as a blue button`, () => {
    const letter = missingInfoLetter({ locale, centreName: "Maple", missing: [...MISSING_FIELDS] });
    const actions = letter.branded.blocks.filter((block) => block.kind === "button");
    assert.equal(actions.length, MISSING_FIELDS.length);
    assert.equal((letter.html.match(/class="ke-btn"/g) || []).length, MISSING_FIELDS.length);
    assert.deepEqual(
      actions.map((action) => action.href),
      MISSING_FIELDS.map((field) => providerFixHref(locale, field)),
    );
    for (const action of actions)
      assert.ok(letter.text.includes(`${action.label}: ${action.href}`));
    assert.match(letter.text, locale === "fr" ? /Se désabonner/ : /Unsubscribe/);
  });
}

test("automation branding escapes centre names and keeps neutral review invitation and claim consent", () => {
  const centreName = '<img src=x onerror="alert(1)"> & Friends';
  const missing = missingInfoLetter({ locale: "en", centreName, missing: ["photos"] });
  assert.doesNotMatch(missing.html, /<img src=x/);
  assert.match(missing.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; Friends/);
  assert.ok(missing.text.includes(centreName));
  const review = reviewRequestLetter({ locale: "en", centreName: "Maple", slug: "maple" });
  assert.match(review.text, /It is optional/);
  assert.match(review.text, /Every enrolled parent gets the same invite/);
  const claim = claimListingLetter({ locale: "en", centreName: "Maple", daycareId: "one" });
  assert.match(claim.branded.reason, /published as the centre’s business contact/);
  assert.match(claim.branded.reason, /Implied consent for a business message \(CASL\)/);
});

test("the active post-tour QA letter has a localized button and preserves its offer disclaimer", async () => {
  const { tourNextStepLetter } = await import("../src/lib/tour-phase0.ts");
  for (const locale of ["en", "fr"]) {
    const letter = tourNextStepLetter({
      locale,
      centre: "Maple & Friends",
      applyPath: `/${locale === "fr" ? "fr/" : ""}daycare/maple`,
    });
    assert.equal(letter.branded.locale, locale);
    assert.equal(
      letter.branded.cta.href,
      `https://www.kidease.ca/${locale === "fr" ? "fr/" : ""}daycare/maple`,
    );
    assert.match(letter.html, /class="ke-btn"/);
    assert.match(
      letter.text,
      locale === "fr" ? /Ceci n’est pas une offre/ : /This is not an offer/,
    );
    assert.ok(letter.text.includes(letter.branded.cta.href));
    assert.equal(letter.text.split(letter.branded.reason).length - 1, 1);
    assert.equal(letter.text.split(CASL_SENDER.city).length - 1, 1);
  }
});
