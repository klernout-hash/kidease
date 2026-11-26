import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("booking answers map onto the parent's request card", () => {
  const src = readFileSync(join(root, "src/lib/server/pipeline-sync.ts"), "utf8");
  assert.match(src, /status === "accepted" \|\| status === "active"\) return "confirmed"/);
  assert.match(src, /status === "declined" \|\| status === "cancelled"\) return "declined"/);
  assert.match(src, /source_kind = 'booking'/);
});
