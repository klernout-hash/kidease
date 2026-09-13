import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  NOT_LIVE_UNTIL_VERIFIED_EN,
  NOT_LIVE_UNTIL_VERIFIED_FR,
  PROVIDER_ONBOARD_SUBJECT,
  VERIFY_EMAIL_SUBJECT,
  isVerifyNudgeWindow,
  providerOnboardHtml,
  providerOnboardText,
  providerScreeningHref,
  shouldSendProviderNextSteps,
  shouldSendVerifyEmail,
  shouldSendVerifyNudge,
  signupSendsNextSteps,
  signupUserMailIndependentOfAdmin,
  verifyEmailHtml,
  verifyEmailIncludesNotLiveLine,
  verifyEmailText,
} from "../src/lib/signup-user-mail.ts";
import { isPlatformLive } from "../src/lib/live.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("verify-your-email is independent of Admin notify success", () => {
  assert.equal(signupUserMailIndependentOfAdmin("failed"), true);
  assert.equal(signupUserMailIndependentOfAdmin("sent"), true);
  assert.equal(signupUserMailIndependentOfAdmin("logged"), true);
  assert.equal(shouldSendVerifyEmail({ email: "sam@family.ca", emailVerified: false }), true);
  assert.equal(shouldSendVerifyEmail({ email: "sam@family.ca", emailVerified: true }), false);
  assert.equal(shouldSendVerifyEmail({ email: "", emailVerified: false }), false);
  const family = src("src/lib/server/family.ts");
  assert.match(family, /afterNewAccountUserMail/);
  assert.match(family, /account notify failed/);
  assert.match(family, /signup user mail failed/);
  const ping = family.slice(family.indexOf("async function pingNewAccount"));
  const notifyIdx = ping.indexOf("notifyNewAccountFromUser");
  const userMailIdx = ping.indexOf("afterNewAccountUserMail");
  assert.ok(notifyIdx >= 0 && userMailIdx > notifyIdx, "user mail must run after Admin notify, not inside it");
  const auth = src("src/lib/auth/server.ts");
  assert.match(auth, /emailVerification:\s*emailVerificationConfig/);
  assert.match(auth, /sendOnSignUp/);
  assert.doesNotMatch(auth, /requireEmailVerification:\s*true/);
  const emailPw = src("src/lib/auth/email-password.ts");
  assert.match(emailPw, /sendOnSignUp:\s*true/);
  assert.match(emailPw, /sendVerificationEmail/);
  assert.doesNotMatch(emailPw, /requireEmailVerification:\s*true/);
});

test("verify email copy is a welcome/confirm with a real link, EN + FR-CA", () => {
  assert.equal(VERIFY_EMAIL_SUBJECT, "Verify your email — KidEase");
  const text = verifyEmailText("https://www.kidease.ca/api/auth/verify-email?token=test", "Joan", "provider");
  assert.match(text, /Hi Joan,/);
  assert.match(text, /Thanks for signing up with KidEase/);
  assert.match(text, /https:\/\/www\.kidease\.ca\/api\/auth\/verify-email\?token=test/);
  assert.match(text, /24 hours/);
  assert.match(text, /Bonjour Joan,/);
  assert.match(text, /Merci de vous inscrire à KidEase/);
  assert.doesNotMatch(text, /within 24 hours/);
  assert.doesNotMatch(text, /We got your request/);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /verifyEmailSubject: "Verify your email — KidEase"/);
  assert.match(copy, /verifyEmailSubject: "Confirmez votre courriel — KidEase"/);
});

test("daycare verify and next-steps say the listing is not live until verified", () => {
  assert.equal(
    NOT_LIVE_UNTIL_VERIFIED_EN,
    "Your daycare will not be listed live on KidEase for parents until it is verified.",
  );
  assert.equal(
    NOT_LIVE_UNTIL_VERIFIED_FR,
    "Votre service de garde ne sera pas affiché en direct sur KidEase pour les parents tant qu’il n’est pas vérifié.",
  );
  assert.equal(verifyEmailIncludesNotLiveLine("provider"), true);
  assert.equal(verifyEmailIncludesNotLiveLine(undefined), true);
  assert.equal(verifyEmailIncludesNotLiveLine("parent"), false);
  const verify = verifyEmailText("https://www.kidease.ca/api/auth/verify-email?token=test", "Joan", "provider");
  assert.match(verify, /Your daycare will not be listed live on KidEase for parents until it is verified/);
  assert.match(verify, /Votre service de garde ne sera pas affiché en direct sur KidEase pour les parents tant qu’il n’est pas vérifié/);
  assert.match(verifyEmailHtml("https://www.kidease.ca/x", "Joan", "provider"), /listed live on KidEase for parents/);
  const parentVerify = verifyEmailText("https://www.kidease.ca/api/auth/verify-email?token=test", "Sam", "parent");
  assert.doesNotMatch(parentVerify, /listed live on KidEase/);
  const next = providerOnboardText("https://www.kidease.ca", "Joan", "Little Fox Child Care");
  assert.match(next, /Your daycare will not be listed live on KidEase for parents until it is verified/);
  assert.match(next, /Votre service de garde ne sera pas affiché en direct sur KidEase pour les parents tant qu’il n’est pas vérifié/);
  assert.match(providerOnboardHtml("https://www.kidease.ca", "Joan"), /listed live on KidEase for parents/);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /listingNotLiveUntilVerified:/);
  assert.match(copy, /Your daycare will not be listed live on KidEase for parents until it is verified/);
  assert.match(copy, /Votre service de garde ne sera pas affiché en direct sur KidEase pour les parents tant qu’il n’est pas vérifié/);
  assert.equal(isPlatformLive("new-centre", false), false);
  assert.equal(isPlatformLive("new-centre", false, { claimStatus: "unclaimed" }), false);
  assert.equal(isPlatformLive("new-centre", false, { claimStatus: "pending" }), false);
  assert.match(src("src/lib/server/verify-mail.ts"), /lookupVerifyAudience/);
  assert.match(src("src/lib/server/verify-mail.ts"), /verifyEmailText\(input\.url, input\.name, audience\)/);
});

test("signup sends verify-email only — next-steps wait for emailVerified", () => {
  assert.equal(signupSendsNextSteps(), false);
  assert.equal(
    shouldSendProviderNextSteps({ role: "provider", email: "jane@example.com", emailVerified: false }),
    false,
    "unverified provider signup must not get next-steps",
  );
  assert.equal(
    shouldSendProviderNextSteps({ role: "provider", email: "jane@example.com", emailVerified: true }),
    true,
  );
  assert.equal(
    shouldSendProviderNextSteps({ role: "parent", email: "sam@family.ca", emailVerified: true }),
    false,
    "parents never get daycare next-steps",
  );
  const family = src("src/lib/server/family.ts");
  assert.doesNotMatch(family, /sendProviderNextStepsIfReady/);
  assert.doesNotMatch(family, /first-listing next-steps/);
  const server = src("src/lib/server/signup-user-mail.server.ts");
  assert.match(server, /signupSendsNextSteps/);
  assert.match(server, /emailVerified:\s*actor\.emailVerified/);
  const emailPw = src("src/lib/auth/email-password.ts");
  assert.match(emailPw, /afterEmailVerification/);
  assert.match(emailPw, /sendProviderNextStepsIfReady/);
});

test("verify-only nudge is one-time inside a 24–48h window", () => {
  const created = new Date("2026-09-11T18:00:00Z");
  assert.equal(isVerifyNudgeWindow(created, new Date("2026-09-12T17:00:00Z")), false);
  assert.equal(isVerifyNudgeWindow(created, new Date("2026-09-12T19:00:00Z")), true);
  assert.equal(isVerifyNudgeWindow(created, new Date("2026-09-13T19:00:00Z")), false);
  assert.equal(
    shouldSendVerifyNudge({
      email: "joan@example.com",
      emailVerified: false,
      createdAt: created,
      now: new Date("2026-09-12T19:00:00Z"),
    }),
    true,
  );
  assert.equal(
    shouldSendVerifyNudge({
      email: "joan@example.com",
      emailVerified: true,
      createdAt: created,
      now: new Date("2026-09-12T19:00:00Z"),
    }),
    false,
  );
  assert.equal(
    shouldSendVerifyNudge({
      email: "joan@example.com",
      emailVerified: false,
      createdAt: created,
      alreadyNudged: true,
      now: new Date("2026-09-12T19:00:00Z"),
    }),
    false,
  );
  const server = src("src/lib/server/signup-user-mail.server.ts");
  assert.match(server, /runVerifyEmailNudgeJob/);
  assert.match(server, /VERIFY_EMAIL_NUDGE_PURPOSE/);
  assert.match(src("src/routes/api/digest.ts"), /runVerifyEmailNudgeJob/);
  const dedupe = src("src/lib/server/actor-mail-dedupe.ts");
  assert.match(dedupe, /claimActorMailOnce/);
  assert.match(dedupe, /1970-01-01/);
});

test("provider next-steps copy is honest and bilingual, and can name an existing listing", () => {
  assert.equal(PROVIDER_ONBOARD_SUBJECT, "Next steps to get verified on KidEase");
  assert.equal(providerScreeningHref("https://www.kidease.ca"), "https://www.kidease.ca/provider?desk=screening");
  const text = providerOnboardText("https://www.kidease.ca", "Joan", "Little Fox Child Care");
  assert.match(text, /Hi Joan,/);
  assert.match(text, /Thanks for joining KidEase as a daycare provider/);
  assert.match(text, /We already have “Little Fox Child Care” on file/);
  assert.match(text, /Complete your listing — Little Fox Child Care —/);
  assert.match(text, /does not run police checks/);
  assert.match(text, /does not issue Vulnerable Sector Checks/);
  assert.match(text, /Child Abuse Registry/);
  assert.match(text, /Prior Contact/);
  assert.match(text, /Screening/);
  assert.match(text, /\/provider\?desk=listings/);
  assert.match(text, /\/provider\?desk=screening/);
  assert.match(text, /\/claim/);
  assert.match(text, /Admin reviews/);
  assert.match(text, /Screening on file/);
  assert.match(text, /Bonjour Joan,/);
  assert.match(text, /Nous avons déjà « Little Fox Child Care » au dossier/);
  assert.match(text, /ne fait pas de contrôles policiers/);
  assert.doesNotMatch(text, /Background checked by KidEase/i);
  assert.doesNotMatch(text, /police-checked by kidease/i);
  assert.doesNotMatch(text, /KidEase (ran|issued) a (police|Vulnerable)/i);
  const unnamed = providerOnboardText("https://www.kidease.ca", "Joan");
  assert.doesNotMatch(unnamed, /We already have/);
  assert.match(unnamed, /Complete your listing — name, address, hours, and open spots/);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /providerOnboardSubject: "Next steps to get verified on KidEase"/);
  assert.match(copy, /providerOnboardSubject: "Prochaines étapes pour être vérifié sur KidEase"/);
  assert.match(copy, /providerOnboardListingOnFile: "We already have/);
  assert.match(copy, /providerOnboardListingOnFile: "Nous avons déjà/);
});

test("signup user mail is site-owned transactional mail — no GHL", () => {
  const files = [
    "src/lib/signup-user-mail.ts",
    "src/lib/server/verify-mail.ts",
    "src/lib/server/provider-onboard-mail.ts",
    "src/lib/server/signup-user-mail.server.ts",
    "src/lib/server/actor-mail-dedupe.ts",
    "src/lib/auth/email-password.ts",
    "src/routes/api/digest.ts",
  ];
  for (const rel of files) {
    const body = src(rel);
    assert.doesNotMatch(body, /gohighlevel|ghl\.|leadconnector|GHL/i, rel);
  }
  const verify = src("src/lib/server/verify-mail.ts");
  const onboard = src("src/lib/server/provider-onboard-mail.ts");
  const mail = src("src/lib/transactional-mail.ts");
  assert.match(verify, /sendTransactionalMail/);
  assert.match(verify, /purpose:\s*"verify_email"/);
  assert.match(onboard, /sendTransactionalMail/);
  assert.match(onboard, /purpose:\s*"provider_onboard"/);
  assert.match(mail, /"verify_email"/);
  assert.match(mail, /"provider_onboard"/);
});
