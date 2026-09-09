import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("parent desk defers heavy tab content so nav highlight paints first", () => {
  const desk = src("src/components/parent-desk.tsx");
  const shortlist = src("src/components/parent-shortlist.tsx");
  const route = src("src/routes/parent.tsx");
  assert.match(desk, /startTransition/);
  assert.match(desk, /setContentTab/);
  assert.match(desk, /active=\{tab\}/);
  assert.match(desk, /contentTab === "explore"/);
  assert.match(desk, /contentTab === "saved"/);
  assert.match(desk, /scheduleIdle/);
  assert.match(desk, /yieldToMain/);
  assert.match(desk, /useDeferredValue/);
  assert.match(desk, /accountToolsReady/);
  assert.match(desk, /startTransition\(\(\) => \{\s*setPicked/);
  assert.match(shortlist, /SAVED_EAGER_CARDS/);
  assert.match(desk, /savedReady/);
  assert.match(desk, /requestIdleCallback/);
  assert.match(desk, /withTimeoutFallback/);
  assert.match(desk, /LOADER_SETTLE_MS/);
  assert.match(desk, /exploreReady/);
  assert.match(desk, /loadDeskExtras/);
  assert.match(desk, /lazy\(\(\) =>\s*import\("@\/components\/parent-desk-rails"/);
  assert.match(route, /lazy\(\(\) =>\s*import\("@\/components\/parent-desk"/);
  assert.doesNotMatch(desk, /onSelect=\{\(id\) => setTab\(id as ParentTab\)\}/);
});

test("parent rails isolate chip filters from match scoring and paint extra rows after the first frame", () => {
  const rails = src("src/components/parent-desk-rails.tsx");
  assert.match(rails, /useDeferredValue/);
  assert.match(rails, /startTransition/);
  assert.match(rails, /scoreParentRailItems/);
  assert.match(rails, /matchPrefs/);
  assert.match(rails, /defaultAge/);
  assert.match(rails, /extraReady/);
  assert.match(rails, /eagerThumbs=\{false\}/);
  assert.doesNotMatch(rails, /const prefs = useMemo/);

  const lib = src("src/lib/parent-rails.ts");
  assert.match(lib, /scoredParentRailItems/);
  assert.match(lib, /alreadyScored/);
  assert.match(lib, /items.every\(alreadyScored\)/);
});

test("verify-2fa keeps OTP state under Shell and never silently ignores a Verify tap", () => {
  const route = src("src/routes/verify-2fa.tsx");
  assert.match(route, /function VerifyTwoFactorForm/);
  assert.match(route, /<VerifyTwoFactorForm dest=\{dest\} userId=\{user\.id\} \/>/);
  assert.match(route, /<Shell bare>/);
  assert.match(route, /submitLock/);
  assert.match(route, /explainBlocker/);
  assert.match(route, /Complete the security check/);
  assert.match(route, /Enter the 6-digit code/);
  assert.match(route, /Still sending your code/);
  assert.match(route, /disabled=\{busy\}/);
  assert.match(route, /aria-busy=\{busy\}/);
  assert.doesNotMatch(route, /disabled=\{busy \|\| !ready \|\| code\.length !== 6/);
  assert.match(route, /yieldToMain/);
  assert.match(route, /OtpCodeField/);
  assert.match(route, /\[font-family:system-ui,Segoe_UI,sans-serif\]/);
  assert.match(route, /needTurnstile \? \(/);
  assert.match(route, /pageStalled/);
  assert.match(src("src/components/shell.tsx"), /verifyLite/);
  assert.match(src("src/components/shell.tsx"), /menuLite/);
  assert.match(src("src/components/shell.tsx"), /pathname.startsWith\("\/parent"\)/);
  assert.match(src("src/lib/auth/gates.tsx"), /pending\?:/);
  assert.match(src("src/routes/parent.tsx"), /pending=\{/);
});

test("rail cards skip offscreen paint and listing cards are memoized", () => {
  const css = src("src/styles.css");
  assert.match(css, /\.ke-rail-card \{[\s\S]*content-visibility: auto;/);
  assert.match(css, /contain-intrinsic-size: var\(--ke-card-w, 11\.25rem\) 260px;/);
  assert.match(src("src/components/daycare-card.tsx"), /export const DaycareCard = memo\(/);
  assert.match(src("src/components/turnstile-field.tsx"), /export const TurnstileField = memo\(/);
  assert.match(src("src/components/turnstile-field.tsx"), /min-h-\[65px\]/);
  assert.match(src("src/components/turnstile-field.tsx"), /size: "flexible"/);
  assert.match(src("src/components/turnstile-field.tsx"), /requestIdleCallback/);
});
