import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("daycare account settings stays on the daycare profile", () => {
  const menu = src("src/components/app-menu-screen.tsx");
  assert.match(menu, /desk: "director"/);
  assert.match(menu, /highlight === "create"/);
  assert.match(menu, /label=\{t\("children"\)\}/);
  assert.match(menu, /search=\{\{ tab: "children" \}\}/);
});

test("parent profile lists children and the phone switch sits in the page", () => {
  const account = src("src/routes/account.tsx");
  const pill = src("src/components/role-switch-pill.tsx");
  assert.match(account, /<ProfileChildren /);
  assert.match(account, /<RoleSwitchPill placement="flow" \/>/);
  assert.match(pill, /placement === "fixed" && onAccount/);
  assert.match(src("src/components/profile-children.tsx"), /profileAddChild/);
  assert.match(src("src/components/profile-children.tsx"), /MAX_CHILDREN_PER_PARENT/);
  assert.match(src("src/routes/parent.tsx"), /initialChild/);
});

test("statements are a period list, not a second earnings hero", () => {
  const menu = src("src/routes/menu.tsx");
  const earnings = src("src/components/host-earnings-screen.tsx");
  const statement = src("src/components/earnings-statement.tsx");
  assert.match(menu, /EarningsStatementsScreen/);
  assert.match(menu, /view === "statement" && !period/);
  assert.match(earnings, /statementsViewAll/);
  assert.match(earnings, /view: "statement" \}/);
  assert.doesNotMatch(earnings, /period: statement\.period/);
  assert.match(statement, /data-ke="earnings-statements"/);
  assert.match(statement, /data-ke="statement-download"/);
  assert.match(statement, /statementsMissingTitle/);
});

test("login does not evaluate node crypto while the route tree loads", () => {
  const fraud = src("src/lib/server/fraud-queue.ts");
  const reauth = src("src/lib/reauth.ts");
  const hydrate = src("src/lib/catalog-hydrate.ts");
  const vite = src("vite.config.ts");
  const stub = src("scripts/client-node-stub.mjs");
  assert.doesNotMatch(fraud, /import \{ createHash \} from "node:crypto"/);
  assert.match(fraud, /await import\("node:crypto"\)/);
  assert.doesNotMatch(reauth, /from "node:crypto"/);
  assert.doesNotMatch(hydrate, /from "node:fs\/promises"/);
  assert.match(vite, /clientNodeBuiltinStub/);
  assert.match(stub, /applyToEnvironment/);
  assert.match(stub, /rewriteNodeBuiltinImports/);
});
