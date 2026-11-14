import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { en } from "../src/lib/copy-en.ts";
import { fr } from "../src/lib/copy-fr.ts";
import { HELP_ARTICLES } from "../src/lib/help-centre.ts";

const paymentFailureKeys = [
  "payWalletsOff", "ledgerOffMoney", "ledgerOffParent", "ledgerOffParentBills",
  "ledgerOffBooking", "ledgerOffBill", "connectFeePreviewOff", "billInternalPay",
  "walletNotSetUp", "walletTestOnly", "trustPayLedger", "trustPayLedgerTip",
];
const publicStateKeys = [
  ...paymentFailureKeys, "heroTrustFounding", "statusMessagesDetail", "shareShortlistLead", "alertPrefsLead",
  "alertPushOff", "alertEmailStub", "alertSmsStub", "videoFeatureOff", "videoSdkOff",
  "videoNoCredentials", "voiceNoCredentials", "appStoresLead", "storeComingSoonLead",
  "storeComingSoon", "perkMobile", "forgotPasswordMailMissing", "authMailMissing",
  "parentPlusRehearsal", "planBillingPaused", "planCheckoutRehearsal", "billDraftRehearsal",
];

test("public states explain the next step without exposing internal setup or rehearsal language", () => {
  for (const pack of [en, fr]) {
    for (const key of publicStateKeys) {
      assert.match(pack[key], /\S/, key);
      assert.doesNotMatch(pack[key], /FEATURE_|[A-Z_]+_API_KEY|Stripe live keys|clés Stripe live|SDK|Twilio|internal ledger|grand livre interne|rehears|coming soon|bientôt|not live yet|pas encore en direct/i, key);
    }
  }
  assert.match(en.ledgerLiveBill, /Stripe Checkout/);
  assert.match(fr.ledgerLiveBill, /Stripe Checkout/);
  assert.doesNotMatch(`${en.ledgerLiveBill} ${fr.ledgerLiveBill}`, /Parent Plus|subscription|abonnement/i);
  assert.match(en.planBillingPaused, /subscriptions are unavailable/);
  assert.match(en.planBillingPaused, /centre bill payments remain available/);
});

test("all shipped locales keep usable public failure messages without implementation tokens", () => {
  for (const locale of ["ar", "de", "es", "it", "pa", "tl", "yue", "zh"]) {
    const pack = JSON.parse(readFileSync(new URL(`../src/lib/i18n/${locale}.json`, import.meta.url), "utf8"));
    for (const key of publicStateKeys) {
      assert.match(pack[key], /\S/, `${locale}:${key}`);
      assert.doesNotMatch(pack[key], /FEATURE_VIDEO|RESEND_API_KEY|SENDGRID_API_KEY|TITAN_APP_PASSWORD|Twilio|SDK|Stripe live keys/i, `${locale}:${key}`);
    }
    assert.doesNotMatch(pack.heroTrustFounding, /founding|fondatrice|fundador|fondatore|Gründungszeit|فترة التأسيس|ਸਥਾਪਨਾ ਮਿਆਦ|創始期|创始期/i, locale);
  }
});

test("help describes current free tools without a prelaunch period", () => {
  const articles = JSON.stringify(HELP_ARTICLES);
  assert.doesNotMatch(articles, /coming soon|bientôt|free founding period|période fondatrice|not live/i);
  assert.match(HELP_ARTICLES.find((article) => article.id === "parents-free").en.body, /Centre bills are separate/);
});

test("wallet readiness describes account availability without inventing a payment attempt", () => {
  assert.match(en.walletTestOnly, /unavailable for this account/);
  assert.match(fr.walletTestOnly, /indisponibles pour ce compte/);
  assert.doesNotMatch(`${en.walletTestOnly} ${fr.walletTestOnly}`, /could not be completed|failed|terminer ce paiement|échoué/i);
  const oldAttemptCopy = [
    /تعذّر إتمام/, /Zahlung konnte nicht abgeschlossen/, /No se pudo completar este pago/,
    /completare questo pagamento/, /ਭੁਗਤਾਨ ਪੂਰਾ ਨਹੀਂ ਹੋ ਸਕਿਆ/, /Hindi makumpleto/,
    /完成唔到呢次付款/, /无法完成此付款/,
  ];
  for (const locale of ["ar", "de", "es", "it", "pa", "tl", "yue", "zh"]) {
    const pack = JSON.parse(readFileSync(new URL(`../src/lib/i18n/${locale}.json`, import.meta.url), "utf8"));
    for (const phrase of oldAttemptCopy) assert.doesNotMatch(pack.walletTestOnly, phrase, locale);
  }
});
