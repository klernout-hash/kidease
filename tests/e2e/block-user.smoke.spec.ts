/**
 * Live check for the safety help section. Loaded by scripts/block-user.test.mjs.
 * Set BASE_URL to hit a running KidEase server.
 */
import assert from "node:assert/strict";
import test from "node:test";

test("e2e: help safety section is on the page", async () => {
  const base = process.env.BASE_URL;
  if (!base) return;
  const res = await fetch(new URL("/help", base));
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Safety and reporting|Sécurité et signalement/);
  assert.match(html, /both ways|deux sens/);
});
