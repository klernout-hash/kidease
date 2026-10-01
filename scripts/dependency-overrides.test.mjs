import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));

function locked(name) {
  const versions = [];
  for (const [path, meta] of Object.entries(lock.packages)) {
    if (path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`)) {
      versions.push(meta.version);
    }
  }
  return versions;
}

test("security overrides pin the patched js-yaml, brace-expansion, xmldom, and uuid", () => {
  assert.equal(pkg.overrides["js-yaml"], "4.3.2");
  assert.equal(pkg.overrides["@xmldom/xmldom"], "0.9.12");
  assert.equal(pkg.overrides["brace-expansion@1"], "1.1.21");
  assert.equal(pkg.overrides["brace-expansion@2"], "2.1.7");
  assert.equal(pkg.overrides["brace-expansion@5"], "5.0.12");
  assert.equal(pkg.overrides.uuid, "11.1.1");

  assert.deepEqual(locked("js-yaml"), ["4.3.2"]);
  assert.deepEqual(locked("@xmldom/xmldom"), ["0.9.12"]);
  assert.deepEqual(new Set(locked("brace-expansion")), new Set(["1.1.21", "2.1.7", "5.0.12"]));
  assert.deepEqual(locked("uuid"), ["11.1.1"]);
});
