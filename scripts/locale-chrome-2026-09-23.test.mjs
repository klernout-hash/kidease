import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { copy, tx } from "../src/lib/copy.ts";
import { presentAuthCopy } from "../src/lib/auth/present-auth-copy.ts";
import { homeLiveStrip } from "../src/lib/home-live-strip.ts";
import {
  isShippedLocale,
  localeFromPreference,
  shippedLanguages,
} from "../src/lib/languages.ts";
import { defaultDistanceUnit } from "../src/lib/units.ts";
import { storedCentreName } from "../src/lib/utils.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("English is the default and only an explicit French choice sticks", () => {
  assert.equal(localeFromPreference(null), "en");
  assert.equal(localeFromPreference(undefined), "en");
  assert.equal(localeFromPreference(""), "en");
  assert.equal(localeFromPreference("zh"), "en");
  assert.equal(localeFromPreference("pa"), "en");
  assert.equal(localeFromPreference("en"), "en");
  assert.equal(localeFromPreference("fr"), "fr");
  assert.equal(isShippedLocale("fr"), true);
  assert.equal(isShippedLocale("es"), false);
  assert.deepEqual(
    shippedLanguages().map((lang) => lang.code),
    ["en", "fr"],
  );
  const boot = src("src/components/native-boot.tsx");
  const select = src("src/components/language-select.tsx");
  const useCopy = src("src/lib/use-copy.ts");
  assert.match(boot, /localeFromPreference/);
  assert.doesNotMatch(boot, /LANGUAGES\.some/);
  assert.match(select, /shippedLanguages\(\)/);
  assert.doesNotMatch(select, /LANGUAGES\.map/);
  assert.match(useCopy, /isShippedLocale/);
  assert.doesNotMatch(boot, /navigator\.language|geoip|province\s*===\s*["']QC/i);
  assert.doesNotMatch(src("src/lib/languages.ts"), /navigator\.language/);
});

test("French and English copy keys match, and partial packs are not the picker", () => {
  const en = Object.keys(copy.en);
  const fr = Object.keys(copy.fr);
  assert.deepEqual(
    en.filter((key) => !(key in copy.fr)),
    [],
  );
  assert.deepEqual(
    fr.filter((key) => !(key in copy.en)),
    [],
  );
  assert.equal(tx("en", "forgotPassword"), "Forgot password?");
  assert.equal(tx("fr", "forgotPassword"), "Mot de passe oublié ?");
  assert.match(tx("fr", "forgotPasswordLead"), /Si aucun des mots de passe/);
  assert.match(tx("fr", "forgotPasswordTitle"), /Mot de passe oublié/);
  assert.match(tx("fr", "forgotPasswordPageLead"), /lien de réinitialisation/);
  assert.match(tx("fr", "resetPasswordTitle"), /nouveau mot de passe/i);
  assert.equal(
    tx("fr", "plansNotOffered"),
    "Les forfaits ne sont pas offerts sur ce site pour le moment. La fiche et la réclamation restent gratuites.",
  );
  assert.doesNotMatch(tx("fr", "forgotPasswordSubmit"), /Email reset link/);
  assert.equal(tx("zh", "forgotPassword"), tx("en", "forgotPassword"));
});

test("login, forgot, and reset render chrome through copy after a language toggle", () => {
  const login = src("src/routes/login.tsx");
  const forgot = src("src/routes/forgot-password.tsx");
  const reset = src("src/routes/reset-password.tsx");
  const turnstile = src("src/components/turnstile-field.tsx");
  assert.match(login, /presentAuthCopy\(locale, error\)/);
  assert.match(login, /t\("loginRetry"\)/);
  assert.match(login, /t\("openingDesk"\)/);
  assert.doesNotMatch(login, /Forgot password\?/);
  assert.match(forgot, /t\("forgotPasswordTitle"\)/);
  assert.match(forgot, /t\("forgotPasswordPageLead"\)/);
  assert.match(forgot, /t\("forgotPasswordSubmit"\)/);
  assert.match(forgot, /presentAuthCopy/);
  assert.doesNotMatch(forgot, />Forgot password</);
  assert.match(reset, /t\("resetPasswordTitle"\)/);
  assert.match(reset, /t\("resetPasswordSave"\)/);
  assert.match(turnstile, /language: copyLocale/);
  assert.match(turnstile, /turnstileExpired/);
  assert.equal(
    presentAuthCopy("fr", "Wrong email or password. Try again, or reset it from Forgot password."),
    tx("fr", "authWrongEmailOrPassword"),
  );
  assert.equal(presentAuthCopy("en", "Sign-in failed"), "Sign-in failed");
  assert.match(presentAuthCopy("fr", "Too many tries. Try again in 2 min."), /2 min/);
  assert.match(presentAuthCopy("fr", "Wait 10s then resend"), /10/);
});

test("subscription panel stays one localized line and daycare names are not translated", () => {
  const panel = src("src/components/provider-subscription.tsx");
  assert.match(panel, /tx\("plansNotOffered"\)/);
  assert.doesNotMatch(panel, /listingStayFree/);
  assert.doesNotMatch(panel, /PLANS_NOT_OFFERED_YET/);
  assert.equal(storedCentreName("Garderie Les Petits Trésors", "Little Treasures Daycare"), "Garderie Les Petits Trésors");
  assert.equal(storedCentreName("", "CPE du Quartier"), "CPE du Quartier");
  assert.match(src("src/routes/provider.tsx"), /storedCentreName\(d\.name, d\.nameFr\)/);
  assert.doesNotMatch(src("src/routes/provider.tsx"), /locale === "fr" \? d\.nameFr : d\.name/);
});

test("km distances and 0-live home honesty from #270 stay intact", () => {
  assert.equal(defaultDistanceUnit("en-US"), "km");
  assert.equal(defaultDistanceUnit("fr-CA"), "km");
  const strip = homeLiveStrip(0, 8);
  assert.equal(strip.liveCount, 0);
  assert.equal(strip.zeroLiveHint, true);
  assert.match(src("src/lib/copy.ts"), /searchLiveEmptyCount: "0 live on KidEase · \{n\} licensed nearby"/);
  assert.match(src("src/routes/index.tsx"), /data-ke="home-zero-live"/);
});

test("staff invite join copy does not claim a resend path when mail did not send", () => {
  const en = tx("en", "employeeInviteSaved");
  const fr = tx("fr", "employeeInviteSaved");
  assert.match(en, /email did not send/i);
  assert.match(en, /cannot join/i);
  assert.doesNotMatch(en, /resent invite/i);
  assert.match(fr, /courriel n’est pas parti/);
  assert.match(fr, /ne peuvent pas joindre/);
  assert.match(src("src/routes/invite.$token.tsx"), /employeeInviteCreate/);
  assert.match(src("src/lib/desk-nav.ts"), /hintKey: "deskNavForYouHint"/);
});
