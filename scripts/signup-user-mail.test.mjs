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
  shouldSendProviderNextSteps,
  shouldSendVerifyEmail,
  signupUserMailIndependentOfAdmin,
  verifyEmailText,
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

test("verify email copy is a mailbox check, not a thanks-for-signing-up stack", () => {
  assert.equal(VERIFY_EMAIL_SUBJECT, "Verify your email — KidEase");
  const text = verifyEmailText("https://www.kidease.ca/api/auth/verify-email?token=test");
  assert.match(text, /Verify your KidEase email/);
  assert.match(text, /https:\/\/www\.kidease\.ca\/api\/auth\/verify-email\?token=test/);
  assert.match(text, /24 hours/);
  assert.doesNotMatch(text, /within 24 hours/);
  assert.doesNotMatch(text, /We got your request/);
});

test("provider next-steps wait until the mailbox is verified", () => {
  assert.equal(
    shouldSendProviderNextSteps({ role: "provider", email: "jane@example.com", emailVerified: true }),
    true,
  );
  assert.equal(
    shouldSendProviderNextSteps({ role: "provider", email: "jane@example.com", emailVerified: false }),
    false,
  );
  assert.equal(
    shouldSendProviderNextSteps({ role: "parent", email: "sam@family.ca", emailVerified: true }),
    false,
  );
});

test("provider next-steps copy is honest about police checks and points at Screening", () => {
  assert.equal(PROVIDER_ONBOARD_SUBJECT, "Next steps to get verified on KidEase");
  assert.equal(providerScreeningHref("https://www.kidease.ca"), "https://www.kidease.ca/provider?desk=screening");
  const text = providerOnboardText("https://www.kidease.ca");
  assert.match(text, /does not run police checks/);
  assert.match(text, /does not issue Vulnerable Sector Checks/);
  assert.match(text, /Child Abuse Registry/);
  assert.match(text, /Prior Contact/);
  assert.match(text, /Screening/);
  assert.match(text, /\/provider\?desk=screening/);
  assert.match(text, /\/claim/);
  assert.match(text, /Admin reviews/);
  assert.match(text, /Screening on file/);
  assert.doesNotMatch(text, /Background checked by KidEase/i);
  assert.doesNotMatch(text, /police-checked by kidease/i);
  assert.doesNotMatch(text, /KidEase (ran|issued) a (police|Vulnerable)/i);
});

test("signup user mail uses transactional fallback, not Admin-only deliverEmail", () => {
  const verify = src("src/lib/server/verify-mail.ts");
  const onboard = src("src/lib/server/provider-onboard-mail.ts");
  const mail = src("src/lib/transactional-mail.ts");
  assert.match(verify, /sendTransactionalMail/);
  assert.match(verify, /purpose:\s*"verify_email"/);
  assert.match(onboard, /sendTransactionalMail/);
  assert.match(onboard, /purpose:\s*"provider_onboard"/);
  assert.match(mail, /"verify_email"/);
  assert.match(mail, /"provider_onboard"/);
  const notify = src("src/lib/server/notify.ts");
  assert.match(notify, /afterEnrollmentAdminNotify/);
});
