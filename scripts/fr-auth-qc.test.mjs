import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { frAuthQcEnabled } from "../src/lib/features.ts";
import {
  OTP_SUBJECT_EN,
  OTP_SUBJECT_FR,
  RESET_SUBJECT_EN,
  RESET_SUBJECT_FR,
  authMailFrench,
  preferFrenchResetUrl,
} from "../src/lib/fr-auth-qc.ts";
import { localePath, localeSwitchPath } from "../src/lib/locale-path.ts";
import { localeRedirectTarget } from "../src/lib/locale-geo.ts";
import { presentAuthCopy } from "../src/lib/auth/present-auth-copy.ts";
import "../src/lib/copy.ts";
import { VERIFY_EMAIL_SUBJECT, VERIFY_EMAIL_SUBJECT_FR, verifyEmailText } from "../src/lib/signup-user-mail.ts";

const document = { method: "GET", accept: "text/html", secFetchDest: "document" };

test("FEATURE_FR_AUTH_QC defaults off", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_FR_AUTH_QC, false);
  assert.equal(frAuthQcEnabled({}), false);
  assert.equal(frAuthQcEnabled({ FEATURE_FR_AUTH_QC: "1" }), true);
  assert.equal(frAuthQcEnabled({ FEATURE_FR_AUTH_QC: "0" }), false);
});

test("auth mail stays English until the flag is on", () => {
  assert.equal(authMailFrench({ flagOn: false, locale: "fr", province: "QC", country: "CA" }), false);
  assert.equal(authMailFrench({ flagOn: true, locale: "en", province: "ON", country: "CA" }), false);
  assert.equal(authMailFrench({ flagOn: true, locale: "fr" }), true);
  assert.equal(authMailFrench({ flagOn: true, province: "QC", country: "CA", locale: "en" }), true);
  assert.equal(authMailFrench({ flagOn: true, province: "QC", country: "US" }), false);
  assert.equal(authMailFrench({ flagOn: true, province: "CA-QC", country: "CA" }), true);
  assert.equal(authMailFrench({ flagOn: true, acceptLanguage: "fr-CA,fr;q=0.9" }), true);
  assert.equal(authMailFrench({ flagOn: true, acceptLanguage: "en-CA,fr;q=0.8" }), false);
  assert.equal(RESET_SUBJECT_EN, "Reset your KidEase password");
  assert.equal(OTP_SUBJECT_EN, "Your KidEase sign-in code");
  assert.equal(VERIFY_EMAIL_SUBJECT, "Verify your email: KidEase");
  assert.equal(RESET_SUBJECT_FR, "Réinitialisez votre mot de passe KidEase");
  assert.equal(OTP_SUBJECT_FR, "Votre code de connexion KidEase");
  assert.equal(VERIFY_EMAIL_SUBJECT_FR, "Confirmez votre courriel: KidEase");
});

test("French reset links and paired auth URLs", () => {
  assert.equal(preferFrenchResetUrl("https://www.kidease.ca/reset-password?token=abc", false), "https://www.kidease.ca/reset-password?token=abc");
  assert.equal(preferFrenchResetUrl("https://www.kidease.ca/reset-password?token=abc", true), "https://www.kidease.ca/fr/reset-password?token=abc");
  assert.equal(preferFrenchResetUrl("/reset-password?token=abc", true), "/fr/reset-password?token=abc");
  assert.equal(localePath("/forgot-password", "fr"), "/fr/forgot-password");
  assert.equal(localePath("/forgot-password", "en"), "/forgot-password");
  assert.equal(localeSwitchPath("/forgot-password", "fr"), "/fr/forgot-password");
  assert.equal(localeSwitchPath("/fr/verify-2fa", "en"), "/verify-2fa");
  assert.equal(
    localeRedirectTarget({ ...document, pathname: "/forgot-password", country: "CA", region: "QC" }),
    null,
  );
  assert.equal(
    localeRedirectTarget({ ...document, pathname: "/forgot-password", country: "CA", region: "QC", frAuthQc: true }),
    "/fr/forgot-password",
  );
  assert.equal(
    localeRedirectTarget({
      ...document,
      pathname: "/verify-2fa",
      acceptLanguage: "fr-CA,fr;q=0.9",
      frAuthQc: true,
      preferredLocale: "fr",
    }),
    "/fr/verify-2fa",
  );
  assert.equal(
    localeRedirectTarget({ ...document, pathname: "/forgot-password", country: "CA", region: "QC", cookie: "en", frAuthQc: true }),
    null,
  );
});

test("verify-2fa French copy and verify mail order", () => {
  assert.equal(presentAuthCopy("en", "Remember this device for 30 days"), "Remember this device for 30 days");
  assert.match(presentAuthCopy("fr", "Remember this device for 30 days"), /30 jours/);
  assert.match(presentAuthCopy("fr", "Wait 10s then resend"), /10/);
  assert.match(presentAuthCopy("fr", "We sent a 6-digit code to a•••@x.com. Enter it to finish signing in."), /a•••@x.com/);
  const en = verifyEmailText("https://www.kidease.ca/verify");
  const fr = verifyEmailText("https://www.kidease.ca/verify", null, null, true);
  assert.equal(en.startsWith("Hi,"), true);
  assert.equal(fr.startsWith("Bonjour,"), true);
  assert.match(en, /Verify your email|Thanks for signing up/);
  const reset = readFileSync(new URL("../src/lib/server/reset-mail.ts", import.meta.url), "utf8");
  assert.match(reset, /RESET_SUBJECT_EN/);
  assert.match(reset, /frenchAuthMailForEmail/);
});
