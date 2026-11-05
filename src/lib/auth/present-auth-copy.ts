import { tx, type CopyKey } from "../copy-runtime.ts";
import {
  PASSWORD_BREACHED_MESSAGE,
  PASSWORD_COMMON_MESSAGE,
  PASSWORD_POLICY_HINT,
  PASSWORD_TOO_SHORT,
} from "../password-hygiene.ts";
import {
  CLOUDFLARE_AUTH_BLOCK_MESSAGE,
  TURNSTILE_EXPIRED_MESSAGE,
  TURNSTILE_FAILED_MESSAGE,
  TURNSTILE_REQUIRED_MESSAGE,
  WRONG_EMAIL_OR_PASSWORD_MESSAGE,
  WRONG_PASSWORD_MESSAGE,
} from "./login-errors.ts";
import {
  ADMIN_SESSION_TIMEOUT_MESSAGE,
  LOGIN_OPEN_FAILED_MESSAGE,
  LOGIN_TAKING_TOO_LONG_MESSAGE,
  PASSWORD_CONTINUE_MESSAGE,
} from "./login-stall.ts";

const EXACT: Array<[string, CopyKey]> = [
  [CLOUDFLARE_AUTH_BLOCK_MESSAGE, "authCloudflareBlock"],
  [WRONG_EMAIL_OR_PASSWORD_MESSAGE, "authWrongEmailOrPassword"],
  [WRONG_PASSWORD_MESSAGE, "authWrongPassword"],
  [TURNSTILE_REQUIRED_MESSAGE, "turnstileRequired"],
  [TURNSTILE_EXPIRED_MESSAGE, "turnstileExpired"],
  [TURNSTILE_FAILED_MESSAGE, "turnstileFailed"],
  [LOGIN_TAKING_TOO_LONG_MESSAGE, "authTakingTooLong"],
  [LOGIN_OPEN_FAILED_MESSAGE, "authOpenFailed"],
  [ADMIN_SESSION_TIMEOUT_MESSAGE, "authAdminTimeout"],
  [PASSWORD_CONTINUE_MESSAGE, "authEnterPassword"],
  [PASSWORD_TOO_SHORT, "passwordTooShort"],
  [PASSWORD_COMMON_MESSAGE, "passwordCommon"],
  [PASSWORD_BREACHED_MESSAGE, "passwordBreached"],
  [PASSWORD_POLICY_HINT, "passwordPolicyHint"],
  ["No KidEase account uses that email. Create one with email, or try Apple or Facebook.", "authMissingAccount"],
  ["Could not start social sign-in. Use email, or try again.", "authSocialFailedGeneric"],
  ["Too many tries. Try again in 1 min.", "authTooManyMinOne"],
  ["This sign-in page needs a refresh: try again, or use email.", "authRefresh"],
  ["Signed in, but the session could not be saved. Refresh and try again.", "authSessionSave"],
  ["An account with that email already exists. Sign in instead.", "authExists"],
  ["That sign-in method did not share an email. Use the email form on this page.", "authEmailMissing"],
  ["Pop-up blocked: allow pop-ups for KidEase, then try again.", "authPopup"],
  ["That sign-in method is not configured on this host. Use email.", "authProviderMissing"],
  ["Email is not configured (missing RESEND_API_KEY or SENDGRID_API_KEY).", "authMailMissing"],
  ["Sign-in failed", "signInFailed"],
  ["Operator sign-in is only for the KidEase owner account.", "operatorOnly"],
  ["Those passwords do not match.", "resetPasswordMismatch"],
  ["This reset link is missing or expired. Request a new one from the sign-in page.", "resetPasswordMissing"],
  ["Could not reset the password.", "resetPasswordFailed"],
  ["Could not send a reset email.", "forgotPasswordSendFailed"],
  ["Enter the email on the account first.", "forgotPasswordEmailInvalid"],
  [
    "If that email is registered with KidEase, we sent a reset link. Check the inbox and junk folder.",
    "forgotPasswordSent",
  ],
  ["Security check could not load. Refresh the page.", "turnstileLoadFailed"],
  ["Confirm it's you to continue.", "reauthRequired"],
  ["Could not confirm.", "reauthConfirmFailed"],
  ["A code is on its way. Use the latest email.", "reauthCodeSent"],
  ["Please wait a moment, then try again.", "reauthWaitMoment"],
  ["Could not send a code.", "reauthSendFailed"],
  [
    "Add and confirm an email before you message a centre or book a tour.",
    "facebookEmailRequired",
  ],
  [
    "Continue with Facebook is not available on this address. Open kidease.ca.",
    "facebookHostUnavailable",
  ],
  [
    "We could not email a sign-in code. Nothing was sent. Try Send a new code, or email support@kidease.ca.",
    "verify2faLeadFail",
  ],
  ["Check your email", "verify2faTitle"],
  ["Verification code", "verify2faCodeLabel"],
  ["Remember this device for 30 days", "verify2faRemember"],
  [
    "Skip the email code on this browser for 30 days. Do not use this on a shared computer.",
    "verify2faRememberHint",
  ],
  ["Verify and continue", "verify2faSubmit"],
  ["Opening your desk…", "verify2faSubmitting"],
  ["Send a new code", "verify2faResend"],
  ["A new code is on its way. Use the latest email.", "verify2faResent"],
  ["Please wait a moment, then try Send a new code again.", "verify2faWaitRetry"],
  ["Could not send a code. Use Send a new code, or go back to sign in.", "verify2faSendFailed"],
  ["Could not send a code. Email support@kidease.ca.", "verify2faSendFailedMail"],
  ["Still sending your code. Try again in a moment.", "verify2faStillSending"],
  ["Enter the 6-digit code from your email.", "verify2faNeedCode"],
  ["Complete the security check, then tap Verify.", "verify2faNeedTurnstile"],
  ["Could not verify", "verify2faCouldNot"],
  ["Still opening your desk. You can send a new code, or continue below.", "verify2faStall"],
  ["Continue to your desk", "verify2faContinue"],
  ["Email support@kidease.ca", "verify2faSupport"],
  ["Back to sign in", "backToSignIn"],
];

/**
 * Keep stored errors in English (funnel matching) and translate at render.
 * Unknown strings stay as returned so we do not invent a translation.
 */
export function presentAuthCopy(locale: string, message: string | null | undefined): string {
  const text = (message || "").trim();
  if (!text || locale !== "fr") return text;
  for (const [en, key] of EXACT) {
    if (text === en) return tx("fr", key);
  }
  const min = text.match(/^Too many tries\. Try again in (\d+) min\.$/);
  if (min) {
    return min[1] === "1" ? tx("fr", "authTooManyMinOne") : tx("fr", "authTooManyMin").replace("{n}", min[1]);
  }
  const sec = text.match(/^Too many tries\. Try again in (\d+)s\.$/);
  if (sec) return tx("fr", "authTooManySec").replace("{n}", sec[1]);
  const oauth = text.match(
    /^This email is registered with Apple, Facebook, or Google( \([^)]+\))?\. Set a password from Forgot password, or use a button on this page\.$/,
  );
  if (oauth) return tx("fr", "authOauthOnly").replace("{via}", oauth[1] || "");
  const social = text.match(/^Could not start (.+) sign-in\. Use email, or try again\.$/);
  if (social) return tx("fr", "authSocialFailed").replace("{provider}", social[1]);
  const resend = text.match(/^Wait (\d+)s then resend$/);
  if (resend) return tx("fr", "reauthWait").replace("{n}", resend[1]);
  const againSec = text.match(/^Try again in (\d+)s\.$/);
  if (againSec) return tx("fr", "reauthTrySec").replace("{n}", againSec[1]);
  if (text === "Try again in 1 min.") return tx("fr", "reauthTryMinOne");
  const againMin = text.match(/^Try again in (\d+) min\.$/);
  if (againMin) return tx("fr", "reauthTryMin").replace("{n}", againMin[1]);
  const sent = text.match(/^We sent a 6-digit code(?: to (.+))?\. Enter it to finish signing in\.$/);
  if (sent) return tx("fr", "verify2faLeadSent").replace("{to}", sent[1] ? ` à ${sent[1]}` : "");
  return text;
}
