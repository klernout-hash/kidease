import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("every page nested under the daycare desk is handed to the outlet", () => {
  const routes = new URL("../src/routes/", import.meta.url);
  const nested = readdirSync(routes)
    .map((name) => /^provider\.([a-z-]+)\.tsx$/.exec(name)?.[1])
    .filter(Boolean);
  assert.ok(nested.includes("leads"));
  const src = readFileSync(new URL("provider.tsx", routes), "utf8");
  const line = /const childRoute = \[([^\]]+)\]/.exec(src)?.[1] ?? "";
  for (const name of nested) assert.match(line, new RegExp(`"/provider/${name}"`), `${name} is missing from childRoute`);
  assert.match(src, /if \(childRoute\) return <Outlet \/>;/);
});
