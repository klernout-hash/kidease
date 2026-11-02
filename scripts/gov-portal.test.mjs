import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { K_ANONYMITY, suppressCount, suppressRows } from "../src/lib/gov/k-anonymity.ts";
import {
  GOV_SITEMAP_PATHS,
  apiZoneForPath,
  isGovPortalPath,
  roleMayEnterZone,
  showGovFooterLink,
} from "../src/lib/gov/access.ts";
import { buildGovDashboard } from "../src/lib/gov/aggregate.ts";
import { dashboardCsv } from "../src/lib/gov/csv.ts";
import { renderTextPdf } from "../src/lib/gov/pdf.ts";
import { CANADA_POPULATION_2021, PROVINCES, canonicalGovCity, provinceForPoint } from "../src/lib/gov/places.ts";
import { GOV_DEMO_LIMIT, resetGovBudget, takeGovBudget } from "../src/lib/gov/rate-limit.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { govPortalFooterEnabled } from "../src/lib/features.ts";
import { desksFor, nextStoredRole, parseAppRole, resolvePostLoginPath } from "../src/lib/desks.ts";
import { guardPrivatePath, homeForRole } from "../src/lib/role-access.ts";
import { sitemapPublicPaths } from "../src/lib/sitemap.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("groups under 5 are hidden and a neighbour is hidden with them", () => {
  assert.equal(K_ANONYMITY, 5);
  assert.equal(suppressCount(0), 0);
  assert.equal(suppressCount(4), null);
  assert.equal(suppressCount(5), 5);
  const rows = suppressRows([
    { city: "A", n: 2 },
    { city: "B", n: 3 },
    { city: "C", n: 40 },
    { city: "D", n: 9 },
  ]);
  const hidden = rows.filter((row) => row.suppressed);
  assert.ok(hidden.length >= 2);
  assert.ok(hidden.reduce((sum, row) => sum + (row.n == null ? 0 : 0), 0) === 0);
  const hiddenRaw = hidden.map((row) => row.city);
  assert.ok(hiddenRaw.includes("A"));
  assert.ok(hiddenRaw.includes("B"));
  assert.equal(rows.find((row) => row.city === "C")?.n, 40);
});

test("government role cannot call parent, daycare, or admin APIs", () => {
  assert.equal(roleMayEnterZone("government", "parent"), false);
  assert.equal(roleMayEnterZone("government", "provider"), false);
  assert.equal(roleMayEnterZone("government", "admin"), false);
  assert.equal(roleMayEnterZone("government", "government"), true);
  assert.equal(roleMayEnterZone("parent", "government"), false);
  assert.equal(roleMayEnterZone("provider", "government"), false);
  assert.equal(roleMayEnterZone("admin", "government"), false);
  assert.equal(roleMayEnterZone("parent", "parent"), true);
  assert.equal(roleMayEnterZone("admin", "admin"), true);
  assert.equal(apiZoneForPath("/api/family-documents"), "parent");
  assert.equal(apiZoneForPath("/api/admin/media"), "admin");
  assert.equal(apiZoneForPath("/api/screening-documents"), "provider");
  assert.equal(apiZoneForPath("/api/gov/open-data"), "government");
  assert.equal(apiZoneForPath("/api/health"), "public");
  assert.equal(roleMayEnterZone("parent", "public"), true);
});

test("a government session is sent to /gov and not the parent desk", () => {
  assert.equal(parseAppRole("government"), "government");
  assert.equal(parseAppRole("parent"), "parent");
  assert.deepEqual(desksFor({ role: "government" }), []);
  assert.deepEqual(desksFor({ role: "parent" }), ["parent"]);
  assert.equal(homeForRole("government"), "/gov");
  assert.equal(nextStoredRole("government", "parent"), "government");
  assert.equal(resolvePostLoginPath({ role: "government", next: "/parent" }), "/gov");
  const parent = guardPrivatePath({ pathname: "/parent", signedIn: true, role: "government" });
  assert.equal(parent.kind, "home");
  if (parent.kind === "home") assert.equal(parent.to, "/gov");
  const admin = guardPrivatePath({ pathname: "/admin", signedIn: true, role: "government" });
  assert.equal(admin.kind, "not_found");
  const provider = guardPrivatePath({ pathname: "/provider", signedIn: true, role: "provider" });
  assert.equal(provider.kind, "allow");
});

test("dashboard hides a city under 5 and does not invent a desert score", () => {
  const data = buildGovDashboard(
    {
      cities: [
        {
          province: "MB",
          city: "Winnipeg",
          centres: 20,
          licensed: 18,
          capacity: 400,
          capacityKnown: 18,
          vacancyReporters: 10,
          vacancyFresh30: 6,
          openSpots: 12,
          cwelccKnown: 8,
          feesConfirmed: 7,
          feesUncited: 4,
          french: 9,
          english: 20,
          inclusion: 6,
          lat: 49.9,
          lng: -97.1,
        },
        {
          province: "MB",
          city: "Brandon",
          centres: 9,
          licensed: 9,
          capacity: 80,
          capacityKnown: 9,
          vacancyReporters: 6,
          vacancyFresh30: 5,
          openSpots: 5,
          cwelccKnown: 5,
          feesConfirmed: 5,
          feesUncited: 0,
          french: 5,
          english: 9,
          inclusion: 5,
          lat: 49.84,
          lng: -99.95,
        },
        {
          province: "MB",
          city: "Tiny",
          centres: 2,
          licensed: 2,
          capacity: 10,
          capacityKnown: 2,
          vacancyReporters: 1,
          vacancyFresh30: 1,
          openSpots: 1,
          cwelccKnown: 0,
          feesConfirmed: 0,
          feesUncited: 1,
          french: 0,
          english: 2,
          inclusion: 0,
          lat: 50,
          lng: -98,
        },
      ],
      fees: [{ bucket: "under_400", kind: "confirmed", n: 2 }],
      waitlist: [{ age: "infant", start: "2026-11", n: 3 }],
      trends: [{ month: "2026-10", listings: 2, vacancyUpdates: 1, jobs: 1 }],
      fill: { n: 2, avgDays: 4 },
      jobs: 3,
      generatedAt: "2026-10-31T00:00:00.000Z",
    },
    { province: "MB", region: "ALL", city: "ALL" },
    "en",
    { orgName: "Demo Province of Manitoba", demo: true, readOnly: true },
  );
  assert.equal(data.kpis.avgFillDays, null);
  assert.equal(data.kpis.jobPosts, null);
  assert.equal(data.waitlist.every((row) => row.suppressed || (row.n ?? 0) >= 5), true);
  assert.equal(data.cities.some((row) => row.label === "Tiny"), false);
  assert.equal(canonicalGovCity("MB", "Wpg"), "Winnipeg");
  assert.equal(canonicalGovCity("MB", "La Prairie"), "Portage la Prairie");
  assert.equal(canonicalGovCity("QC", "La Prairie"), "La Prairie");
  const merged = buildGovDashboard(
    {
      cities: [
        { province: "MB", city: "Wpg", centres: 12, licensed: 12, capacity: 20, capacityKnown: 12, vacancyReporters: 0, vacancyFresh30: 0, openSpots: 0, cwelccKnown: 0, feesConfirmed: 6, feesUncited: 3, french: 0, english: 12, inclusion: 0, lat: 49.8, lng: -97.1 },
        { province: "MB", city: "Winnipeg", centres: 12, licensed: 12, capacity: 20, capacityKnown: 12, vacancyReporters: 0, vacancyFresh30: 0, openSpots: 0, cwelccKnown: 0, feesConfirmed: 6, feesUncited: 3, french: 0, english: 12, inclusion: 0, lat: 49.9, lng: -97.2 },
      ],
      fees: [],
      waitlist: [],
      trends: [],
      fill: { n: 0, avgDays: null },
      jobs: 0,
      generatedAt: "2026-11-01T00:00:00.000Z",
    },
    { province: "MB", region: "ALL", city: "ALL" },
    "en",
    { orgName: "Manitoba", demo: false, readOnly: true },
  );
  assert.equal(merged.cities.filter((row) => row.label === "Winnipeg").length, 1);
  assert.equal(merged.kpis.directoryCentres, 24);
  assert.equal(merged.kpis.feesConfirmedCentres, 12);
  assert.equal(merged.kpis.feesUncitedCentres, 6);
  assert.equal(merged.kpis.feesNoneCentres, 6);
  assert.equal(data.map.every((point) => point.centres >= 5), true);
  assert.match(data.coverage.join(" "), /No names, emails, phones/);
  const csv = dashboardCsv(data);
  assert.match(csv, /section,label,value,note/);
  assert.doesNotMatch(csv, /^email,/m);
  assert.match(csv, /Winnipeg/);
  assert.match(csv, /No names, emails, phones/);
  const pdf = new TextDecoder().decode(renderTextPdf(["Bonjour les garderies"]));
  assert.match(pdf, /^%PDF-1.4/);
  assert.equal(data.desert.source?.includes("2021"), true);
});

test("footer link stays off and /gov is not in the sitemap", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_GOV_PORTAL, false);
  assert.equal(govPortalFooterEnabled({}), false);
  assert.equal(govPortalFooterEnabled({ FEATURE_GOV_PORTAL: "1" }), true);
  assert.equal(showGovFooterLink({ enabled: false, native: false }), false);
  assert.equal(showGovFooterLink({ enabled: true, native: true }), false);
  assert.equal(showGovFooterLink({ enabled: true, native: false }), true);
  const paths = sitemapPublicPaths();
  for (const path of GOV_SITEMAP_PATHS) assert.equal(paths.includes(path), false);
  assert.equal(isGovPortalPath("/fr/gov/login"), true);
  assert.equal(isGovPortalPath("/parent"), false);
});

test("demo government reads are rate limited", () => {
  const store = new Map();
  let last = { ok: true, remaining: 1 };
  for (let i = 0; i < GOV_DEMO_LIMIT; i += 1) last = takeGovBudget("demo", true, 1_000, store);
  assert.equal(last.ok, true);
  const blocked = takeGovBudget("demo", true, 1_000, store);
  assert.equal(blocked.ok, false);
  resetGovBudget(store);
});

test("queries and the seed do not select personal fields or print the password", () => {
  const sql = readFileSync(join(root, "src/lib/server/gov-data.server.ts"), "utf8");
  assert.doesNotMatch(sql, /select[^;]*\b(email|phone|postal_code|child_label)\b/i);
  assert.doesNotMatch(sql, /from children/i);
  const seed = readFileSync(join(root, "scripts/seed-gov-demo.mjs"), "utf8");
  assert.match(seed, /never prints them/);
  assert.doesNotMatch(seed, /console\.log\([^)]*plan\.password/);
  assert.doesNotMatch(seed, /console\.log\([^)]*apiKey/);
  const guard = readFileSync(join(root, "src/lib/auth/middleware.ts"), "utf8");
  assert.match(guard, /rejectGovernmentOnPrivateApi/);
});

test("2021 census province populations add up to the Canada total", () => {
  const sum = PROVINCES.reduce((total, row) => total + row.population2021, 0);
  assert.equal(sum, CANADA_POPULATION_2021);
  assert.equal(PROVINCES.length, 13);
  assert.equal(provinceForPoint(49.9, -97.14), "MB");
});
