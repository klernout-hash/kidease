/**
 * Apple App Site Association + Android Digital Asset Links.
 *
 * Served at:
 *   /.well-known/apple-app-site-association
 *   /.well-known/apple-app-site-association.json  (same body; Vercel-friendly alias)
 *   /.well-known/assetlinks.json
 *
 * Bundle / application id is the Capacitor appId already in the repo
 * (`ca.daycarenearme.app`). Apple Team ID and Play SHA-256 fingerprints are
 * NOT in git — do not invent production signing hashes.
 *
 * TODO (Kyle, after Apple Developer + Play Console enroll):
 *   1. Set APPLE_TEAM_ID (or APNS_TEAM_ID) on Vercel — 10-char Team ID.
 *      Until then the JSON uses the documented placeholder XXXXXXXXXX.
 *   2. Set ANDROID_SHA256_CERT_FINGERPRINTS to the Play App Signing cert
 *      (and the upload cert if Play shows both), colon-separated hex,
 *      comma-separated if more than one. Until then sha256_cert_fingerprints
 *      is an empty array so we do not publish a fake hash.
 *
 * Vite (dev/preview) uses wellKnownAppLinksPlugin(); Nitro production uses
 * server/middleware/well-known-app-links.ts. Both call these builders so the
 * SPA catch-all cannot return HTML for these paths.
 */
import { CAP_APP_ID, CAP_PROD_HOSTNAME } from "./native-permissions.mjs";

export { CAP_APP_ID, CAP_PROD_HOSTNAME };

/** Documented 10-char placeholder — not a real Apple Team ID. */
export const PLACEHOLDER_APPLE_TEAM_ID = "XXXXXXXXXX";

export const AASA_PATH = "/.well-known/apple-app-site-association";
export const AASA_JSON_PATH = "/.well-known/apple-app-site-association.json";
export const ASSETLINKS_PATH = "/.well-known/assetlinks.json";

export const WELL_KNOWN_APP_LINK_PATHS = [AASA_PATH, AASA_JSON_PATH, ASSETLINKS_PATH];

const JSON_CONTENT_TYPE = "application/json";

export function normalizeWellKnownPath(pathname) {
  const raw = String(pathname ?? "").split("?")[0] || "/";
  if (raw.length > 1 && raw.endsWith("/")) return raw.slice(0, -1);
  return raw || "/";
}

export function isWellKnownAppLinksPath(pathname) {
  return WELL_KNOWN_APP_LINK_PATHS.includes(normalizeWellKnownPath(pathname));
}

/**
 * Prefer APPLE_TEAM_ID (Sign in with Apple), then APNS_TEAM_ID (push).
 * Empty / missing → placeholder so the file still 200s without a fake Team ID.
 */
export function resolveAppleTeamId(env = process.env) {
  for (const key of ["APPLE_TEAM_ID", "APNS_TEAM_ID"]) {
    const value = String(env?.[key] ?? "").trim();
    if (value) return value;
  }
  return PLACEHOLDER_APPLE_TEAM_ID;
}

/**
 * Parse ANDROID_SHA256_CERT_FINGERPRINTS (comma / whitespace separated).
 * Returns [] when unset — never invent a Play signing hash.
 */
export function resolveAndroidSha256Fingerprints(env = process.env) {
  const raw = String(env?.ANDROID_SHA256_CERT_FINGERPRINTS ?? "").trim();
  if (!raw) return [];
  return raw
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function buildAppleAppSiteAssociation(env = process.env) {
  const appID = `${resolveAppleTeamId(env)}.${CAP_APP_ID}`;
  return {
    applinks: {
      apps: [],
      details: [
        {
          appID,
          paths: ["*"],
          appIDs: [appID],
          components: [
            {
              "/": "/*",
              comment: "Open KidEase https URLs in the Capacitor app",
            },
          ],
        },
      ],
    },
    webcredentials: {
      apps: [appID],
    },
  };
}

export function buildAssetLinks(env = process.env) {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: CAP_APP_ID,
        sha256_cert_fingerprints: resolveAndroidSha256Fingerprints(env),
      },
    },
  ];
}

export function wellKnownAppLinksPayload(pathname, env = process.env) {
  const path = normalizeWellKnownPath(pathname);
  if (path === AASA_PATH || path === AASA_JSON_PATH) {
    return {
      path,
      body: `${JSON.stringify(buildAppleAppSiteAssociation(env), null, 2)}\n`,
      contentType: JSON_CONTENT_TYPE,
    };
  }
  if (path === ASSETLINKS_PATH) {
    return {
      path,
      body: `${JSON.stringify(buildAssetLinks(env), null, 2)}\n`,
      contentType: JSON_CONTENT_TYPE,
    };
  }
  return null;
}

export function wellKnownAppLinksHeaders(contentType = JSON_CONTENT_TYPE) {
  return {
    "content-type": contentType,
    "cache-control": "public, max-age=3600",
  };
}

/** Connect-style middleware for Vite dev + preview (runs before the SPA). */
export function serveWellKnownAppLinks(req, res, next) {
  const method = String(req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    next();
    return;
  }
  const pathOnly = String(req.url ?? "").split("?", 1)[0] ?? "";
  const payload = wellKnownAppLinksPayload(pathOnly);
  if (!payload) {
    next();
    return;
  }
  const body = Buffer.from(payload.body, "utf8");
  res.statusCode = 200;
  for (const [key, value] of Object.entries(wellKnownAppLinksHeaders(payload.contentType))) {
    res.setHeader(key, value);
  }
  res.setHeader("content-length", String(body.byteLength));
  if (method === "HEAD") {
    res.end();
    return;
  }
  res.end(body);
}

export function wellKnownAppLinksPlugin() {
  return {
    name: "kidease-well-known-app-links",
    configureServer(server) {
      server.middlewares.use(serveWellKnownAppLinks);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveWellKnownAppLinks);
    },
  };
}
