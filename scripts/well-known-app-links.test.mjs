import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { CAP_APP_ID } from "./native-permissions.mjs";
import {
  AASA_JSON_PATH,
  AASA_PATH,
  ASSETLINKS_PATH,
  PLACEHOLDER_APPLE_TEAM_ID,
  buildAppleAppSiteAssociation,
  buildAssetLinks,
  isWellKnownAppLinksPath,
  resolveAndroidSha256Fingerprints,
  resolveAppleTeamId,
  wellKnownAppLinksPayload,
} from "./well-known-app-links.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("uses the Capacitor appId and a documented Team ID placeholder", () => {
  assert.equal(CAP_APP_ID, "ca.daycarenearme.app");
  assert.equal(PLACEHOLDER_APPLE_TEAM_ID, "XXXXXXXXXX");
  assert.equal(resolveAppleTeamId({}), PLACEHOLDER_APPLE_TEAM_ID);
  assert.equal(resolveAppleTeamId({ APPLE_TEAM_ID: "  AB12CD34EF  " }), "AB12CD34EF");
  assert.equal(resolveAppleTeamId({ APNS_TEAM_ID: "APNSONLY01" }), "APNSONLY01");
  assert.equal(
    resolveAppleTeamId({ APPLE_TEAM_ID: "APPLEFIRST1", APNS_TEAM_ID: "APNSONLY01" }),
    "APPLEFIRST1",
  );
});

test("does not invent Android signing fingerprints", () => {
  assert.deepEqual(resolveAndroidSha256Fingerprints({}), []);
  assert.deepEqual(resolveAndroidSha256Fingerprints({ ANDROID_SHA256_CERT_FINGERPRINTS: "" }), []);
  assert.deepEqual(resolveAndroidSha256Fingerprints({ ANDROID_SHA256_CERT_FINGERPRINTS: "  " }), []);
  assert.deepEqual(
    resolveAndroidSha256Fingerprints({
      ANDROID_SHA256_CERT_FINGERPRINTS: "AA:BB:CC, DD:EE:FF",
    }),
    ["AA:BB:CC", "DD:EE:FF"],
  );
});

test("AASA JSON names the Team ID + bundle id and covers all paths", () => {
  const aasa = buildAppleAppSiteAssociation({});
  const appID = `${PLACEHOLDER_APPLE_TEAM_ID}.${CAP_APP_ID}`;
  assert.deepEqual(aasa.applinks.apps, []);
  assert.equal(aasa.applinks.details[0].appID, appID);
  assert.deepEqual(aasa.applinks.details[0].appIDs, [appID]);
  assert.deepEqual(aasa.applinks.details[0].paths, ["*"]);
  assert.equal(aasa.applinks.details[0].components[0]["/"], "/*");
  assert.deepEqual(aasa.webcredentials.apps, [appID]);

  const filled = buildAppleAppSiteAssociation({ APPLE_TEAM_ID: "TEAMID0001" });
  assert.equal(filled.applinks.details[0].appID, `TEAMID0001.${CAP_APP_ID}`);
});

test("assetlinks.json uses package id and empty fingerprints by default", () => {
  const links = buildAssetLinks({});
  assert.equal(links.length, 1);
  assert.deepEqual(links[0].relation, ["delegate_permission/common.handle_all_urls"]);
  assert.equal(links[0].target.namespace, "android_app");
  assert.equal(links[0].target.package_name, CAP_APP_ID);
  assert.deepEqual(links[0].target.sha256_cert_fingerprints, []);

  const filled = buildAssetLinks({
    ANDROID_SHA256_CERT_FINGERPRINTS: "00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF",
  });
  assert.equal(filled[0].target.sha256_cert_fingerprints.length, 1);
});

test("payload matcher covers AASA (with and without .json) and assetlinks", () => {
  assert.equal(isWellKnownAppLinksPath(AASA_PATH), true);
  assert.equal(isWellKnownAppLinksPath(`${AASA_PATH}/`), true);
  assert.equal(isWellKnownAppLinksPath(AASA_JSON_PATH), true);
  assert.equal(isWellKnownAppLinksPath(ASSETLINKS_PATH), true);
  assert.equal(isWellKnownAppLinksPath("/.well-known/security.txt"), false);
  assert.equal(isWellKnownAppLinksPath("/.well-known/change-password"), false);

  const aasa = wellKnownAppLinksPayload(AASA_PATH, {});
  assert.equal(aasa.contentType, "application/json");
  assert.deepEqual(JSON.parse(aasa.body), buildAppleAppSiteAssociation({}));

  const alias = wellKnownAppLinksPayload(AASA_JSON_PATH, {});
  assert.deepEqual(JSON.parse(alias.body), JSON.parse(aasa.body));

  const assets = wellKnownAppLinksPayload(ASSETLINKS_PATH, {});
  assert.equal(assets.contentType, "application/json");
  assert.deepEqual(JSON.parse(assets.body), buildAssetLinks({}));

  assert.equal(wellKnownAppLinksPayload("/robots.txt"), null);
});

test("public/.well-known files match the placeholder builders", () => {
  const aasaFile = join(root, "public/.well-known/apple-app-site-association");
  const aasaJson = join(root, "public/.well-known/apple-app-site-association.json");
  const assetlinks = join(root, "public/.well-known/assetlinks.json");
  assert.equal(existsSync(aasaFile), true);
  assert.equal(existsSync(aasaJson), true);
  assert.equal(existsSync(assetlinks), true);
  assert.deepEqual(JSON.parse(readFileSync(aasaFile, "utf8")), buildAppleAppSiteAssociation({}));
  assert.deepEqual(JSON.parse(readFileSync(aasaJson, "utf8")), buildAppleAppSiteAssociation({}));
  assert.deepEqual(JSON.parse(readFileSync(assetlinks, "utf8")), buildAssetLinks({}));
});

test("Nitro middleware, Vite plugin, and vercel.json keep these paths off the SPA", () => {
  const middleware = read("server/middleware/well-known-app-links.ts");
  assert.match(middleware, /wellKnownAppLinksPayload/);
  assert.match(middleware, /application\/json|payload\.contentType/);
  assert.match(middleware, /HEAD/);

  const vite = read("vite.config.ts");
  assert.match(vite, /wellKnownAppLinksPlugin/);
  assert.match(vite, /serverDir:\s*"\.\/server"/);

  const vercel = read("vercel.json");
  assert.match(vercel, /"source": "\/\.well-known\/apple-app-site-association"/);
  assert.match(vercel, /"source": "\/\.well-known\/assetlinks\.json"/);
  assert.match(vercel, /application\/json/);
  assert.doesNotMatch(
    vercel,
    /"source": "\/\.well-known\/apple-app-site-association"[\s\S]*"destination"/,
  );
  assert.doesNotMatch(vercel, /"source": "\/\.well-known\/assetlinks\.json"[\s\S]{0,80}"destination"/);

  const guard = read("scripts/request-guard.mjs");
  assert.match(guard, /CHANGE_PASSWORD_PATH/);
  assert.doesNotMatch(guard, /apple-app-site-association/);
});

test("env example documents Team ID and fingerprint fill-in without fake hashes", () => {
  const envExample = read(".env.example");
  assert.match(envExample, /APPLE_TEAM_ID=/);
  assert.match(envExample, /ANDROID_SHA256_CERT_FINGERPRINTS=/);
  assert.match(envExample, /XXXXXXXXXX/);
  assert.doesNotMatch(envExample, /APPLE_TEAM_ID=[A-Z0-9]{10}/);
  assert.doesNotMatch(envExample, /ANDROID_SHA256_CERT_FINGERPRINTS=[0-9A-F:]{10,}/);

  const docs = read("docs/store-readiness.md");
  assert.match(docs, /apple-app-site-association/);
  assert.match(docs, /assetlinks\.json/);
  assert.match(docs, /ANDROID_SHA256_CERT_FINGERPRINTS/);
  assert.match(docs, /application\/json/);
});
