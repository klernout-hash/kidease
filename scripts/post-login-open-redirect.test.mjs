/**
 * Post-login `next` must stay on this site.
 *
 * A login link can carry `next` as a slash, a backslash (or a tab, newline,
 * or carriage return the URL parser skips), and another host. The checks that
 * only look for two forward slashes keep that value. After sign-in,
 * window.location.assign receives it, and the browser loads the other host.
 *
 * These tests fail while that is still true. They pass once every return path
 * stays on the app origin. Parsing the assigned string with the URL parser is
 * required: checking the same two-slash prefix again, then assigning the
 * original string, still leaves the site.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { createMemoryHistory } from "@tanstack/history";
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { defaultParseSearch } from "@tanstack/router-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_ORIGIN = "https://www.kidease.ca";
const PAGE = `${APP_ORIGIN}/login`;
const VIRTUAL = "kidease-open-redirect:";

const assigned = [];
const memory = () => ({
  getItem() {
    return null;
  },
  setItem() {},
  removeItem() {},
});

globalThis.__kideaseRedirectProfile = null;
globalThis.window = {
  location: {
    assign(url) {
      assigned.push(String(url));
    },
    search: "",
    origin: APP_ORIGIN,
    pathname: "/login",
    href: `${PAGE}`,
  },
  navigator: { userAgent: "Mozilla/5.0" },
  sessionStorage: memory(),
  localStorage: memory(),
};
globalThis.document = { cookie: "" };
globalThis.sessionStorage = globalThis.window.sessionStorage;
globalThis.localStorage = globalThis.window.localStorage;

function appFile(specifier, parentURL) {
  let candidate;
  if (specifier.startsWith("@/")) candidate = join(root, "src", specifier.slice(2));
  else if (specifier.startsWith(".") && parentURL?.startsWith("file:")) {
    candidate = join(dirname(fileURLToPath(parentURL.split("?")[0])), specifier);
  }
  if (!candidate) return null;
  if (candidate.endsWith(".json")) return null;
  return [candidate, `${candidate}.ts`, `${candidate}.tsx`].find((file) => existsSync(file)) ?? null;
}

function extractFunction(file, name) {
  const source = readFileSync(file, "utf8");
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let text = "";
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      text = source.slice(node.getStart(parsed), node.getEnd());
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  if (!text.includes(`function ${name}`)) throw new Error(`missing ${name} in ${file}`);
  return text;
}

const loginValidateSource = ts.transpileModule(
  `
    import { sanitizePostLoginNext, parseDeskQuery, deskQueryValue } from ${JSON.stringify(pathToFileURL(join(root, "src/lib/desks.ts")).href)};
    import { sanitizeNativeOAuthError } from ${JSON.stringify(pathToFileURL(join(root, "src/lib/auth/native-oauth.ts")).href)};
    import { isSignupWhy } from ${JSON.stringify(pathToFileURL(join(root, "src/lib/signup-funnel.ts")).href)};
    ${extractFunction(join(root, "src/routes/login.tsx"), "loginValidateSearch")}
  `,
  {
    fileName: "login-validate-search.ts",
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  },
).outputText;

const stubs = new Map([
  [
    "roles",
    `export async function getMyDesks() {
      const profile = globalThis.__kideaseRedirectProfile;
      if (profile instanceof Error) throw profile;
      return profile;
    }`,
  ],
  [
    "two-factor",
    `export async function getTwoFactorStatus() {
      return { verified: true };
    }`,
  ],
  ["login-validate", loginValidateSource],
]);

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/server/roles") return { url: `${VIRTUAL}roles`, shortCircuit: true };
    if (specifier === "@/lib/server/two-factor") return { url: `${VIRTUAL}two-factor`, shortCircuit: true };
    if (specifier === `${VIRTUAL}login-validate`) return { url: `${VIRTUAL}login-validate`, shortCircuit: true };
    const parent = context.parentURL || "";
    const inApp = parent.startsWith(pathToFileURL(join(root, "src")).href) || parent.startsWith(VIRTUAL);
    if (specifier.startsWith("@/") || (inApp && specifier.startsWith("."))) {
      const file = appFile(specifier, parent);
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.startsWith(VIRTUAL)) return nextLoad(url, context);
    return { format: "module", source: stubs.get(url.slice(VIRTUAL.length)), shortCircuit: true };
  },
});
after(() => hooks.deregister());

const { loginValidateSearch } = await import(`${VIRTUAL}login-validate`);
const { sanitizePostLoginNext, pathnameOfDest, resolvePostLoginPath } = await import(
  "../src/lib/desks.ts"
);
const { destinationAfterSignIn } = await import("../src/lib/role-access.ts");
const { verify2faSearchNext } = await import("../src/lib/auth/verify-2fa-session.ts");
const { localizeAuthDest, localePath } = await import("../src/lib/locale-path.ts");
const { assignPostAuthDest, continueAfterSignIn } = await import("../src/lib/auth/login-funnel.ts");

function resolved(value) {
  return new URL(value, PAGE);
}

function onApp(value) {
  if (value == null || value === "") return true;
  return resolved(value).origin === APP_ORIGIN;
}

function profileFor(role) {
  if (role === "guest") return null;
  if (role === "provider") return { role: "provider", ownsCentre: true, centreLinked: true };
  return { role, ownsCentre: false, centreLinked: false };
}

/** Where the browser would load the string passed to location.assign. */
function navigationOf(value) {
  const first = resolved(value);
  if (first.origin !== APP_ORIGIN) return first;
  const carried = first.searchParams.get("next");
  if (!carried) return first;
  assigned.length = 0;
  const locale = first.pathname.startsWith("/fr/") ? "fr" : "en";
  assignPostAuthDest(localizeAuthDest(sanitizePostLoginNext(carried) ?? "/parent", locale));
  return resolved(assigned.at(-1));
}

const directPaths = [
  ["slash-backslash host", "/\\evil.example"],
  ["slash-backslash session page", "/\\evil.example/session-expired"],
  ["slash-backslash with query and hash", "/\\evil.example/session-expired?x=1#pay"],
  ["two backslashes", "/\\\\evil.example"],
  ["tab before the second slash", "/\t/evil.example"],
  ["newline before the second slash", "/\n/evil.example"],
  ["carriage return before the second slash", "/\r/evil.example"],
  ["tab before a backslash", "/\t\\evil.example"],
  ["auth page wrapping the host", "/login?next=/\\evil.example/session-expired"],
  ["encoded host wrapped by the auth page", "/login?next=%2F%5Cevil.example%2Fsession-expired"],
];

const queries = [
  ["encoded slash and backslash", "?next=%2F%5Cevil.example%2Fsession-expired"],
  ["encoded tab and slash", "?next=%2F%09%2Fevil.example"],
  ["encoded newline and slash", "?next=%2F%0A%2Fevil.example"],
  ["encoded carriage return and slash", "?next=%2F%0D%2Fevil.example"],
  ["encoded auth wrapper", "?next=%2Flogin%3Fnext%3D%2F%5Cevil.example"],
];

const roles = ["parent", "provider", "admin", "support", "guest"];

test("login next values that the URL parser treats as another host stay on this site", async () => {
  const leaks = [];
  const note = (step, label, value) => {
    if (onApp(value)) return;
    leaks.push(`${label} via ${step} -> ${resolved(value).href}`);
  };

  for (const [label, next] of directPaths) {
    note("sanitizePostLoginNext", label, sanitizePostLoginNext(next));
    note("pathnameOfDest", label, pathnameOfDest(next));
    assigned.length = 0;
    assignPostAuthDest(next);
    note("assignPostAuthDest raw", label, assigned.at(-1));
    note("verify2faSearchNext", label, verify2faSearchNext(next));
    note("resolvePostLoginPath", label, resolvePostLoginPath({ next, role: "parent" }));
    for (const role of roles) {
      const returned = destinationAfterSignIn({
        role: role === "guest" ? null : role,
        next: sanitizePostLoginNext(next) ?? next,
        ownsCentre: role === "provider",
        locale: "en",
      });
      note(`destinationAfterSignIn:${role}`, label, returned);
      assigned.length = 0;
      assignPostAuthDest(returned);
      note(`assignPostAuthDest:${role}`, label, assigned.at(-1));
      assigned.length = 0;
      globalThis.__kideaseRedirectProfile = profileFor(role);
      globalThis.window.location.search = `?next=${encodeURIComponent(next)}`;
      await continueAfterSignIn({
        next,
        role: role === "guest" || role === "support" ? null : role,
        locale: role === "parent" ? "fr" : "en",
        method: "session",
      });
      const landed = navigationOf(assigned.at(-1));
      if (landed.origin !== APP_ORIGIN) {
        leaks.push(`${label} via continueAfterSignIn:${role} -> ${landed.href}`);
      }
      const timeoutDest = localePath(
        resolvePostLoginPath({ next, role: role === "guest" || role === "support" ? null : role }),
        role === "parent" ? "fr" : "en",
      );
      assigned.length = 0;
      assignPostAuthDest(timeoutDest);
      note(`login timeout:${role}`, label, assigned.at(-1));
    }
  }

  for (const [label, query] of queries) {
    const parsed = defaultParseSearch(query);
    const validated = loginValidateSearch(parsed);
    note("loginValidateSearch", label, validated.next);
    globalThis.__kideaseRedirectProfile = profileFor("parent");
    globalThis.window.location.search = query;
    assigned.length = 0;
    await continueAfterSignIn({ next: validated.next, role: "parent", locale: "en", method: "email" });
    const landed = navigationOf(assigned.at(-1));
    if (landed.origin !== APP_ORIGIN) leaks.push(`${label} via parsed login next -> ${landed.href}`);
  }

  assert.deepEqual(leaks, []);
});

test("the login route parser keeps an encoded next on this site", async () => {
  const rootRoute = createRootRoute();
  const login = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    validateSearch: loginValidateSearch,
  });
  const history = createMemoryHistory({
    initialEntries: ["/login?next=%2F%5Cevil.example%2Fsession-expired"],
  });
  const router = createRouter({ routeTree: rootRoute.addChildren([login]), history });
  await router.load();
  const search = router.state.location.search;
  assert.equal(onApp(search.next), true, search.next ? resolved(search.next).href : "missing next");
});

test("a real return path still comes back, and a scheme or double slash does not", async () => {
  assert.equal(sanitizePostLoginNext("/parent"), "/parent");
  assert.equal(sanitizePostLoginNext("/search?q=winnipeg"), "/search?q=winnipeg");
  assert.equal(sanitizePostLoginNext("/daycare/river-park"), "/daycare/river-park");
  assert.equal(sanitizePostLoginNext("//evil.example"), null);
  assert.equal(sanitizePostLoginNext("https://evil.example"), null);
  assert.equal(sanitizePostLoginNext("\\\\evil.example"), null);

  assert.equal(destinationAfterSignIn({ role: "parent", next: "/parent" }), "/parent");
  assert.equal(destinationAfterSignIn({ role: "parent", next: "/parent", locale: "fr" }), "/fr/parent");
  assert.equal(destinationAfterSignIn({ role: "provider", next: "/provider", ownsCentre: true }), "/provider");
  assert.equal(destinationAfterSignIn({ role: "government", next: "/\\evil.example" }), "/gov");
  assert.equal(loginValidateSearch({ next: "/search?q=winnipeg" }).next, "/search?q=winnipeg");
  assert.equal(loginValidateSearch(defaultParseSearch("?next=%2Fparent")).next, "/parent");

  assigned.length = 0;
  assignPostAuthDest("/parent?tab=saved");
  assert.equal(assigned.at(-1), "/parent?tab=saved");
  assert.equal(resolved(assigned.at(-1)).origin, APP_ORIGIN);

  globalThis.__kideaseRedirectProfile = profileFor("parent");
  assigned.length = 0;
  await continueAfterSignIn({ next: "/search?q=winnipeg", role: "parent", locale: "en", method: "session" });
  assert.equal(navigationOf(assigned.at(-1)).href, `${APP_ORIGIN}/search?q=winnipeg`);
});
