/**
 * Every third-party GitHub Action is pinned to a full commit SHA with a
 * `# vX.Y.Z` comment (handoff S9). Local composite actions (./…) are exempt.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function yamlFiles(dir) {
  return readdirSync(join(root, dir), { recursive: true })
    .map(String)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => join(dir, f));
}

const files = [...yamlFiles(".github/workflows"), ...yamlFiles(".github/actions")];

test("third-party actions are pinned to a commit SHA with a version comment", () => {
  const loose = [];
  let pinned = 0;
  for (const file of files) {
    const lines = readFileSync(join(root, file), "utf8").split("\n");
    lines.forEach((line, i) => {
      const m = line.match(/^\s*-?\s*uses:\s*["']?([^\s"'#]+)["']?\s*(#.*)?$/);
      if (!m) return;
      const ref = m[1];
      if (ref.startsWith("./") || ref.startsWith("docker://")) return;
      if (/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(ref) && /^# v\d+(\.\d+){0,2}$/.test(m[2] || "")) {
        pinned += 1;
        return;
      }
      loose.push(`${file}:${i + 1} ${line.trim()}`);
    });
  }
  assert.deepEqual(loose, []);
  assert.ok(pinned > 0);
});

test("dependency review runs on PRs with no secrets and explicit waivers", () => {
  const wf = readFileSync(join(root, ".github/workflows/dependency-review.yml"), "utf8");
  assert.match(wf, /pull_request:/);
  assert.match(wf, /permissions:\n {2}contents: read/);
  assert.doesNotMatch(wf, /secrets\./);
  assert.match(wf, /fail-on-severity: high/);
  assert.match(wf, /allow-ghsas:/);
});
