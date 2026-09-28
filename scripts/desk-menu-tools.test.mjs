import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("menu desk tools is a grouped list, not a null placeholder", () => {
  const tools = src("src/components/menu-desk-tools.tsx");
  assert.match(tools, /data-ke="desk-menu-tools"/);
  assert.match(tools, /data-ke="desk-menu-group"/);
  assert.doesNotMatch(tools, /return null;/);
  assert.match(tools, /Waiting on you/);
  assert.match(tools, /Open parent desk/);
  assert.match(tools, /Open daycare desk/);
  assert.match(tools, /deskNavAddListing/);
  assert.match(tools, /children/);
});

test("admin idle timeout is a full screen, not a banner under pills", () => {
  const idle = src("src/components/admin-idle-screen.tsx");
  assert.match(idle, /data-ke="admin-idle-screen"/);
  assert.match(idle, /ADMIN_LOGIN_SEARCH/);
  assert.match(idle, /Sign in again/);
  assert.doesNotMatch(idle, /rounded-xl bg-surface[\s\S]*timed out/);
});
