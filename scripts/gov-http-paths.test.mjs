import assert from "node:assert/strict";
import { test } from "node:test";
import { createMemoryHistory } from "@tanstack/history";
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { apiZoneForPath, canonicalApiPath, privateHttpZoneForPath, roleMayEnterZone } from "../src/lib/gov/access.ts";
import { signedPdfPath } from "../src/lib/docusign-packs.ts";

const PRIVATE_ROUTES = [
  { path: "/api/admin/contracts", zone: "admin" },
  { path: "/api/admin/email-suppressions", zone: "admin" },
  { path: "/api/admin/media", zone: "admin" },
  { path: "/api/admin/push-dry-run", zone: "admin" },
  { path: "/api/admin/sentry-test", zone: "admin" },
  { path: "/api/admin/stripe-catalog", zone: "admin" },
  { path: "/api/family-documents", zone: "parent" },
  { path: "/api/family-documents/$id", sample: "/api/family-documents/document-A", zone: "parent" },
  { path: "/api/search-alerts", zone: "parent" },
  { path: "/api/spot-offers", zone: "parent" },
  { path: "/api/referrals", zone: "parent" },
  { path: "/api/invoices/$id/pdf", sample: "/api/invoices/invoice-A/pdf", zone: "parent" },
  { path: "/api/screening-documents", zone: "provider" },
  { path: "/api/screening-documents/$id", sample: "/api/screening-documents/document-A", zone: "provider" },
  { path: "/api/license-docs/$daycareId", sample: "/api/license-docs/centre-A", zone: "provider" },
  { path: "/api/open-spots-checkin", zone: "provider" },
  { path: "/api/tour-holds", zone: "provider" },
  { path: "/api/contracts/$id/pdf", sample: "/api/contracts/contract-A/pdf", zone: "parent" },
];
const OTHER_ROUTES = ["/api/gov/export", "/api/gov/open-data", "/api/auth/session", "/api/health"];
const root = createRootRoute();
const router = createRouter({
  routeTree: root.addChildren([...PRIVATE_ROUTES.map((entry) => entry.path), ...OTHER_ROUTES].map((path) =>
    createRoute({ getParentRoute: () => root, path }))),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});

/** Same URL parse, location parse and exact-match test used by the installed Start handler. */
function routeMatch(raw) {
  const requestUrl = new URL(raw, "https://example.test");
  // Start rejects malformed percent encodings before request middleware runs.
  try { decodeURI(requestUrl.pathname); }
  catch { return { path: requestUrl.pathname, rejected: true, matched: null }; }
  const location = router.parseLocation({
    pathname: requestUrl.pathname, href: requestUrl.pathname + requestUrl.search,
    search: requestUrl.search, hash: "", state: {},
  });
  const [, params, found] = router.getMatchedRoutes(location.pathname);
  return {
    path: requestUrl.pathname, routerPath: location.pathname, rejected: false,
    matched: found && params["**"] === undefined ? found.fullPath : null, params,
  };
}

function encodeLetters(path) {
  return path.replace(/[A-Za-z]/g, (letter) => `%${letter.charCodeAt(0).toString(16)}`);
}

test("every private route keeps isolation under installed-router case and unreserved encoding rules", () => {
  for (const entry of PRIVATE_ROUTES) {
    const sample = entry.sample ?? entry.path;
    const variants = [
      sample, sample.toUpperCase(),
      sample.replace("/api/", "/%61pi/"),
      sample.replace("/api/", "/Api/"),
      encodeLetters(sample),
    ];
    for (const raw of variants) {
      const result = routeMatch(raw);
      assert.equal(result.matched, entry.path, `${raw} must exercise the real private route`);
      assert.equal(privateHttpZoneForPath(result.path), entry.zone, raw);
      assert.equal(apiZoneForPath(result.path), entry.zone, raw);
      assert.equal(roleMayEnterZone("government", privateHttpZoneForPath(result.path)), false, raw);
    }
  }
});

test("encoded Kelvin sign follows the installed router's Unicode case fold for checkin", () => {
  for (const raw of ["/api/open-spots-checKin", "/api/open-spots-chec%E2%84%AAin"]) {
    const result = routeMatch(raw);
    assert.equal(result.matched, "/api/open-spots-checkin");
    assert.equal(canonicalApiPath(result.path), "/api/open-spots-checkin");
    assert.equal(privateHttpZoneForPath(result.path), "provider");
  }
});

test("query, trailing slash and URL-normalized dot segments retain private classification", () => {
  for (const entry of PRIVATE_ROUTES) {
    const sample = entry.sample ?? entry.path;
    for (const raw of [
      `${sample}?format=json&next=%2Fapi%2Fhealth`, `${sample}/`,
      sample.replace("/api/", "/api/discard/../"),
      sample.replace("/api/", "/api/discard/%2e%2e/"),
    ]) {
      const result = routeMatch(raw);
      assert.equal(result.matched, entry.path, raw);
      assert.equal(privateHttpZoneForPath(result.path), entry.zone, raw);
    }
    assert.equal(privateHttpZoneForPath(`${sample}?format=json`), entry.zone);
    assert.equal(privateHttpZoneForPath(`${sample}/?format=json`), entry.zone);
  }
  const backslashes = routeMatch("/api\\admin\\media");
  assert.equal(backslashes.path, "/api/admin/media");
  assert.equal(privateHttpZoneForPath(backslashes.path), "admin");
});

test("reserved separators, double encodings and duplicate slashes are not broadened into routes", () => {
  for (const raw of [
    "/api%2Fadmin/media", "/api/admin%2Fmedia", "/api//admin/media",
    "/%2561pi/admin/media", "/api/%2561dmin/media", "/api/%5Cadmin/media",
  ]) {
    const result = routeMatch(raw);
    assert.equal(result.rejected, false);
    assert.equal(result.matched, null, raw);
    assert.notEqual(canonicalApiPath(result.path), "/api/admin/media", raw);
  }
  assert.equal(canonicalApiPath("/%2561pi/admin/media"), "/%2561pi/admin/media");
  assert.equal(canonicalApiPath("/api/admin%2Fmedia"), "/api/admin%2fmedia");
  assert.equal(canonicalApiPath("/api//admin/media"), "/api//admin/media");
});

test("malformed percent paths are transport errors and cannot bypass isolation", () => {
  for (const raw of [
    "/api/%", "/api/%6", "/api/%GGdmin/media", "/api/%E2%84/admin/media",
    "/api/family-documents/%", "/api/contracts/%GG/pdf",
  ]) {
    assert.doesNotThrow(() => canonicalApiPath(new URL(raw, "https://example.test").pathname));
    const result = routeMatch(raw);
    assert.equal(result.rejected, true, raw);
    assert.equal(result.matched, null, raw);
  }
});

test("encoded controls are sanitized without creating a private route alias", () => {
  for (const raw of ["/api/ad%00min/media", "/api/ad%09min/media", "/api/ad%7Fmin/media"]) {
    const result = routeMatch(raw);
    assert.equal(result.matched, null, raw);
    const canonical = canonicalApiPath(result.path);
    assert.equal([...canonical].every((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127 && character !== "\\"), true);
    assert.notEqual(canonical, "/api/admin/media");
  }
});

test("public and government routes stay outside the private HTTP gate", () => {
  for (const path of OTHER_ROUTES) {
    for (const raw of [path, path.toUpperCase(), encodeLetters(path)]) {
      const result = routeMatch(raw);
      assert.equal(result.matched, path);
      assert.equal(privateHttpZoneForPath(result.path), null, raw);
      assert.equal(apiZoneForPath(result.path), path.startsWith("/api/gov/") ? "government" : "public", raw);
    }
  }
  assert.equal(privateHttpZoneForPath("/"), null);
  assert.equal(privateHttpZoneForPath("/api/family-documents-public"), null);
  assert.equal(privateHttpZoneForPath("/api/invoices-public"), null);
  assert.equal(privateHttpZoneForPath("/api/invoices-evil/invoice-A/pdf"), null);
  assert.equal(privateHttpZoneForPath("/api/administer"), null);
});

test("existing private namespace boundaries and role matrix remain unchanged", () => {
  for (const prefix of ["family-documents", "search-alerts", "spot-offers", "referrals", "invoices"]) {
    for (const suffix of ["", "/fixture", ".legacy"]) assert.equal(privateHttpZoneForPath(`/api/${prefix}${suffix}`), "parent");
  }
  for (const prefix of ["screening-documents", "license-docs", "open-spots-checkin", "tour-holds"]) {
    for (const suffix of ["", "/fixture", ".legacy"]) assert.equal(privateHttpZoneForPath(`/api/${prefix}${suffix}`), "provider");
  }
  for (const path of ["/api/admin", "/api/admin/media", "/api/admin.legacy"]) assert.equal(privateHttpZoneForPath(path), "admin");
  const allowed = {
    parent: ["parent", "provider", "admin"], provider: ["provider", "admin"], admin: ["admin"], government: ["government"],
  };
  for (const zone of Object.keys(allowed)) {
    for (const role of ["parent", "provider", "admin", "government", "support", "support_lead", "unknown", null, undefined]) {
      assert.equal(roleMayEnterZone(role, zone), allowed[zone].includes(role), `${role}/${zone}`);
    }
  }
  assert.equal(roleMayEnterZone(" ADMIN ", "admin"), true);
  assert.equal(privateHttpZoneForPath("/api/contracts"), "provider");
  assert.equal(privateHttpZoneForPath("/api/contracts/list"), "provider");
  assert.equal(roleMayEnterZone("parent", "provider"), false, "parent cannot enter the existing contracts zone");
  const invoiceZone = privateHttpZoneForPath("/api/invoices/invoice-A/pdf");
  assert.equal(invoiceZone, "parent");
  for (const role of ["parent", "provider", "admin"]) assert.equal(roleMayEnterZone(role, invoiceZone), true);
  assert.equal(roleMayEnterZone("government", invoiceZone), false);
});

test("only the exact contract PDF path admits the parent zone; other contract paths remain provider-only", () => {
  const exact = "/api/contracts/contract-A/pdf";
  assert.equal(privateHttpZoneForPath(exact), "parent");
  for (const role of ["parent", "provider", "admin"]) assert.equal(roleMayEnterZone(role, apiZoneForPath(exact)), true);
  assert.equal(roleMayEnterZone("government", apiZoneForPath(exact)), false);
  for (const path of [
    "/api/contracts", "/api/contracts/list", "/api/contracts/contract-A", "/api/contracts/pdf",
    "/api/contracts//pdf", "/api/contracts/contract-A/download", "/api/contracts/contract-A/notpdf",
    "/api/contracts/contract-A/pdf/extra", "/api/contracts/contract-A/nested/pdf",
    "/api/contracts/contract-A/pdf.json", "/api/contracts-other",
  ]) {
    assert.equal(privateHttpZoneForPath(path), "provider", path);
    assert.equal(roleMayEnterZone("parent", apiZoneForPath(path)), false, path);
    assert.equal(roleMayEnterZone("provider", apiZoneForPath(path)), true, path);
    assert.equal(roleMayEnterZone("admin", apiZoneForPath(path)), true, path);
    assert.equal(roleMayEnterZone("government", apiZoneForPath(path)), false, path);
  }
  // Classification stays path-based; dispatch/authorization handles unsupported methods.
  for (const method of ["GET", "HEAD", "POST", "PUT", "DELETE"]) {
    const request = new Request(`https://example.test${exact}?pack_kind=provider_agreement`, { method });
    assert.equal(privateHttpZoneForPath(new URL(request.url).pathname), "parent", method);
  }
});

test("existing signed PDF URLs and contract ID casing are unchanged", () => {
  const contractId = "Ct_Mixed-A_9";
  const url = signedPdfPath(contractId);
  assert.equal(url, "/api/contracts/Ct_Mixed-A_9/pdf");
  const result = routeMatch(url);
  assert.equal(result.matched, "/api/contracts/$id/pdf");
  assert.equal(result.params.id, contractId);
  assert.equal(privateHttpZoneForPath(result.path), "parent");
  assert.equal(signedPdfPath("Ct Mixed/%"), "/api/contracts/Ct%20Mixed%2F%25/pdf");
});
