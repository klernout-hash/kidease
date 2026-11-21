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
  const brace = locked("brace-expansion");
  const allowed = new Set(["1.1.21", "2.1.7", "5.0.12"]);
  assert.ok(brace.length > 0);
  for (const version of brace) assert.ok(allowed.has(version), version);
  assert.ok(brace.includes("1.1.21"));
  assert.ok(brace.includes("5.0.12"));
  const uuid = locked("uuid");
  for (const version of uuid) assert.equal(version, "11.1.1");
  if (uuid.length === 0) {
    assert.equal(pkg.overrides.uuid, "11.1.1");
  } else {
    assert.deepEqual(uuid, ["11.1.1"]);
  }
});
