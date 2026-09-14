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

test("in-app Delete my account lives on Account only; public footer and desks do not", () => {
  const account = src("src/routes/account.tsx");
  const parentDesk = src("src/components/parent-desk.tsx");
  const menu = src("src/routes/menu.tsx");
  assert.match(account, /data-ke="account-delete"/);
  assert.match(account, /to="\/delete-account"/);
  assert.doesNotMatch(account, /deleteAccount\(\)/);
  assert.doesNotMatch(parentDesk, /deleteAccount/);
  assert.doesNotMatch(parentDesk, /delete-account/);
  assert.doesNotMatch(menu, /to="\/delete-account"/);
  assert.doesNotMatch(menu, /deleteAccount/);
  assert.match(src("src/components/legal-doc.tsx"), /to="\/delete-account"/);
  assert.doesNotMatch(src("src/lib/site-footer-nav.ts"), /delete-account/);
  assert.doesNotMatch(src("src/components/site-footer.tsx"), /delete-account/);
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
