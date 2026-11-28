import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/merge-gate.yml", import.meta.url), "utf8");
const gate = workflow.split("        run: |\n")[1].replace(/^ {10}/gm, "");
const fixture = `
gh() {
  if [[ "$*" == *"/files?per_page=100" ]]; then
    printf '%s\\n' "$FILES"
  else
    printf '%s\\n' "$PR_DATA"
  fi
}
`;

function runGate(labels, files, changedFiles = files.length) {
  return spawnSync("bash", ["-c", fixture + gate], {
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_REPOSITORY: "example/kidease",
      PR: "1",
      FILES: JSON.stringify([files]),
      PR_DATA: JSON.stringify({
        head: { sha: "head" },
        base: { sha: "base" },
        labels: labels.map((name) => ({ name })),
        changed_files: changedFiles,
      }),
    },
  });
}

test("merge gate blocks every hold even when database approval is present", () => {
  for (const hold of ["hold", "DO-NOT-MERGE", "needs-migration-approval", "needs-kyle"]) {
    const result = runGate([hold, "db-approved"], []);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /merge hold/);
  }
});

test("merge gate checks changed and original paths for database changes", () => {
  for (const change of [
    { filename: "migrations/0237.sql" },
    { filename: "migrations-rls/policies.sql" },
    { filename: "src/lib/db.ts" },
    { filename: "src/lib/server/runtime-schema.ts" },
    { filename: "archive/sql", previous_filename: "migrations/0237.sql" },
  ]) {
    const denied = runGate([], [change]);
    assert.equal(denied.status, 1);
    assert.match(denied.stdout, /db-approved/);
    assert.equal(runGate(["db-approved"], [change]).status, 0);
  }
});

test("merge gate allows ordinary changes and fails closed on an incomplete file list", () => {
  assert.equal(runGate([], [{ filename: "src/lib/db-utils.ts" }]).status, 0);
  const incomplete = runGate([], [], 1);
  assert.equal(incomplete.status, 1);
  assert.match(incomplete.stdout, /incomplete/);
});
