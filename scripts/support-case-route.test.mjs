import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("a support case is its own page, not a child of the inbox", () => {
  const tree = read("src/routeTree.gen.ts");
  const english = tree.slice(tree.indexOf("const SupportCaseIdRoute ="));
  assert.match(english, /getParentRoute: \(\) => rootRouteImport/);
  assert.doesNotMatch(english.slice(0, 400), /getParentRoute: \(\) => SupportRoute/);
  assert.match(tree, /fullPath: '\/support\/\$caseId'/);
  assert.match(tree, /fullPath: '\/fr\/support\/\$caseId'/);
  assert.match(tree, /parentRoute: typeof rootRouteImport/);
  const support = read("src/routes/support.tsx");
  assert.doesNotMatch(support, /<Outlet/);
  assert.match(read("src/routes/support_.$caseId.tsx"), /data-ke="support-case"/);
  assert.match(read("src/routes/fr.support_.$caseId.tsx"), /SupportCaseScreen/);
  assert.match(read("src/components/support-desk.tsx"), /data-ke="support-inbox"/);
  assert.match(read("scripts/e2e-smoke.mjs"), /openSupportCase\(page, base, "\/support\/sc_e2e", 1280\)/);
  assert.match(read("scripts/e2e-smoke.mjs"), /openSupportCase\(page, base, "\/support\/sc_e2e", 390\)/);
});
