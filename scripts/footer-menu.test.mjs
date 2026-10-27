import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { footerLinkHrefs, footerLinksForShell, mobileMenuHrefs } from "../src/lib/site-footer-nav.ts";

const root = new URL("../", import.meta.url);

function source(path) {
  return readFileSync(new URL(path, root), "utf8");
}

test("every footer link href exists in the mobile menu", () => {
  const menu = new Set(mobileMenuHrefs());
  const missing = footerLinkHrefs().filter((href) => !menu.has(href));
  assert.deepEqual(missing, []);
});

test("with plans on, the phone menu shows every footer href", () => {
  const shown = new Set(footerLinksForShell({ native: false, plansOn: true }).map((link) => link.to));
  for (const href of footerLinkHrefs()) {
    assert.equal(shown.has(href), true, href);
  }
});

test("hamburger, account, and the app menu render that list", () => {
  const more = source("src/components/footer-more-links.tsx");
  const drawer = source("src/components/nav-drawer.tsx");
  assert.match(more, /footerLinksForShell/);
  assert.match(more, /data-ke="mobile-menu-links"/);
  assert.match(drawer, /<FooterMoreLinks/);
  assert.equal((drawer.match(/<FooterMoreLinks/g) ?? []).length, 1);
  assert.match(source("src/routes/account.tsx"), /<FooterMoreLinks/);
  assert.match(source("src/routes/menu.tsx"), /<FooterMoreLinks/);
  assert.match(source("src/styles.css"), /html\[data-channel="app"\] \.ke-site-footer/);
});

test("native shell hides donate the same way the footer does", () => {
  const shown = footerLinksForShell({ native: true, plansOn: false }).map((link) => link.to);
  assert.equal(shown.includes("/donate"), false);
  assert.equal(shown.includes("/plans"), false);
  assert.equal(shown.includes("/help"), true);
  assert.equal(shown.includes("/report"), true);
});
