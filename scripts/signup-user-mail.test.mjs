import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PROVIDER_ONBOARD_SUBJECT,
  VERIFY_EMAIL_SUBJECT,
  providerOnboardText,
  providerScreeningHref,
  sameWinnipegDay,
  shouldSendProviderNextSteps,
  shouldSendVerifyEmail,
  signupUserMailIndependentOfAdmin,
  verifyEmailText,
  winnipegDayKey,
} from "../src/lib/signup-user-mail.ts";

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
  const text = verifyEmailText("https://www.kidease.ca/api/auth/verify-email?token=test", "Joan");
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

test("provider next-steps fire on signup without waiting for mailbox verify", () => {
  assert.equal(
    shouldSendProviderNextSteps({ role: "provider", email: "jane@example.com", emailVerified: false }),
    true,
  );
  assert.equal(
    shouldSendProviderNextSteps({ role: "provider", email: "jane@example.com", emailVerified: true }),
    true,
  );
  assert.equal(
    shouldSendProviderNextSteps({ role: "parent", email: "sam@family.ca", emailVerified: true }),
    false,
  );
  const family = src("src/lib/server/family.ts");
  assert.match(family, /ownerCount === 0/);
  assert.match(family, /sendProviderNextStepsIfReady/);
  assert.match(family, /first-listing next-steps/);
});

test("same-day Winnipeg dedupe key is a calendar date", () => {
  const noon = new Date("2026-09-13T17:00:00Z");
  assert.equal(winnipegDayKey(noon), "2026-09-13");
  assert.equal(sameWinnipegDay(noon, new Date("2026-09-13T23:00:00Z")), true);
  assert.equal(sameWinnipegDay(noon, new Date("2026-09-14T12:00:00Z")), false);
  const dedupe = src("src/lib/server/actor-mail-dedupe.ts");
  assert.match(dedupe, /on conflict \(purpose, email, winnipeg_day\) do nothing/);
  assert.match(src("migrations/0048_actor_mail_sends.sql"), /actor_mail_sends/);
  const server = src("src/lib/server/signup-user-mail.server.ts");
  assert.match(server, /claimActorMailDay/);
  assert.match(server, /releaseActorMailDay/);
});

test("provider next-steps copy is honest and bilingual, and points at listing + Screening", () => {
  assert.equal(PROVIDER_ONBOARD_SUBJECT, "Next steps to get verified on KidEase");
  assert.equal(providerScreeningHref("https://www.kidease.ca"), "https://www.kidease.ca/provider?desk=screening");
  const text = providerOnboardText("https://www.kidease.ca", "Joan");
  assert.match(text, /Hi Joan,/);
  assert.match(text, /Thanks for joining KidEase as a daycare provider/);
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
  assert.match(text, /Merci de joindre KidEase comme fournisseur de garde/);
  assert.match(text, /ne fait pas de contrôles policiers/);
  assert.doesNotMatch(text, /Background checked by KidEase/i);
  assert.doesNotMatch(text, /police-checked by kidease/i);
  assert.doesNotMatch(text, /KidEase (ran|issued) a (police|Vulnerable)/i);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /providerOnboardSubject: "Next steps to get verified on KidEase"/);
  assert.match(copy, /providerOnboardSubject: "Prochaines étapes pour être vérifié sur KidEase"/);
});

test("signup user mail is site-owned transactional mail — no GHL", () => {
  const files = [
    "src/lib/signup-user-mail.ts",
    "src/lib/server/verify-mail.ts",
    "src/lib/server/provider-onboard-mail.ts",
    "src/lib/server/signup-user-mail.server.ts",
    "src/lib/server/actor-mail-dedupe.ts",
    "src/lib/auth/email-password.ts",
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
