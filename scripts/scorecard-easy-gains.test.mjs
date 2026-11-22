import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { requestHasSessionMaterial } from "../src/lib/anonymous-request.ts";
import { catalogCountsFromRow, CATALOG_COUNT_SQL, CATALOG_COUNT_TTL_MS } from "../src/lib/catalog-counts.ts";
import { isInternalQaTraffic } from "../src/lib/internal-qa.ts";
import { formatStatusCheckedAt, statusServices } from "../src/lib/status-public.ts";
import {
  PUBLIC_STATIC_EDGE_CACHE,
  isPublicStaticDocument,
  publicStaticCacheControl,
} from "./public-static-cache.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("desktop Playwright uses its versioned cache and unit components always get Chromium", () => {
  const ci = src(".github/workflows/ci.yml");
  const job = (name) => {
    const body = ci.split(`\n  ${name}:\n`)[1]?.split(/\n {2}[\w-]+:\n/)[0];
    assert.ok(body, `${name} remains a required CI job`);
    return body;
  };
  const desktop = job("desktop-visual");
  const check = job("check");
  const versionStep = src(".github/actions/playwright-version/action.yml");
  assert.match(versionStep, /npx playwright --version/);
  assert.match(versionStep, /::error::/);
  assert.match(desktop, /actions\/playwright-version/);
  assert.match(desktop, /actions\/cache\/restore@v\d+/);
  assert.match(desktop, /actions\/cache\/save@v\d+/);
  assert.match(desktop, /playwright-\$\{\{ runner\.os \}\}-\$\{\{ steps\.playwright-version\.outputs\.version \}\}-chromium/);
  assert.match(desktop, /if: steps\.playwright-cache\.outputs\.cache-hit != 'true'/);
  assert.match(desktop, /npx playwright install-deps chromium/);
  assert.match(desktop, /timeout 180 npx playwright install chromium/);
  assert.match(desktop, /timeout-minutes: 10/);
  assert.match(desktop, /fonts-liberation/);
  assert.doesNotMatch(desktop, /playwright install-deps chromium webkit/);
  assert.doesNotMatch(desktop, /playwright install --with-deps/);
  assert.match(
    check,
    /- name: Install Chromium for component tests\n {8}run: npx playwright install --with-deps chromium\n {6}- name: Unit tests\n {8}run: npm test/,
  );
  assert.doesNotMatch(check, /continue-on-error|^\s+if:/m);
  assert.doesNotMatch(versionStep, /package-lock\.json/);
});

test("internal QA traffic is tagged without storing the email", () => {
  assert.equal(isInternalQaTraffic({ email: "kyle@kidease.ca" }), true);
  assert.equal(isInternalQaTraffic({ email: "Kyle@OpenRoadOutlet.ca" }), true);
  assert.equal(isInternalQaTraffic({ email: "klernout@hotmail.com" }), true);
  assert.equal(isInternalQaTraffic({ email: "qa@kidease.ca" }), true);
  assert.equal(isInternalQaTraffic({ email: "parent+qa-test@example.com" }), true);
  assert.equal(isInternalQaTraffic({ search: "?ke_internal=1" }), true);
  assert.equal(isInternalQaTraffic({ cookie: "ke_internal=1" }), true);
  assert.equal(isInternalQaTraffic({ webdriver: true }), true);
  assert.equal(isInternalQaTraffic({ email: "parent@example.com" }), false);
  const posthog = src("src/lib/posthog.ts");
  assert.match(posthog, /internal_qa: true/);
  assert.match(posthog, /\$is_internal: true/);
  assert.match(posthog, /capture_exceptions/);
  assert.match(src("src/components/safe-error-boundary.tsx"), /\$exception/);
  assert.doesNotMatch(src("src/lib/internal-qa.ts"), /capture\(.*email/);
});

test("listing hero gives the centre name to the main photo", () => {
  const gallery = src("src/components/listing-hero-gallery.tsx");
  assert.match(gallery, /alt=\{name\}/);
  assert.match(src("src/routes/daycare.$slug.tsx"), /alt=\{earlyName \|\| undefined\}/);
  assert.match(src("src/components/building-photo.tsx"), /aria-hidden=\{_alt \? undefined : true\}/);
});

test("anonymous public documents get an edge cache and skip the session lookup", () => {
  assert.equal(requestHasSessionMaterial("", ""), false);
  assert.equal(requestHasSessionMaterial("theme=light", null), false);
  assert.equal(requestHasSessionMaterial("__Host-grok-auth.session_token=abc", null), true);
  assert.match(PUBLIC_STATIC_EDGE_CACHE, /s-maxage=3600/);
  assert.match(PUBLIC_STATIC_EDGE_CACHE, /stale-while-revalidate=86400/);
  assert.equal(isPublicStaticDocument("/privacy"), true);
  assert.equal(isPublicStaticDocument("/fr/contact"), true);
  assert.equal(isPublicStaticDocument("/daycare/city/winnipeg"), true);
  assert.equal(isPublicStaticDocument("/fr/daycare/city/winnipeg"), true);
  assert.equal(isPublicStaticDocument("/search"), false);
  assert.equal(
    publicStaticCacheControl({ pathname: "/privacy", method: "GET", status: 200 }),
    PUBLIC_STATIC_EDGE_CACHE,
  );
  assert.equal(
    publicStaticCacheControl({
      pathname: "/privacy",
      method: "GET",
      status: 200,
      cookie: "__Secure-kidease.session_token=abc",
    }),
    null,
  );
  assert.match(src("src/lib/server/role-route.ts"), /requestHasSessionMaterial/);
  assert.match(src("src/lib/city-hub-page.ts"), /Promise\.all/);
  assert.match(src("src/lib/web-vitals.ts"), /reportAllChanges: true/);
  assert.match(src("src/lib/web-vitals.ts"), /visibilitychange/);
});

test("health counts stay read-only and the status page is bilingual", () => {
  assert.equal(CATALOG_COUNT_TTL_MS, 60_000);
  assert.match(CATALOG_COUNT_SQL, /listings_total/);
  assert.match(CATALOG_COUNT_SQL, /winnipeg_total/);
  assert.match(CATALOG_COUNT_SQL, /'winnipeg', 'wpg', 'winnpeg'/);
  assert.doesNotMatch(CATALOG_COUNT_SQL, /like '%winnipeg%'/);
  assert.match(CATALOG_COUNT_SQL, /photos_confirmed/);
  assert.match(CATALOG_COUNT_SQL, /fees_confirmed/);
  assert.match(CATALOG_COUNT_SQL, /ages_confirmed/);
  assert.match(CATALOG_COUNT_SQL, /PUBLIC_LISTING_SQL|listing_active/);
  assert.equal(catalogCountsFromRow({
    listings_total: 10,
    winnipeg_total: 2,
    photos_confirmed: 3,
    fees_confirmed: 4,
    ages_confirmed: 5,
  }).catalogCount, 10);
  assert.equal(catalogCountsFromRow({ listings_total: 1 }), null);
  const rows = statusServices({ checks: { app: "ok", database: "ok" } });
  assert.equal(rows.find((row) => row.id === "messages").state, "partial");
  assert.equal(rows.find((row) => row.id === "payments").state, "ok");
  assert.equal(statusServices(null)[0].state, "unknown");
  const when = formatStatusCheckedAt("2026-01-15T18:30:00.000Z", "en");
  assert.match(when, /2026/);
  assert.match(src("src/routes/status.tsx"), /statusTitle/);
  assert.match(src("src/routes/status.tsx"), /loadPublicStatus/);
  assert.doesNotMatch(src("src/routes/status.tsx"), /server\/uptime|@\/lib\/db|catalog-hydrate|pglite/);
  assert.match(src("src/routes/fr.status.tsx"), /\/fr\/status/);
  assert.match(src("src/routes/fr.status.tsx"), /loadPublicStatus/);
  assert.match(src("src/lib/server/status-page.ts"), /await import\("\.\/uptime"\)/);
  assert.doesNotMatch(src("src/lib/server/status-page.ts"), /^import .*from ["']\.\/uptime["']/m);
  assert.match((src("src/lib/copy-en.ts") + src("src/lib/copy-fr.ts")), /statusTitle: "Is KidEase working\?"/);
  assert.match((src("src/lib/copy-en.ts") + src("src/lib/copy-fr.ts")), /statusTitle: "KidEase fonctionne-t-il\?"/);
  assert.match(src("src/lib/site-footer-nav.ts"), /\/status/);
});
