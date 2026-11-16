import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { visibleDeskGroups, visibleDeskNav } from "../src/lib/desk-nav.ts";
import { isAdminDeskTab } from "../src/lib/account-notify.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("admin payments stay on the admin desk and users are in the open menu", () => {
  const items = visibleDeskNav("admin");
  const byId = Object.fromEntries(items.map((item) => [item.id, item]));
  assert.equal(byId.connect?.href, "/admin");
  assert.equal(byId.connect?.search?.tab, "payouts");
  assert.equal(byId.people?.href, "/admin");
  assert.equal(byId.people?.search?.tab, "people");
  assert.equal(isAdminDeskTab("payouts"), true);
  const ops = visibleDeskGroups("admin", items).find((row) => row.group.id === "ops");
  assert.deepEqual(ops?.items.map((item) => item.id), ["queue", "people", "connect", "mail"]);
  assert.equal(ops?.group.open, true);
  assert.notEqual(byId.connect?.search?.desk, "money");
});

test("features explain env as the source and PostHog as optional", () => {
  const controls = read("src/components/admin-feature-controls.tsx");
  const en = read("src/lib/copy-en.ts");
  const fr = read("src/lib/copy-fr.ts");
  assert.match(controls, /source: env/);
  assert.match(controls, /copy\.sourceEnv/);
  assert.match(en, /A PostHog override is optional/);
  assert.match(fr, /Un remplacement PostHog est facultatif/);
  assert.doesNotMatch(en, /you cannot change a feature yet/);
});

test("unconfigured admin mail is a setup note, and headings can wrap", () => {
  const mail = read("src/components/admin-mail.tsx");
  assert.match(mail, /data-ke="admin-mail-unconfigured"/);
  assert.match(mail, /Mail inside KidEase is not connected on this site/);
  assert.doesNotMatch(mail, /Set TITAN_APP_PASSWORD/);
  const css = read("src/styles.css");
  assert.match(css, /\.ke-admin-wrap :is\(h1, h2, h3, h4\)/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(read("src/components/desk-shell.tsx"), /ke-admin-wrap/);
  assert.match(read("src/components/admin-desk-page.tsx"), /Linked daycare/);
  assert.match(read("src/lib/server/admin-payouts.ts"), /requireAdmin/);
  assert.doesNotMatch(read("src/lib/server/admin-payouts.ts"), /stripeRequest|sk_live_|sk_test_/);
});
