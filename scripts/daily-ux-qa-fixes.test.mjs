import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { GHOST_LISTING } from "../src/lib/ghost-listing.ts";
import { inboxUnreadForDesk, inboxViewForDesk } from "../src/lib/inbox-view.ts";
import {
  isAdminLoginIntent,
  isCloudflareAccessPath,
  resolvePostLoginPath,
} from "../src/lib/desks.ts";
import { isAdminOnlyListing, providerDeskListingVisible } from "../src/lib/listing-visibility.ts";
import {
  alignSearchOrigin,
  anchorsForSearchMap,
  explicitCityQuery,
  gpsMayMoveSearchOrigin,
  originFromSearchQuery,
  originsMatchSearchQuery,
  placeQueryForCamera,
  searchMapOrigin,
  searchQueryFromUnknown,
  urlHasGeocodableSearchQuery,
} from "../src/lib/search-query.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("q=Winnipeg geocodes locally and does not match an Edmonton origin", () => {
  const winnipeg = originFromSearchQuery("Winnipeg");
  assert.ok(winnipeg);
  assert.match(winnipeg.label, /Winnipeg/);
  assert.equal(originsMatchSearchQuery(winnipeg, "Winnipeg"), true);
  assert.equal(originsMatchSearchQuery({ lat: 53.5461, lng: -113.4938 }, "Winnipeg"), false);
  assert.equal(searchQueryFromUnknown({ q: "Winnipeg" }), "Winnipeg");
  assert.equal(searchQueryFromUnknown("?q=Winnipeg"), "Winnipeg");
  assert.equal(urlHasGeocodableSearchQuery("?q=Winnipeg"), true);
  assert.equal(urlHasGeocodableSearchQuery("?q="), false);

  const search = src("src/routes/search.tsx");
  assert.match(search, /originFromSearchQuery/);
  assert.match(search, /originsMatchSearchQuery\(boot\.origin, incoming\.q\)/);
  assert.match(search, /searchQueryFromUnknown\(location\.search\)/);
  assert.match(src("src/components/native-boot.tsx"), /urlHasGeocodableSearchQuery/);
  assert.match(src("src/lib/search-origin.ts"), /setOrigin\(\{ \.\.\.local, explicit: true \}, "manual"\)/);
});

test("Edmonton search keeps the map circle off a Manitoba device pin", () => {
  const edmonton = explicitCityQuery("Edmonton, AB");
  assert.ok(edmonton);
  assert.equal(edmonton.label, "Edmonton, AB");
  assert.equal(explicitCityQuery("Edmonton")?.label, "Edmonton, AB");
  assert.equal(explicitCityQuery("Near Selkirk, MB"), null);

  const powerview = { lat: 50.5667, lng: -96.198 };
  const camera = searchMapOrigin({
    lat: powerview.lat,
    lng: powerview.lng,
    radiusKm: 25,
    q: "Edmonton, AB",
    label: "Near Selkirk, MB",
  });
  assert.equal(camera.label, "Edmonton, AB");
  assert.ok(Math.abs(camera.lat - edmonton.lat) < 0.01);
  assert.ok(Math.abs(camera.lng - edmonton.lng) < 0.01);

  const device = searchMapOrigin({
    lat: powerview.lat,
    lng: powerview.lng,
    radiusKm: 25,
    q: "Near Selkirk, MB",
    label: "Near Selkirk, MB",
  });
  assert.equal(device.lat, powerview.lat);
  assert.equal(device.lng, powerview.lng);

  assert.equal(gpsMayMoveSearchOrigin({ originSource: "manual", q: "Edmonton, AB" }), false);
  assert.equal(gpsMayMoveSearchOrigin({ originSource: "gps", q: "Edmonton, AB" }), false);
  assert.equal(gpsMayMoveSearchOrigin({ originSource: "gps", q: "Near Selkirk, MB" }), true);

  // Production repro: list is Edmonton (home pin) while the map circle stays on a
  // saved work / device fix near Powerview–Pine Falls because mode is "work".
  const deviceFix = { lat: 50.605847, lng: -96.15279 };
  const owned = anchorsForSearchMap({
    lat: edmonton.lat,
    lng: edmonton.lng,
    radiusKm: 25,
    q: "Edmonton",
    query: "Edmonton",
    label: "Edmonton, AB",
    work: deviceFix,
    mode: "work",
  });
  assert.equal(owned.cityOwned, true);
  assert.equal(owned.mode, "home");
  assert.equal(owned.secondary, null);
  assert.ok(Math.abs(owned.primary.lat - edmonton.lat) < 0.01);
  assert.ok(Math.abs(owned.primary.lng - edmonton.lng) < 0.01);

  const fromDevice = anchorsForSearchMap({
    lat: deviceFix.lat,
    lng: deviceFix.lng,
    radiusKm: 25,
    q: "Edmonton",
    label: "Near Winnipeg, MB",
    work: deviceFix,
    mode: "both",
  });
  assert.equal(fromDevice.cityOwned, true);
  assert.equal(fromDevice.intersect, false);
  assert.ok(Math.abs(fromDevice.primary.lat - edmonton.lat) < 0.01);
  assert.ok(Math.abs(fromDevice.home.lng - edmonton.lng) < 0.01);

  const deviceWork = anchorsForSearchMap({
    lat: deviceFix.lat,
    lng: deviceFix.lng,
    radiusKm: 25,
    q: "Near Selkirk, MB",
    label: "Near Selkirk, MB",
    work: deviceFix,
    mode: "work",
  });
  assert.equal(deviceWork.cityOwned, false);
  assert.equal(deviceWork.mode, "work");
  assert.equal(deviceWork.primary.lat, deviceFix.lat);
  assert.equal(deviceWork.primary.lng, deviceFix.lng);

  assert.equal(placeQueryForCamera("", "Edmonton"), "Edmonton");
  assert.equal(placeQueryForCamera("Edmonton", "Winnipeg"), "Edmonton");

  const nanRadius = alignSearchOrigin({
    lat: deviceFix.lat,
    lng: deviceFix.lng,
    radiusKm: Number.NaN,
    q: "Edmonton",
  });
  assert.equal(nanRadius.label, "Edmonton, AB");
  assert.ok(Math.abs(nanRadius.lat - edmonton.lat) < 0.01);

  const search = src("src/routes/search.tsx");
  assert.match(search, /anchorsForSearchMap/);
  assert.match(search, /const anchors = viewAnchors/);
  assert.match(search, /viewAnchors\.cityOwned/);
  assert.match(search, /setAnchorMode\("home"\)/);
  assert.match(src("src/components/map-view.tsx"), /originRef/);
  assert.match(src("src/components/map-view.tsx"), /map\.setCenter/);
  assert.match(src("src/lib/search-origin.ts"), /bootGeneration/);
  assert.match(src("src/lib/use-presence.ts"), /gpsMayMoveSearchOrigin/);
  assert.match(src("src/components/native-boot.tsx"), /gpsMayMoveSearchOrigin/);
});

test("public privacy and parent waitlist copy do not leak FEATURE_SMS", () => {
  const privacy = src("src/lib/legal-copy.ts");
  const copy = src("src/lib/copy.ts");
  assert.doesNotMatch(privacy, /FEATURE_SMS/);
  assert.match(privacy, /SMS alerts stay off until you grant express consent/);
  assert.doesNotMatch(copy, /waitlistOptInSmsHint:[\s\S]{0,240}FEATURE_SMS/);
  assert.doesNotMatch(copy, /waitlistPulseLead:[\s\S]{0,400}FEATURE_SMS/);
  assert.doesNotMatch(src("src/routes/privacy.tsx"), /FEATURE_SMS/);
});

test("director My listings drops TEST Ghost Claim Lab", () => {
  assert.equal(isAdminOnlyListing(GHOST_LISTING), true);
  assert.equal(providerDeskListingVisible({ ...GHOST_LISTING, claimStatus: "waiting" }), false);
  const family = src("src/lib/server/family.ts");
  const start = family.indexOf("export const getProvider");
  const end = family.indexOf("export const createListing", start);
  const getProvider = family.slice(start, end === -1 ? undefined : end);
  assert.match(getProvider, /providerDeskListingVisible/);
  assert.match(getProvider, /ownedByViewer: true/);
  assert.doesNotMatch(getProvider, /\.filter\(\(d\) => !isAdminOnlyListing\(d\)\)/);
});

test("listing health percent is separate from Listing Verified", () => {
  const complete = src("src/components/listing-completeness.tsx");
  assert.match(complete, /ListingHealthPanel/);
  assert.doesNotMatch(complete, /ListingReadinessCoach/);
  assert.match(src("src/components/listing-readiness-coach.tsx"), /listingVerifiedNotHealth/);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /listingHealthLead:[\s\S]{0,280}not Listing Verified/);
  assert.match(copy, /100% complete listing can still be waiting/);
  assert.match(copy, /n’est pas le pourcentage/);
});

test("Stripe Checkout CTAs stay honest when there are no bills", () => {
  const parent = src("src/components/parent-desk.tsx");
  assert.match(parent, /offerCheckout=\{bills\.filter/);
  assert.match(src("src/components/parent-plus.tsx"), /offerCheckout/);
  assert.match(src("src/components/parent-plus.tsx"), /parentPlusNoBill/);
  assert.match(src("src/components/provider-plan-banner.tsx"), /planViewPlans/);
  assert.match(src("src/components/provider-subscription.tsx"), /savedFree/);
  assert.match(src("src/components/provider-subscription.tsx"), /current \|\| !state\.entitlements\.paid \? "secondary"/);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /No centre bills yet/);
  assert.match(copy, /Aucune facture de centre/);
});

test("search-alert SMS checkbox uses CASL statement, not a pre-checked email default", () => {
  const prefs = src("src/lib/server/saved-searches.ts");
  assert.match(prefs, /emailEnabled: consents\.emailService/);
  assert.match(prefs, /smsEnabled: consents\.smsService/);
  assert.doesNotMatch(prefs, /emailEnabled: true,/);
  const panel = src("src/components/saved-searches-panel.tsx");
  assert.match(panel, /caslStatement/);
  assert.match(panel, /smsService/);
});

test("parent unread badge follows the inbox view for the active desk", () => {
  assert.equal(inboxViewForDesk("parent"), "family");
  assert.equal(inboxViewForDesk("provider"), "centre");
  assert.equal(inboxUnreadForDesk({ unread: 4, unreadFamily: 1, unreadCentre: 3 }, "parent"), 1);
  assert.equal(inboxUnreadForDesk({ unread: 4, unreadFamily: 1, unreadCentre: 3 }, "provider"), 3);
  assert.equal(inboxUnreadForDesk({ unread: 2 }, "parent"), 2);
  assert.equal(inboxUnreadForDesk(null, "parent"), 0);
  const roles = src("src/lib/server/roles.ts");
  assert.match(roles, /unreadFamily/);
  assert.match(roles, /unreadCentre/);
  assert.match(src("src/components/desk-switcher.tsx"), /inboxUnreadForDesk/);
});

test("shortlist chips wrap; Parent/Daycare phone desk nav scrolls instead of wrapping", () => {
  const shortlist = src("src/components/parent-shortlist.tsx");
  assert.match(shortlist, /ke-listings-narrow/);
  assert.match(shortlist, /min-w-0 max-w-full flex-wrap/);
  const shell = src("src/components/desk-shell.tsx");
  assert.match(shell, /data-ke="desk-tab-nav"/);
  assert.match(shell, /overflow-x-auto/);
  assert.match(shell, /data-ke="desk-more-sheet"/);
  assert.match(shell, /aria-modal="true"/);
  const phone = shell.slice(shell.indexOf("function PhoneDeskNav"), shell.indexOf("export function DeskShell"));
  assert.match(phone, /flex-nowrap/);
  assert.doesNotMatch(phone, /flex-wrap/);
  assert.match(phone, /data-ke="desk-more-open"/);
  const moreIdx = phone.indexOf("data-ke=\"desk-more-open\"");
  const navEnd = phone.indexOf("</nav>");
  assert.equal(moreIdx > navEnd, true, "More stays pinned outside the scrolling primaries");
  assert.match(src("src/styles.css"), /html\[data-channel="app"\] \.ke-listings-narrow/);
});

test("search map stays deferred and loader respects typed city q", () => {
  const search = src("src/routes/search.tsx");
  assert.match(search, /lazy\(\(\) => import\("@\/components\/map-view"\)/);
  assert.match(search, /if \(view === "map"\) setMapEnabled\(true\)/);
  assert.match(search, /mapEnabled \? \(/);
  assert.match(search, /const \[mapEnabled, setMapEnabled\] = useState\(false\)/);
});

test("Parent and Daycare login never bounce through Cloudflare Access", () => {
  assert.equal(isCloudflareAccessPath("/admin"), true);
  assert.equal(isCloudflareAccessPath("/support"), true);
  assert.equal(isCloudflareAccessPath("/parent"), false);
  assert.equal(isCloudflareAccessPath("/provider"), false);
  assert.equal(isCloudflareAccessPath("/login"), false);
  assert.equal(resolvePostLoginPath({ role: "parent", sticky: "admin", next: "/admin" }), "/parent");
  assert.equal(resolvePostLoginPath({ role: "provider", sticky: "admin" }), "/provider");
  assert.match(src("src/routes/index.tsx"), /remembered: readRememberedRole\(\)/);
  assert.match(src("src/lib/auth/parent-login.ts"), /isCloudflareAccessPath\(dest\) \? "\/parent"/);
  assert.equal(isAdminLoginIntent({ role: "parent", next: "/admin" }), false);
  assert.equal(isAdminLoginIntent({ next: "/admin" }), true);
  const funnel = src("src/lib/auth/login-funnel.ts");
  assert.match(funnel, /isCloudflareAccessPath/);
  assert.match(funnel, /isAdminLoginIntent/);
  const guard = src("scripts/request-guard.mjs");
  assert.match(guard, /\/parent/);
  assert.match(guard, /are not matched/);
  assert.match(guard, /isSensitiveDeskPath/);
  assert.doesNotMatch(guard.slice(guard.indexOf("export function isSensitiveDeskPath"), guard.indexOf("function queryString")), /\/parent/);
  assert.doesNotMatch(guard.slice(guard.indexOf("export function isSensitiveDeskPath"), guard.indexOf("function queryString")), /\/provider/);
});

test("login consent checkboxes stay user-driven; Turnstile is a visible managed widget", () => {
  const twoFa = src("src/routes/verify-2fa.tsx");
  assert.match(twoFa, /useState\(false\)/);
  assert.match(twoFa, /data-ke="remember-device"/);
  assert.match(twoFa, /autoComplete="off"/);
  assert.match(twoFa, /data-lpignore="true"/);
  assert.match(twoFa, /name="kidease-remember-device"/);
  assert.match(src("src/components/turnstile-field.tsx"), /appearance: "always"/);
  assert.doesNotMatch(src("src/components/turnstile-field.tsx"), /appearance: "interaction-only"/);
  assert.match(src("src/components/casl-consent-fields.tsx"), /autoComplete="off"/);
  assert.match(src("src/components/casl-consent-fields.tsx"), /data-lpignore="true"/);
});

test("Firefox layout uses standards appearance and dvh fallbacks", () => {
  const css = src("src/styles.css");
  assert.match(css, /-moz-appearance: none/);
  assert.match(css, /min-height: 100vh;\s*\n\s*min-height: 100dvh/);
  assert.match(css, /\.min-h-dvh \{/);
  assert.match(css, /\.ke-auth-viewport \{/);
  assert.match(css, /min-height: calc\(100vh - 4\.5rem\)/);
  assert.match(src("src/routes/login.tsx"), /ke-auth-viewport/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(src("src/components/chip-carousel.tsx"), /ke-chip-carousel/);
});

test("building photo 404s fall back to the committed placeholder, no invented JPEGs", () => {
  const photo = src("src/components/building-photo.tsx");
  assert.match(photo, /storefront-placeholder-480\.webp/);
  assert.match(photo, /if \(cur !== FALLBACK\) setCur\(FALLBACK\)/);
  const honesty = src("src/lib/photo-honesty.ts");
  assert.match(honesty, /\/photos\/buildings\/mb-102137\.jpg/);
  assert.match(honesty, /\/photos\/buildings\/mb-2169\.jpg/);
  assert.match(src("src/lib/listing-photo.ts"), /LISTING_PLACEHOLDER/);
});
