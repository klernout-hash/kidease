import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { canSeeAdminDesk } from "../src/lib/desks.ts";
import { facebookLoginLive } from "../src/lib/auth/facebook-idp.ts";
import { localeSwitchPath } from "../src/lib/locale-path.ts";
import { KIDEASE_OPERATOR_EMAIL } from "../src/lib/admin-email.ts";
import { publicFormErrorMessage } from "../src/lib/public-form-error.ts";
import { clientIpFromHeaders } from "../src/lib/server/turnstile-verify.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("P0 public notify: help/contact take a one-shot Turnstile token and show on-page success", () => {
  const help = src("src/routes/help.tsx");
  const contact = src("src/routes/contact.tsx");
  const forgot = src("src/routes/forgot-password.tsx");
  assert.match(help, /takeChallenge/);
  assert.match(help, /t\("supportSent"\)/);
  assert.match(help, /publicFormErrorMessage/);
  assert.doesNotMatch(help, /Could not send\. Email \$\{SUPPORT_INBOX_EMAIL\} directly\./);
  assert.match(contact, /takeChallenge/);
  assert.match(contact, /t\("contactSent"\)/);
  assert.match(contact, /role="status"/);
  assert.match(contact, /publicFormErrorMessage/);
  assert.doesNotMatch(contact, /Could not send\. Email \$\{SUPPORT_INBOX_EMAIL\} directly\./);
  assert.match(forgot, /if \(res\.error\) throw/);
  assert.match(forgot, /friendlyResetMailError/);
  assert.equal(
    publicFormErrorMessage(new Error("Security check failed. Refresh and try again."), "support@kidease.ca"),
    "Security check failed. Refresh and try again.",
  );
});

test("P0 Turnstile: do not send Vercel XFF as remoteip; timeout-or-duplicate is accepted", () => {
  const verify = src("src/lib/server/turnstile-verify.ts");
  assert.match(verify, /Skip Vercel \/ proxy hops/);
  assert.match(verify, /timeout-or-duplicate/);
  assert.equal(clientIpFromHeaders(new Headers({ "x-forwarded-for": "198.51.100.2" })), undefined);
  assert.equal(clientIpFromHeaders(new Headers({ "cf-connecting-ip": "203.0.113.9" })), "203.0.113.9");
});

test("P0 login UX: email Connexion is the primary path; social is secondary", () => {
  const login = src("src/routes/login.tsx");
  const emailAt = login.indexOf('data-ke={operator ? "admin-email-first" : "email-sign-in"}');
  const socialAt = login.indexOf('data-ke="social-sign-in"');
  assert.ok(emailAt > 0 && socialAt > emailAt, "email form must render above social CTAs");
  assert.match(login, /t\("signIn"\)/);
  assert.match(login, /orContinueWith/);
});

test("P0 catalogue honesty: Winnipeg count matches visible cards", () => {
  const search = src("src/routes/search.tsx");
  assert.match(search, /const visibleList = gated \? shownList : list/);
  assert.match(search, /visibleList\.map/);
  assert.match(search, /items=\{visibleList\}/);
  assert.match(search, /allToggleCount"\)\.replace\("\{n\}", String\(resultCount\)\)/);
  assert.doesNotMatch(search, /allToggleCount"\)\.replace\("\{n\}", String\(catalog\.length\)\)/);
});

test("P0 king-admin privacy: only kyle@kidease.ca sees Admin / operator chrome", () => {
  assert.equal(KIDEASE_OPERATOR_EMAIL, "kyle@kidease.ca");
  assert.equal(canSeeAdminDesk("admin"), true);
  assert.equal(canSeeAdminDesk("admin", "kyle@kidease.ca"), true);
  assert.equal(canSeeAdminDesk("admin", "parent@example.com"), false);
  const footer = src("src/components/site-footer.tsx");
  const shell = src("src/components/shell.tsx");
  const nav = src("src/components/nav-drawer.tsx");
  assert.match(footer, /isKidEaseOperatorEmail\(user\?\.primaryEmail\)/);
  assert.doesNotMatch(footer, /!isPending && !user/);
  assert.match(shell, /canSeeAdminDesk\(session\?\.role, user\?\.primaryEmail\)/);
  assert.match(nav, /t\("deskAdmin"\)/);
  assert.match(nav, /t\("signOut"\)/);
});

test("P1 Facebook CTA stays hidden until FACEBOOK_LOGIN_LIVE", () => {
  assert.equal(facebookLoginLive(), false);
  assert.equal(facebookLoginLive("1"), true);
  assert.match(src(".env.example"), /FACEBOOK_LOGIN_LIVE/);
});

test("P1 city hubs and listing aliases redirect to working routes", () => {
  const vercel = src("vercel.json");
  assert.match(vercel, /"source": "\/daycares"/);
  assert.match(vercel, /"destination": "\/search"/);
  assert.match(vercel, /"source": "\/daycares\/:city"/);
  assert.match(vercel, /"destination": "\/daycare\/city\/:city"/);
  assert.match(vercel, /"source": "\/listing\/:slug"/);
  assert.match(vercel, /"destination": "\/daycare\/:slug"/);
  assert.match(src("src/routes/daycares.tsx"), /throw redirect\(\{ to: "\/search" \}\)/);
  assert.match(src("src/routes/daycares.$city.tsx"), /\/daycare\/city\/\$city/);
  assert.match(src("src/routes/listing.$slug.tsx"), /\/daycare\/\$slug/);
});

test("P1 FR locale sticks on search and English leaves /fr", () => {
  assert.equal(localeSwitchPath("/search", "fr"), "/fr/search");
  assert.equal(localeSwitchPath("/fr/search", "en"), "/search");
  assert.match(src("src/components/language-select.tsx"), /window\.location\.assign\(dest\)/);
});
