import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("B1: /logout and /fr/logout route files exist", () => {
  assert.ok(existsSync(join(root, "src/routes/logout.tsx")));
  assert.ok(existsSync(join(root, "src/routes/fr.logout.tsx")));
  assert.match(src("src/routes/logout.tsx"), /createFileRoute\("\/logout"\)/);
  assert.match(src("src/routes/fr.logout.tsx"), /createFileRoute\("\/fr\/logout"\)/);
});

test("B1 / N-37: the page signs out to the sign-in page in its language and shows a status", () => {
  const route = src("src/routes/logout.tsx");
  assert.match(route, /signOut\(login\)/);
  assert.match(route, /const login = signedOutLoginPath\(locale\)/);
  assert.match(route, /useEffect/);
  assert.match(route, /t\("logoutSigningOut"\)/);
  assert.match(src("src/routes/fr.logout.tsx"), /<LogoutScreen locale="fr" \/>/);
  assert.match(src("src/lib/copy-en.ts"), /logoutSigningOut: "Signing you out…"/);
  assert.match(src("src/lib/copy-fr.ts"), /logoutSigningOut: "Déconnexion…"/);
});

test("B1: both routes are noindex", () => {
  assert.match(src("src/routes/logout.tsx"), /name: "robots", content: "noindex, nofollow"/);
  assert.match(src("src/routes/logout.tsx"), /head: \(\) => logoutHead\(/);
  assert.match(src("src/routes/fr.logout.tsx"), /head: \(\) => logoutHead\(/);
});

test("B1: beforeLoad ends the session on the server too", () => {
  assert.match(src("src/routes/logout.tsx"), /beforeLoad: logoutBeforeLoad/);
  assert.match(src("src/routes/fr.logout.tsx"), /beforeLoad: logoutBeforeLoad/);
  assert.match(src("src/routes/logout.tsx"), /await endSessionForLogout\(\)/);
  const server = src("src/lib/server/logout.ts");
  assert.match(server, /sessionBearerMiddleware/);
  assert.match(server, /endCurrentWebSession/);
  const persistent = src("src/lib/server/persistent-session.server.ts");
  const fn = persistent.slice(persistent.indexOf("export async function endCurrentWebSession"));
  assert.match(fn, /delete from "session" where token = \$\{token\} and "userId" = \$\{user\.id\}/);
  assert.match(fn, /revoke_reason = \$\{"logout"\}/);
  assert.match(fn, /expirePair\(SESSION_TOKEN_COOKIE, SHARED_SESSION_TOKEN_COOKIE\)/);
  assert.match(fn, /expirePair\(REFRESH_TOKEN_COOKIE, SHARED_REFRESH_TOKEN_COOKIE\)/);
});

test("B1: routeTree.gen.ts registers both routes", () => {
  const tree = src("src/routeTree.gen.ts");
  assert.match(tree, /import \{ Route as LogoutRouteImport \} from '\.\/routes\/logout'/);
  assert.match(tree, /import \{ Route as FrLogoutRouteImport \} from '\.\/routes\/fr\.logout'/);
  assert.match(tree, /fullPath: '\/logout'/);
  assert.match(tree, /fullPath: '\/fr\/logout'/);
  assert.match(tree, /LogoutRoute: LogoutRoute,/);
  assert.match(tree, /FrLogoutRoute: FrLogoutRoute,/);
});
