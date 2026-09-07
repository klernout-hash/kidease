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

test("verify-2fa auto-start keys off user.id and does not remint while waiting", () => {
  assert.match(routeFile, /startTwoFactor\(\{\s*data:\s*\{\s*force:\s*false\s*\}\s*\}\)/);
  assert.match(routeFile, /startTwoFactor\(\{\s*data:\s*\{\s*force:\s*true\s*\}\s*\}\)/);
  assert.match(routeFile, /let cancelled = false/);
  assert.match(routeFile, /\[\s*user\?\.id\s*\]/);
  assert.doesNotMatch(routeFile, /useEffect\(\(\) => \{[\s\S]*?\}, \[user\]\)/);
});

test("startTwoFactor reuses an unexpired challenge unless force is set", () => {
  const twoFa = readFileSync(join(root, "src/lib/server/two-factor.ts"), "utf8");
  assert.match(twoFa, /force\?:\s*boolean/);
  assert.match(twoFa, /!data\.force/);
  assert.match(twoFa, /expires_at/);
  assert.match(twoFa, /attempts < MAX_ATTEMPTS/);
  assert.match(twoFa, /reused:\s*true/);
});
