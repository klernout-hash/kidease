import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("declined claims keep Approve and hide Waiting/Decline as live actions", () => {
  const ui = readFileSync(join(root, "src/routes/admin.tsx"), "utf8");
  assert.match(ui, /disabled=\{busy !== null \|\| status === "declined"\}/);
  assert.match(ui, /c\.reviewNote/);
  assert.match(ui, /c\.reviewedAt/);
  const server = readFileSync(join(root, "src/lib/server/admin-centres.ts"), "utf8");
  assert.match(server, /c\.reviewed_at/);
  assert.match(server, /c\.review_note/);
  assert.doesNotMatch(server, /null::timestamptz as reviewed_at/);
});
