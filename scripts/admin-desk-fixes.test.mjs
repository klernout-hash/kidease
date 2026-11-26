import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("admin #33: /admin-chat keeps the admin guard and shows a moved screen in production, no redirect", () => {
  const page = src("src/routes/admin-chat.tsx");
  assert.ok(!/redirect\(/.test(page));
  assert.match(page, /await beforeLoadAdminDesk\(\);/);
  assert.match(page, /if \(import\.meta\.env\.PROD\) return <AdminChatMoved \/>;/);
  assert.match(page, /to="\/admin-support"/);
});
