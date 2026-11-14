import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { ncfPointDistanceEnabled } from "../src/lib/features.ts";
import { listingDistancePoint } from "../src/lib/ncf-point-distance.ts";
import { bindRemoteMedia, setLocalTracksEnabled } from "../src/lib/video-media.ts";
import { storeChannelFromSignals } from "../src/lib/native-entitlements.ts";
import { providersForStore } from "../src/lib/auth/providers.ts";
import { decideRequest, stripPrivateRoutePreloads } from "./request-guard.mjs";
import { contrastRatio } from "../src/lib/a11y-pass.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("listing-pin distance stays off and coarsens home daycares", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_NCF_POINT_DISTANCE, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_NCF_STREET, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_NEED_CARE_FAST, false);
  assert.equal(ncfPointDistanceEnabled({}), false);
  assert.equal(ncfPointDistanceEnabled({ FEATURE_NCF_POINT_DISTANCE: "1" }), true);
  const exact = listingDistancePoint({
    id: "centre-1",
    lat: 49.8951,
    lng: -97.1384,
    facilityType: "child_care_centre",
  });
  assert.equal(exact.coarse, false);
  assert.equal(exact.lat, 49.8951);
  const home = listingDistancePoint({
    id: "home-1",
    lat: 49.8951,
    lng: -97.1384,
    facilityType: "family_home",
  });
  assert.equal(home.coarse, true);
  assert.notEqual(home.lat, 49.8951);
  const opened = listingDistancePoint({
    id: "home-1",
    lat: 49.8951,
    lng: -97.1384,
    facilityType: "family_home",
    showPublicAddress: true,
  });
  assert.equal(opened.coarse, false);
  const page = src("src/lib/server/need-care-fast-page.ts");
  assert.match(page, /ncfPointDistanceEnabled/);
  assert.match(page, /listingDistancePoint/);
  assert.doesNotMatch(page, /select[^;]*\baddress\b/i);
});

test("local video tracks disable and remote UI follows track events", () => {
  const track = { kind: "audio", isEnabled: true, mediaStreamTrack: { enabled: true }, enable() { this.isEnabled = true; }, disable() { this.isEnabled = false; } };
  const participant = { audioTracks: new Map([["a", { track }]]) };
  participant.audioTracks.forEach = (fn) => fn({ track });
  assert.equal(setLocalTracksEnabled(participant, "audio", false), 1);
  assert.equal(track.isEnabled, false);
  assert.equal(track.mediaStreamTrack.enabled, false);
  assert.equal(setLocalTracksEnabled({ audioTracks: { forEach() {} } }, "audio", true), 0);

  let seen = null;
  const remoteTrack = { kind: "video", isEnabled: true, on(event, fn) { this["on" + event] = fn; } };
  const publication = {
    kind: "video",
    isTrackEnabled: true,
    track: remoteTrack,
    on(event, fn) { this["on" + event] = fn; },
  };
  const remote = {
    tracks: { forEach(fn) { fn(publication); } },
    on() {},
  };
  bindRemoteMedia(remote, (state) => { seen = state; });
  assert.equal(seen.video, true);
  publication.ontrackDisabled();
  assert.equal(seen.video, false);
  remoteTrack.onenabled();
  assert.equal(seen.video, true);
});

test("Huawei and Amazon builds hide Google even when the WebView only says KidEaseNative", () => {
  const ua = "Mozilla/5.0 (Linux; Android 14) KidEaseNative";
  assert.equal(storeChannelFromSignals({ userAgent: ua, buildChannel: "huawei" }), "huawei");
  assert.equal(storeChannelFromSignals({ userAgent: ua, buildChannel: "amazon" }), "amazon");
  assert.equal(storeChannelFromSignals({ userAgent: ua, buildChannel: "play" }), "google");
  const providers = [
    { idp: "google", providerId: "google" },
    { idp: "facebook", providerId: "facebook" },
  ];
  assert.deepEqual(providersForStore(providers, "huawei").map((row) => row.idp), ["facebook"]);
  assert.deepEqual(providersForStore(providers, "amazon").map((row) => row.idp), ["facebook"]);
  assert.match(src("src/lib/auth/store-signin-flags.ts"), /FEATURE_SIGNIN_HUAWEI/);
  assert.match(src(".env.example"), /^FEATURE_LOGIN_AMAZON=0$|^# FEATURE_LOGIN_AMAZON=false$/m);
});

test("provider desk requests redirects and public pages do not preload vacancy or gov admin", () => {
  assert.deepEqual(decideRequest({ host: "www.kidease.ca", pathname: "/provider/desk/requests" }), {
    action: "redirect",
    status: 302,
    location: "/provider?desk=requests",
  });
  assert.match(src("vite.config.ts"), /vacancy-index/);
  assert.match(src("vite.config.ts"), /gov-admin/);
  const stripped = stripPrivateRoutePreloads(
    '<link rel="modulepreload" href="/assets/index-a.js"/><link rel="modulepreload" href="/assets/vacancy-index-D_bOQoO9.js" fetchPriority="low"/><link rel="modulepreload" href="/assets/gov-admin-BNjJOVoX.js" fetchPriority="low"/>',
  );
  assert.match(stripped, /index-a\.js/);
  assert.doesNotMatch(stripped, /vacancy-index/);
  assert.doesNotMatch(stripped, /gov-admin/);
  assert.match(src("src/routes/__root.tsx"), /defer src="\/asset-recover.js"/);
  const inbox = src("src/lib/server/inbox.ts");
  assert.match(inbox, /left join lateral/);
  assert.match(inbox, /limit 50/);
  assert.doesNotMatch(inbox, /alter table conversations add column if not exists staff_note/);
  const actor = src("src/lib/server/actor-user.ts");
  assert.match(actor, /UnauthorizedError/);
  assert.doesNotMatch(actor, /return id/);
  assert.ok(contrastRatio("#0e1424", "#8eabef") >= 4.5);
  assert.match(src("src/components/shell.tsx"), /data-ke="header-care-categories"/);
  assert.doesNotMatch(src("src/components/shell.tsx"), /live-on-kidease-tab/);
  assert.match(src("src/components/airbnb-screens.tsx"), /aria-current=\{on \? "page" : undefined\}/);
});
