import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { funnelDestPath } from "../src/lib/desks.ts";
import { guestPathKind } from "../src/lib/access-control.ts";
import { SITEMAP_STATIC_PATHS } from "../src/lib/sitemap.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("PIPEDA / store-review delete-account URL is a real public route", () => {
  assert.equal(existsSync(join(root, "src/routes/delete-account.tsx")), true);
  assert.equal(existsSync(join(root, "src/components/delete-account-panel.tsx")), true);
  assert.match(src("src/routes/delete-account.tsx"), /createFileRoute\("\/delete-account"\)/);
  assert.match(src("src/routeTree.gen.ts"), /id: '\/delete-account'/);
  assert.match(src("src/lib/copy.ts"), /deleteAccountGuestLead:/);
  assert.match(src("src/lib/copy.ts"), /deleteAccountSignIn:/);
  assert.match(src("src/lib/copy.ts"), /Se connecter pour supprimer mon compte/);
});

test("menu, legal, footer, and parent desk all point at /delete-account", () => {
  assert.match(src("src/routes/menu.tsx"), /to="\/delete-account"/);
  assert.doesNotMatch(src("src/routes/menu.tsx"), /to="\/account"[\s\S]{0,80}deleteAccount/);
  assert.match(src("src/components/legal-doc.tsx"), /to="\/delete-account"/);
  assert.match(src("src/components/site-footer.tsx"), /to="\/delete-account"/);
  assert.match(src("src/components/parent-desk.tsx"), /to="\/delete-account"/);
  assert.doesNotMatch(src("src/components/parent-desk.tsx"), /deleteAccount\(\)/);
});

test("sitemap and legal copy advertise the same path; guests stay public", () => {
  assert.ok(SITEMAP_STATIC_PATHS.includes("/delete-account"));
  assert.ok(SITEMAP_STATIC_PATHS.includes("/unsubscribe"));
  assert.match(src("public/sitemap.xml"), /https:\/\/www\.kidease\.ca\/delete-account/);
  assert.match(src("src/lib/legal-copy.ts"), /\/delete-account/);
  assert.equal(guestPathKind("/delete-account"), "public");
  assert.equal(guestPathKind("/unsubscribe"), "public");
  assert.equal(funnelDestPath("/delete-account"), "/delete-account");
  assert.equal(funnelDestPath("/unsubscribe"), "/unsubscribe");
});
