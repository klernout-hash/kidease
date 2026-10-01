import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { clientDbProblems } from "./check-client-db.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("client bundle check flags schema SQL and PGLite binaries", () => {
  assert.deepEqual(
    clientDbProblems([
      { name: "assets/db-abc.js", text: "create table if not exists _migrations" },
      { name: "assets/app.js", text: "find daycare" },
    ]),
    ["assets/db-abc.js matches /create table/i"],
  );
  assert.deepEqual(clientDbProblems([{ name: "assets/initdb-abc.wasm", text: "" }]), [
    "assets/initdb-abc.wasm is a database binary",
  ]);
  assert.deepEqual(clientDbProblems([{ name: "assets/pglite-abc.data", text: "" }]), [
    "assets/pglite-abc.data is a database binary",
  ]);
  assert.deepEqual(clientDbProblems([{ name: "assets/index.js", text: 'import("@electric-sql/pglite")' }]), [
    'assets/index.js matches /@electric-sql\\/pglite/',
  ]);
  assert.deepEqual(clientDbProblems([{ name: "assets/index.js", text: "Licensed daycare near you" }]), []);
});

test("db.ts does not embed migrations; the server module does", () => {
  const db = readFileSync(join(root, "src/lib/db.ts"), "utf8");
  const pglite = readFileSync(join(root, "src/lib/server/pglite-sql.ts"), "utf8");
  assert.doesNotMatch(db, /import\.meta\.glob/);
  assert.match(db, /import\.meta\.env\.SSR/);
  assert.match(db, /openPgliteSql/);
  assert.match(pglite, /import\.meta\.glob\("\/migrations\/\*\.sql"/);
  assert.match(readFileSync(join(root, "package.json"), "utf8"), /check-client-db\.mjs/);
});
