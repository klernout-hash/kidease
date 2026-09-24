import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { config } from "zod";
import "../src/lib/zod-csp.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("zod skips the new Function probe under CSP", () => {
  assert.equal(config().jitless, true);
  const client = readFileSync(join(root, "src/client.tsx"), "utf8");
  const cspAt = client.indexOf('import { zodCspInstalled } from "./lib/zod-csp"');
  const sentryAt = client.indexOf('import "./instrument.client"');
  assert.ok(cspAt >= 0 && sentryAt > cspAt);
});
