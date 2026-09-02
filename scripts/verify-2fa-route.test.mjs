import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const routeFile = readFileSync(join(root, "src/routes/verify-2fa.tsx"), "utf8");
const routeTree = readFileSync(join(root, "src/routeTree.gen.ts"), "utf8");
const login = readFileSync(join(root, "src/routes/login.tsx"), "utf8");
const gates = readFileSync(join(root, "src/lib/auth/gates.tsx"), "utf8");

test("verify-2fa is a real file route", () => {
  assert.match(routeFile, /createFileRoute\("\/verify-2fa"\)/);
});

test("routeTree.gen.ts registers /verify-2fa so Production does not 404", () => {
  assert.match(routeTree, /from '\.\/routes\/verify-2fa'/);
  assert.match(routeTree, /id:\s*'\/verify-2fa'/);
  assert.match(routeTree, /path:\s*'\/verify-2fa'/);
  assert.match(routeTree, /fullPath:\s*'\/verify-2fa'/);
  assert.match(routeTree, /Verify2faRoute/);
});

test("operator sign-in still sends users through /verify-2fa", () => {
  assert.match(login, /\/verify-2fa\?next=/);
  assert.match(gates, /to="\/verify-2fa"/);
});

test("regenerating the tree did not drop /get-app", () => {
  assert.match(routeTree, /from '\.\/routes\/get-app'/);
  assert.match(routeTree, /id:\s*'\/get-app'/);
});
