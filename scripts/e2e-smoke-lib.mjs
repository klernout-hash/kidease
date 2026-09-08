/**
 * Helpers for the Playwright e2e smoke runner — unit-testable without Chromium.
 *
 * CI default is `npm run build` then `vite preview` on 127.0.0.1:8081
 * (see vite.config.ts). A long-lived preview can be passed as BASE_URL.
 * Stripe charges and real OTPs are out of scope.
 */
import { CANONICAL_ORIGIN, decideRequest } from "./request-guard.mjs";

export const DEFAULT_PREVIEW_ORIGIN = "http://127.0.0.1:8081";
export const DEFAULT_PREVIEW_PORT = 8081;

/** Paths this suite is allowed to open. Never /pay, /verify-2fa, or Stripe. */
export const SMOKE_PATHS = Object.freeze({
  home: "/",
  login: "/login",
  admin: "/admin",
  parent: "/parent",
  provider: "/provider",
});

/** Guest fetches only — prove /api/admin/* is not an open JSON desk. */
export const ADMIN_API_SMOKE_PATHS = Object.freeze([
  "/api/admin/sentry-test",
  "/api/admin/stripe-catalog",
]);

/** Public readiness probe. Must stay 200 without Better Stack keys. */
export const HEALTH_SMOKE_PATH = "/api/health";

export function classifyPublicHealth({ status = 0, bodyText = "" } = {}) {
  if (status !== 200) {
    return { ok: false, kind: "down", reason: `health HTTP ${status}` };
  }
  let json = null;
  try {
    json = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    return { ok: false, kind: "invalid", reason: "health body is not JSON" };
  }
  if (json && json.ok === true && json.service === "kidease") {
    return { ok: true, kind: "ok" };
  }
  return { ok: false, kind: "invalid", reason: "health JSON missing ok/service" };
}

export function parseE2eArgs(argv = [], env = {}) {
  const positional = [];
  let url = "";
  let startPreview = false;
  let requireServer = false;
  let browserSmoke = false;
  let outDir = "";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--url") {
      const value = argv[++i];
      if (!value) return { error: "--url requires an http(s) origin" };
      url = value;
    } else if (arg.startsWith("--url=")) {
      const value = arg.slice("--url=".length);
      if (!value) return { error: "--url requires an http(s) origin" };
      url = value;
    } else if (arg === "--start-preview") {
      startPreview = true;
    } else if (arg === "--require") {
      requireServer = true;
    } else if (arg === "--browser-smoke") {
      browserSmoke = true;
    } else if (arg === "--out-dir") {
      const value = argv[++i];
      if (!value) return { error: "--out-dir requires a path" };
      outDir = value;
    } else if (arg.startsWith("--out-dir=")) {
      const value = arg.slice("--out-dir=".length);
      if (!value) return { error: "--out-dir requires a path" };
      outDir = value;
    } else if (arg.startsWith("--")) {
      return { error: `unknown flag: ${arg}` };
    } else {
      positional.push(arg);
    }
  }

  if (positional.length > 1) {
    return { error: "only one positional URL is allowed" };
  }

  const fromEnv = String(env.BASE_URL || env.E2E_BASE_URL || "").trim();
  const explicitUrl = url || positional[0] || fromEnv;
  const requireFromEnv = env.E2E_REQUIRE === "1" || env.E2E_REQUIRE === "true";

  return {
    url: explicitUrl,
    startPreview,
    requireServer: requireServer || requireFromEnv,
    browserSmoke,
    outDir: outDir || env.E2E_OUT_DIR || "artifacts/e2e",
    allowExternal: env.BROWSER_ALLOW_EXTERNAL_HOST === "1",
    explicitUrl: Boolean(explicitUrl),
  };
}

export function normalizeOrigin(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
  return parsed.origin;
}

export function targetOrigin(args) {
  return normalizeOrigin(args.url) || (args.startPreview ? DEFAULT_PREVIEW_ORIGIN : "");
}

/**
 * When there is no BASE_URL / --url and we are not starting preview, skip
 * instead of failing. CI always passes --start-preview or BASE_URL.
 */
export function skipReason(args) {
  if (args.error) return null;
  if (args.startPreview) return null;
  if (args.explicitUrl) return null;
  if (args.requireServer) return null;
  return "no BASE_URL (set BASE_URL or pass --start-preview to run against vite preview)";
}

export function vercelAppAdminDecision() {
  return decideRequest({ host: "kidease-git.vercel.app", pathname: SMOKE_PATHS.admin });
}

export function expectedAccessLocation(pathname = SMOKE_PATHS.admin) {
  return `${CANONICAL_ORIGIN}${pathname}`;
}

/**
 * Guest /admin is gated without Cloudflare or a session.
 * - Local preview: TanStack beforeLoad → /login
 * - *.vercel.app: request-guard 302 → www.kidease.ca/admin (Access lives there)
 * - www: Cloudflare Access interstitial, or /login after Access
 */
export function classifyAdminGate({
  finalUrl = "",
  status = 0,
  bodyText = "",
  locationHeader = "",
} = {}) {
  const url = String(finalUrl || "");
  const location = String(locationHeader || "");
  const body = String(bodyText || "");
  const expected = expectedAccessLocation();

  if (status >= 400 && status < 500) {
    return { ok: true, kind: "denied" };
  }
  if (location.startsWith(CANONICAL_ORIGIN) && /\/admin(?:\/|$|\?)/.test(location)) {
    return { ok: true, kind: "access-redirect" };
  }
  if (url.startsWith(CANONICAL_ORIGIN) && /\/admin(?:\/|$|\?)/.test(url) && status >= 300 && status < 400) {
    return { ok: true, kind: "access-redirect" };
  }
  if (/cloudflareaccess\.com|Cloudflare Access|Sign in with Cloudflare/i.test(`${url}\n${body}`)) {
    return { ok: true, kind: "cloudflare-access" };
  }
  if (/\/login(?:\/|$|\?)/.test(url) || /Sign in/i.test(body)) {
    return { ok: true, kind: "login" };
  }
  if (location.includes("/login")) {
    return { ok: true, kind: "login" };
  }
  if (/Admin · KidEase|Admin desk/i.test(body) && !/Sign in/i.test(body)) {
    return { ok: false, kind: "open", reason: "unsigned /admin rendered the admin desk" };
  }
  if (url.includes(expected) || location === expected) {
    return { ok: true, kind: "access-redirect" };
  }
  return {
    ok: false,
    kind: "unknown",
    reason: `unsigned /admin did not redirect to login or Access (status ${status}, url ${url || "(none)"})`,
  };
}

/**
 * Guest /parent must not render the signed-in parent desk.
 * Client RedirectToSignIn → /login is the local preview path.
 */
export function classifyParentGuestGate({
  finalUrl = "",
  status = 0,
  bodyText = "",
  locationHeader = "",
} = {}) {
  const url = String(finalUrl || "");
  const location = String(locationHeader || "");
  const body = String(bodyText || "");
  if (status >= 400 && status < 500) return { ok: true, kind: "denied" };
  if (/\/login(?:\/|$|\?)/.test(`${url}\n${location}`) || /Sign in/i.test(body)) {
    return { ok: true, kind: "login" };
  }
  if (/Saved centres|Your children|Parent Plus|tab=payments/i.test(body) && !/Sign in/i.test(body)) {
    return { ok: false, kind: "open", reason: "unsigned /parent rendered the parent desk" };
  }
  return {
    ok: false,
    kind: "unknown",
    reason: `unsigned /parent did not redirect to login (status ${status}, url ${url || "(none)"})`,
  };
}

/**
 * Guest /provider is a public landing with a sign-in CTA.
 * The centre write desk (tours, money, listings) must not appear.
 */
export function classifyProviderGuestGate({
  finalUrl = "",
  status = 0,
  bodyText = "",
  locationHeader = "",
} = {}) {
  const url = String(finalUrl || "");
  const location = String(locationHeader || "");
  const body = String(bodyText || "");
  if (status >= 400 && status < 500) return { ok: true, kind: "denied" };
  if (/\/login(?:\/|$|\?)/.test(`${url}\n${location}`)) return { ok: true, kind: "login" };
  if (/Sign in to the centre desk|Sign in to manage spots/i.test(body)) {
    return { ok: true, kind: "guest-landing" };
  }
  if (/Tour requests|ProviderMoney|Vacancy confirm/i.test(body) && !/Sign in/i.test(body)) {
    return { ok: false, kind: "open", reason: "unsigned /provider rendered the centre write desk" };
  }
  if (/Sign in/i.test(body)) return { ok: true, kind: "login" };
  return {
    ok: false,
    kind: "unknown",
    reason: `unsigned /provider missing guest sign-in CTA (status ${status}, url ${url || "(none)"})`,
  };
}

/**
 * Guest /api/admin/* must not return a successful admin payload.
 * 401/403, login/Access redirect, or a JSON { ok: false } error are fine.
 */
export function classifyAdminApiGate({
  status = 0,
  locationHeader = "",
  bodyText = "",
  finalUrl = "",
} = {}) {
  const location = String(locationHeader || "");
  const url = String(finalUrl || "");
  const body = String(bodyText || "");
  if (status >= 400 && status < 500) {
    return { ok: true, kind: "denied" };
  }
  if (status >= 300 && status < 400) {
    if (/\/login|cloudflareaccess|kidease\.ca/i.test(`${location}\n${url}`)) {
      return { ok: true, kind: "redirect" };
    }
    return { ok: true, kind: "redirect" };
  }
  if (/cloudflareaccess\.com|Cloudflare Access/i.test(`${url}\n${body}`)) {
    return { ok: true, kind: "cloudflare-access" };
  }
  if (/\/login(?:\/|$|\?)/.test(url) || /Sign in/i.test(body)) {
    return { ok: true, kind: "login" };
  }
  let json = null;
  try {
    json = body ? JSON.parse(body) : null;
  } catch {
    json = null;
  }
  if (json && json.ok === false) {
    return { ok: true, kind: "denied" };
  }
  if (status === 200 && json && (json.ok === true || json.prices || json.dsn || json.rows)) {
    return { ok: false, kind: "open", reason: "guest /api/admin returned admin JSON" };
  }
  if (status === 200) {
    return { ok: false, kind: "open", reason: "guest /api/admin returned HTTP 200" };
  }
  return {
    ok: false,
    kind: "unknown",
    reason: `guest /api/admin unexpected status ${status}`,
  };
}

export function homepageLooksLive({ title = "", bodyText = "", status = 0 } = {}) {
  if ((status ?? 0) >= 400 || (status ?? 0) === 0) {
    return { ok: false, reason: `homepage HTTP ${status}` };
  }
  const text = `${title}\n${bodyText}`;
  if (/KidEase/i.test(text) || /Find licensed daycare near you/i.test(text)) {
    return { ok: true };
  }
  return { ok: false, reason: "homepage missing KidEase identity copy" };
}

export function loginPageLooksLive({ title = "", bodyText = "", hasEmail = false, status = 0 } = {}) {
  if ((status ?? 0) >= 400 || (status ?? 0) === 0) {
    return { ok: false, reason: `login HTTP ${status}` };
  }
  const text = `${title}\n${bodyText}`;
  if (!hasEmail && !/type="email"|Email/i.test(text)) {
    return { ok: false, reason: "login page missing email field" };
  }
  if (!/Sign in/i.test(text)) {
    return { ok: false, reason: "login page missing Sign in copy" };
  }
  return { ok: true };
}

export function e2eScriptMustStayChargeFree(src) {
  const forbidden = [
    /stripe\.com\/checkout/i,
    /confirmCardPayment/,
    /createPayment/,
    /verify-2fa\?/,
    /fill\(.*otp/i,
    /type\(.*otp/i,
  ];
  return forbidden.filter((re) => re.test(src)).map((re) => String(re));
}
