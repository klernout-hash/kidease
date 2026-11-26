import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { frenchGovPath, localizeAuthDest, verify2faPagePath } from "../src/lib/locale-path.ts";
import { twoFactorPageUrl } from "../src/lib/desks.ts";
import { loginSubmittedText } from "../src/lib/login-fields.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

// ---- Locale survives sign-in → 2FA → desk (gov FR bug, all roles) ----
test("frenchGovPath maps gov desk pages that have a French twin", () => {
  assert.equal(frenchGovPath("/gov"), "/fr/gov");
  assert.equal(frenchGovPath("/gov/map"), "/fr/gov/map");
  assert.equal(frenchGovPath("/gov/reports?tab=complaints"), "/fr/gov/reports?tab=complaints");
  assert.equal(frenchGovPath("/fr/gov"), "/fr/gov");
  assert.equal(frenchGovPath("/gov/change-requests"), "/gov/change-requests"); // no FR page
  assert.equal(frenchGovPath("/gov-terms"), "/gov-terms");
});

test("2FA page follows the sign-in language", () => {
  assert.equal(verify2faPagePath("fr", "/gov"), "/fr/verify-2fa");
  assert.equal(verify2faPagePath("en", "/fr/parent"), "/fr/verify-2fa");
  assert.equal(verify2faPagePath("en", "/gov"), "/verify-2fa");
  assert.match(twoFactorPageUrl("/gov", "fr"), /^\/fr\/verify-2fa\?next=%2Fgov$/);
  assert.match(twoFactorPageUrl("/fr/gov"), /^\/fr\/verify-2fa\?next=%2Ffr%2Fgov$/);
  assert.match(twoFactorPageUrl("/parent"), /^\/verify-2fa\?next=%2Fparent$/);
});

test("a French 2FA screen lands on the French desk for every role", () => {
  assert.equal(localizeAuthDest("/gov", "fr"), "/fr/gov");
  assert.equal(localizeAuthDest("/parent", "fr"), "/fr/parent");
  assert.equal(localizeAuthDest("/provider", "fr"), "/fr/provider");
  assert.equal(localizeAuthDest("/support", "fr"), "/fr/support");
  assert.equal(localizeAuthDest("/admin", "fr"), "/admin"); // no French admin desk
  assert.equal(localizeAuthDest("/gov", "en"), "/gov");
  assert.equal(localizeAuthDest("/fr/gov", "fr"), "/fr/gov");
});

test("government French sign-in resolves /fr/gov, not /gov", async () => {
  const { destinationAfterSignIn } = await import("../src/lib/role-access.ts");
  assert.equal(destinationAfterSignIn({ role: "government", locale: "fr" }), "/fr/gov");
  assert.equal(destinationAfterSignIn({ role: "government", next: "/gov", locale: "fr" }), "/fr/gov");
  assert.equal(destinationAfterSignIn({ role: "government", next: "/gov", locale: "en" }), "/gov");
});

test("wiring: login funnel, gate and verify-2fa pass the locale", () => {
  assert.match(src("src/lib/auth/login-funnel.ts"), /twoFactorPageUrl\(dest, input\.locale\)/);
  assert.match(src("src/lib/auth/gates.tsx"), /isFrPath\(safeNext\) \? "\/fr\/verify-2fa" : "\/verify-2fa"/);
  const verify = src("src/routes/verify-2fa.tsx");
  assert.match(verify, /localizeAuthDest\(/);
  assert.doesNotMatch(verify, /leave\(dest\)/);
});

// ---- Login submit: autofill, reviewer, missing Turnstile token ----
test("autofilled fields with no input events still submit: values come from the form", () => {
  const form = new Map([["email", " parent@example.ca "], ["password", "pw-from-autofill"]]);
  // React refs never saw an input event, so the fallbacks are empty.
  assert.equal(loginSubmittedText(form, "email", "", true), "parent@example.ca");
  assert.equal(loginSubmittedText(form, "password", "", false), "pw-from-autofill");
  const login = src("src/routes/login.tsx");
  assert.match(login, /loginSubmittedText\(form, "email"/);
  assert.match(login, /data-ke="email-primary"\s+disabled=\{busy\}/, "submit is enabled whenever not busy");
});

test("a store reviewer email enables submit with no Turnstile widget", () => {
  const login = src("src/routes/login.tsx");
  assert.match(login, /const reviewerBypass = mode === "in" && \(reviewerSignIn \|\| reviewerSignInSkipsTurnstile\(email\)\)/);
  assert.match(login, /mode === "in" && reviewerSignIn \? null : \(\s*<TurnstileField/);
  // The unmounted widget releases its "required" flag so nothing waits on it.
  assert.match(src("src/components/turnstile-field.tsx"), /useEffect\(\(\) => \(\) => onRequiredRef\.current\?\.\(false\), \[\]\)/);
});

test("a missing token shows the security-check message and remints the widget", () => {
  const login = src("src/routes/login.tsx");
  assert.match(login, /const challenge = takeChallenge\(\);/); // falls back to hidden cf-turnstile-response
  assert.match(login, /throw new Error\(TURNSTILE_REQUIRED_MESSAGE\)/);
  assert.match(login, /setError\(message\);\s+resetTurnstile\(\);/);
});

test("Turnstile widget: retry link after ~8s and one auto-reset after an error", () => {
  const field = src("src/components/turnstile-field.tsx");
  assert.match(field, /setShowRetry\(true\), 8000/);
  assert.match(field, /"Réessayer la vérification" : "Retry check"/);
  assert.match(field, /autoResetDone\.current = true;[\s\S]{0,200}2000/);
});

// ---- Gov desk ----
test("gov map cannot spin forever: watchdog, stable points, retry", () => {
  const map = src("src/components/gov/gov-map.tsx");
  assert.match(map, /20000/);
  assert.match(map, /pointsKey/);
  assert.match(map, /setAttempt\(\(n\) => n \+ 1\)/);
});

test("gov pending tiles explain the missing source instead of 'Not tracked yet'", () => {
  const dash = src("src/components/gov/gov-dashboard.tsx");
  assert.doesNotMatch(dash, /"Not tracked yet"/);
  assert.match(dash, /function GovPendingTiles/);
  assert.match(dash, /Shows once the provincial licence register is connected\./);
});

test("auth route verifies Turnstile alongside the view-as lookup (sign-in speed)", () => {
  const route = src("src/routes/api/auth/$.ts");
  assert.match(route, /const turnstileCheck:/);
  assert.ok(route.indexOf("const turnstileCheck:") < route.indexOf("viewAsBlocksThisRequest()"));
});

// ---- Device audit: layout, legibility, tap floors ----
test("404 page has a real h1 and French links stay French", () => {
  const nf = src("src/components/page-not-found.tsx");
  assert.match(nf, /titleAs="h1"/);
  assert.match(nf, /localePath\("\/search", locale\)/);
  assert.match(src("src/components/empty-state.tsx"), /const Title = titleAs/);
});

test("small text and tap floors survive the 14px root", () => {
  const css = src("src/styles.css");
  assert.match(css, /--text-xs: max\(0\.75rem, 12px\)/);
  assert.match(css, /\.ke-chip,\n\.ke-crumb \{\n {2}font-size: max\(0\.75rem, 12px\)/);
  assert.match(css, /\.ke-listing-jump a \{[^}]*min-height: max\(44px, 2\.75rem\)/);
  assert.match(css, /@media \(max-height: 500px\) and \(pointer: coarse\) \{\n {2}\.ke-help-bot > button > span/);
  assert.match(src("src/components/legal-doc.tsx"), /inline-flex min-h-11 items-center underline-offset-4/);
});

test("search keeps server rows on first paint (no Loading swap, CLS)", () => {
  const s = src("src/routes/search.tsx");
  assert.match(s, /keepBootRows/);
});

test("status time label is formatted in the loader (no hydration #418)", () => {
  assert.match(src("src/routes/status.tsx"), /export async function loadPublicStatusWithLabels/);
  assert.match(src("src/routes/fr.status.tsx"), /checkedLabel=\{data\.checkedLabel\}/);
});

test("get-session has its own higher rate limit for carrier NAT", () => {
  assert.match(src("src/lib/auth/server.ts"), /"\/get-session": \{ window: 60, max: 600 \}/);
});

test("French Government of Canada links point at live pages", () => {
  const b = src("src/lib/benefits-facts.ts");
  assert.match(b, /fr\/accord-apprentissage-garde-jeunes-enfants\.html/);
  assert.match(b, /allocation-canadienne-enfants\/combien-recevoir\.html/);
  assert.doesNotMatch(b, /entente-apprentissage-garde-jeunes-enfants|combien\.html/);
});

// ---- Emulator findings (25 Nov) ----
test("old engines (Fire OS WebView 91) get API shims and a layer-free stylesheet", () => {
  const boot = src("public/legacy-boot.js");
  for (const api of ["structuredClone", '"at"', '"hasOwn"', '"toSorted"', "randomUUID", "AbortSignal.timeout", '"throwIfAborted"']) {
    assert.ok(boot.includes(api), api);
  }
  assert.match(boot, /CSSLayerBlockRule/);
  assert.match(src("src/routes/__root.tsx"), /<script src="\/legacy-boot\.js\?v=1" \/>/);
  const root = src("src/routes/__root.tsx");
  assert.ok(root.indexOf("legacy-boot.js") < root.indexOf("asset-recover.js"));
  assert.match(src("vite.config.ts"), /target: \["es2020", "chrome91"/);
});

test("legacy flatten unwraps @layer blocks and keeps strings and comments", () => {
  const boot = src("public/legacy-boot.js");
  const body = boot.match(/var flatten = (function \(css\) \{[\s\S]*?\n {4}\});/)[1];
  const flatten = new Function(`return ${body}`)();
  assert.equal(
    flatten('@layer theme,base;@layer base{a{color:red}@media (x){b{c:d}}}.u{x:"}"}@layer utilities{.p{q:r}}'),
    'a{color:red}@media (x){b{c:d}}.u{x:"}"}.p{q:r}',
  );
});

test("offline page probes the site, retries with backoff and leaves by itself", () => {
  const page = src("native-www/index.html");
  assert.equal(page, src("android/app/src/main/assets/offline/index.html"));
  assert.match(page, /robots\.txt\?ke-probe=/);
  assert.match(page, /addEventListener\("online"/);
  assert.match(page, /Toujours hors ligne/);
});

test("Android: offline only without a validated network; recovers and handles running deep links", () => {
  const java = src("android/app/src/main/java/ca/kidease/app/MainActivity.java");
  assert.match(java, /NET_CAPABILITY_VALIDATED/);
  assert.match(java, /recoverFromOffline/);
  assert.match(java, /protected void onNewIntent\(Intent intent\)/);
  assert.match(java, /"kidease"\.equals\(scheme\)/);
  assert.match(src("android/app/src/main/AndroidManifest.xml"), /android:scheme="kidease"/);
});

test("iOS: a brief unsatisfied path or a slow load is not offline", () => {
  const ios = src("ios/App/App/KidEaseBridgeViewController.swift");
  assert.match(ios, /pathMonitor\.currentPath\.status != \.satisfied/);
  assert.match(ios, /func probeSite/);
  assert.match(ios, /func recoverFromOffline/);
  assert.match(ios, /\/fr\/app-admin-unavailable/);
});

test("location is never requested on page load", async () => {
  const { shouldRequestExploreGeolocation } = await import("../src/lib/default-origin.ts");
  assert.equal(shouldRequestExploreGeolocation({ consent: "unset", savedTrusted: false }), false);
  assert.equal(shouldRequestExploreGeolocation({ consent: "granted" }), true);
  assert.match(src("src/components/native-boot.tsx"), /const askGps = consent === "granted";/);
});

test("French admin note page in the apps", async () => {
  const { nativeAdminNotePathFor } = await import("../src/lib/native-admin.ts");
  assert.equal(nativeAdminNotePathFor("/fr/admin"), "/fr/app-admin-unavailable");
  assert.equal(nativeAdminNotePathFor("/admin"), "/app-admin-unavailable");
  assert.match(src("src/routes/fr.app-admin-unavailable.tsx"), /createFileRoute\("\/fr\/app-admin-unavailable"\)/);
  assert.match(src("android/app/src/main/java/ca/kidease/app/AdminWebOnly.java"), /french \? "\/fr" : ""/);
});

test("small landscape, help launcher and search tip stay out of the way", () => {
  const css = src("src/styles.css");
  assert.match(css, /@media \(max-height: 430px\) and \(min-width: 560px\)/);
  assert.match(css, /html:has\(main :is\(input, textarea, select\):focus\) \.ke-help-bot/);
  assert.match(css, /\[data-ke="listing-sticky-bar"\] :is\(\[data-ke="listing-sticky-cta"\]/);
  assert.match(src("src/components/first-run.tsx"), /tourKey === "tour:parent:search" && onLandingPage/);
  assert.match(src("src/components/mobile-search-sheet.tsx"), /size-12 min-h-\[44px\] min-w-\[44px\]/);
});
