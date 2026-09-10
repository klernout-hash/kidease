import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  KIDEASE_OPERATOR_EMAIL,
  bootstrapAdminEmail,
  canBootstrapAdmin,
  effectiveAdminRole,
  isKidEaseOperatorEmail,
} from "../src/lib/admin-email.ts";
import { canSeeAdminDesk, headerDesks, canVisitDesk } from "../src/lib/desks.ts";
import { localePath, localeSwitchPath } from "../src/lib/locale-path.ts";
import { publicFormErrorMessage } from "../src/lib/public-form-error.ts";
import { DEFAULT_TRANSACTIONAL_MAIL_FROM, transactionalMailFrom } from "../src/lib/mail-from.ts";
import { facebookLoginVisible } from "../src/lib/auth/facebook-idp.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("P0 Admin grant is kyle@kidease.ca only", () => {
  assert.equal(KIDEASE_OPERATOR_EMAIL, "kyle@kidease.ca");
  assert.equal(isKidEaseOperatorEmail("Kyle@KidEase.ca"), true);
  assert.equal(isKidEaseOperatorEmail("support@kidease.ca"), false);
  assert.equal(bootstrapAdminEmail("support@kidease.ca"), "kyle@kidease.ca");
  assert.equal(canBootstrapAdmin("support@kidease.ca", "support@kidease.ca"), false);
  assert.equal(canBootstrapAdmin("kyle@kidease.ca", "support@kidease.ca"), true);
  assert.equal(effectiveAdminRole({ storedRole: "admin", email: "ops@kidease.ca" }), null);
  assert.equal(effectiveAdminRole({ storedRole: "admin", email: "kyle@kidease.ca" }), "admin");
  const roles = src("src/lib/server/roles.ts");
  assert.match(roles, /isKidEaseOperatorEmail/);
  assert.match(roles, /KIDEASE_OPERATOR_EMAIL|kyle@kidease\.ca/);
  assert.doesNotMatch(roles, /isBlockedAdminEmail/);
});

test("P0 Admin chrome is hidden from guests and non-kyle sessions", () => {
  assert.equal(canSeeAdminDesk("admin", "kyle@kidease.ca"), true);
  assert.equal(canSeeAdminDesk("admin", "support@kidease.ca"), false);
  assert.equal(canSeeAdminDesk("parent", "kyle@kidease.ca"), false);
  assert.equal(canVisitDesk(["admin", "parent"], "admin", "admin", "ops@kidease.ca"), false);
  assert.deepEqual(headerDesks(["admin", "parent", "provider"], "admin", "support@kidease.ca"), [
    "parent",
    "provider",
  ]);
  const footer = src("src/components/site-footer.tsx");
  assert.match(footer, /isKidEaseOperatorEmail\(user\?\.primaryEmail\)/);
  assert.doesNotMatch(footer, /showOperatorSignIn = !isPending && !user/);
  assert.match(src("src/components/menu-desk-tools.tsx"), /session\?\.email/);
  assert.match(src("src/components/shell.tsx"), /session\?\.email/);
});

test("P0 catalogue counts match visible cards and dead hubs redirect", () => {
  const search = src("src/routes/search.tsx");
  assert.match(search, /const shownList = gated \? split\.primary : list/);
  assert.match(search, /allToggleCount"\)\.replace\("\{n\}", String\(resultCount\)\)/);
  assert.match(search, /items=\{shownList\}/);
  assert.doesNotMatch(search, /shownList\.length > 0 \? shownList : catalog/);
  assert.match(src("src/routes/listing.$slug.tsx"), /\/daycare\/\$slug/);
  assert.match(src("src/routes/daycares.tsx"), /to: "\/search"/);
  assert.match(src("src/routes/daycares_.$city.tsx"), /to: "\/search"/);
  const vercel = src("vercel.json");
  assert.match(vercel, /\/listing\/:slug/);
  assert.match(vercel, /\/daycare\/:slug/);
  assert.match(vercel, /\/daycares\/:city/);
});

test("P0 email sign-in drops a different session before Connexion", () => {
  const login = src("src/routes/login.tsx");
  assert.match(login, /if \(user\) \{\s*await dropExistingSession\(\);/);
  assert.match(src("src/lib/auth/client.ts"), /export async function dropExistingSession/);
  assert.match(src("src/lib/auth/client.ts"), /clearShortlistCache/);
  assert.match(src("src/components/parent-desk.tsx"), /data-ke="parent-identity"/);
  assert.match(src("src/components/parent-desk.tsx"), /user\?\.id/);
});

test("P0 mail UX stays honest when Resend fails", () => {
  assert.equal(
    publicFormErrorMessage(new Error("turnstile failed"), "fallback"),
    "Please complete the security check, then try again.",
  );
  assert.match(publicFormErrorMessage(new Error("Resend 403"), "Could not send."), /Could not send/);
  assert.match(src("src/routes/contact.tsx"), /data-ke="contact-thanks"/);
  assert.match(src("src/routes/contact.tsx"), /takeChallenge/);
  assert.match(src("src/routes/contact.tsx"), /contactSendFailed/);
  assert.match(src("src/routes/help.tsx"), /data-ke="help-thanks"/);
  assert.match(src("src/routes/forgot-password.tsx"), /Could not send a reset email/);
  assert.equal(DEFAULT_TRANSACTIONAL_MAIL_FROM, "KidEase <noreply@send.kidease.ca>");
  assert.equal(transactionalMailFrom("kyle@kidease.ca"), DEFAULT_TRANSACTIONAL_MAIL_FROM);
  assert.equal(transactionalMailFrom("KidEase <login@send.kidease.ca>"), DEFAULT_TRANSACTIONAL_MAIL_FROM);
  assert.match(src(".env.example"), /MAIL_FROM=KidEase <noreply@send\.kidease\.ca>/);
});

test("P0 Better Auth stays; Facebook login stays default-off", () => {
  assert.equal(facebookLoginVisible({ FACEBOOK_CLIENT_ID: "x", FACEBOOK_CLIENT_SECRET: "y" }), false);
  assert.equal(
    facebookLoginVisible({
      FACEBOOK_CLIENT_ID: "x",
      FACEBOOK_CLIENT_SECRET: "y",
      FEATURE_FACEBOOK_LOGIN: "1",
    }),
    true,
  );
  assert.match(src("src/routes/login.tsx"), /authClient\.signIn\.email/);
  assert.match(src(".env.example"), /FEATURE_FACEBOOK_LOGIN=0/);
});

test("P1 FR search stick, contact thank-you, cookie Essential role", () => {
  assert.equal(localePath("/search", "fr"), "/fr/search");
  assert.equal(localeSwitchPath("/search", "fr"), "/fr/search");
  assert.equal(localeSwitchPath("/fr/search", "en"), "/search");
  assert.match(src("src/components/language-select.tsx"), /window\.location\.assign\(dest\)/);
  assert.match(src("src/lib/copy.ts"), /contactSendFailed:/);
  const banner = src("src/components/cookie-consent-banner.tsx");
  assert.match(banner, /role="button"/);
  assert.match(banner, /cookieConsentEssential/);
});
