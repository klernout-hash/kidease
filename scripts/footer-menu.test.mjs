import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FOOTER_SUPPORT, GUEST_DRAWER_FOOTER_OMIT, footerLinkHrefs, footerLinksForShell, footerMenuGroupsForShell, guestDrawerMenuGroupsForShell, mobileMenuHrefs } from "../src/lib/site-footer-nav.ts";

const root = new URL("../", import.meta.url);

function source(path) {
  return readFileSync(new URL(path, root), "utf8");
}

test("every footer link href exists in the mobile menu", () => {
  const menu = new Set(mobileMenuHrefs());
  const missing = footerLinkHrefs().filter((href) => !menu.has(href));
  assert.deepEqual(missing, []);
});

test("guest drawer has one Find care, Daycares, and Help group without losing Map or footer routes", () => {
  const key = (link) => `${link.to}|${JSON.stringify(link.search ?? {})}`;
  for (const native of [false, true]) {
    for (const plansOn of [false, true]) {
      const input = { native, plansOn };
      const groups = [
        ...guestDrawerMenuGroupsForShell(input),
        ...footerMenuGroupsForShell({ ...input, omit: GUEST_DRAWER_FOOTER_OMIT }),
      ];
      for (const titleKey of ["navFindCare", "navForDaycares", "menuGetHelp"]) {
        assert.equal(groups.filter((group) => group.titleKey === titleKey).length, 1, titleKey);
      }
      const shown = groups.flatMap((group) => group.links);
      const keys = shown.map(key);
      assert.equal(new Set(keys).size, keys.length);
      for (const link of footerLinksForShell(input)) assert.equal(keys.includes(key(link)), true, key(link));
      assert.equal(shown.filter((link) => link.to === "/search" && link.search?.view === "map").length, 1);
      assert.equal(shown.some((link) => link.to === "/benefits"), true);
      assert.equal(shown.some((link) => link.to === "/verify"), true);
      assert.equal(shown.some((link) => link.to === "/start-a-daycare"), true);
    }
  }
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
  assert.match(more, /footerMenuGroupsForShell/);
  assert.match(more, /data-ke="mobile-menu-links"/);
  assert.match(drawer, /<FooterMoreLinks/);
  assert.equal((drawer.match(/<FooterMoreLinks/g) ?? []).length, 1);
  assert.doesNotMatch(source("src/routes/account.tsx"), /FooterMoreLinks/);
  assert.match(source("src/routes/account.tsx"), /ProfileHeroCard/);
  assert.match(source("src/components/profile-hero.tsx"), /data-ke="profile-hero"/);
  assert.match(source("src/lib/app-menu.ts"), /menuGroupLinks/);
  assert.match(source("src/components/app-menu-screen.tsx"), /menuGroupLinks/);
  assert.match(source("src/styles.css"), /html\[data-channel="app"\] \.ke-site-footer/);
});

test("drawer help links stay together once for guests and signed-in users", () => {
  const expected = FOOTER_SUPPORT.map((link) => link.to);
  const omissions = [
    [],
    ["/search"],
    ["/search", "/cities", "/compare", "/tour-checklist", "/claim", "/plans", "/jobs"],
  ];
  for (const native of [false, true]) {
    for (const plansOn of [false, true]) {
      for (const omit of omissions) {
        const groups = footerMenuGroupsForShell({ native, plansOn, omit });
        const help = groups.filter((group) => group.titleKey === "menuGetHelp");
        assert.equal(help.length, 1);
        assert.deepEqual(help[0].links.map((link) => link.to), expected);
        const hrefs = groups.flatMap((group) => group.links.map((link) => link.to));
        for (const href of expected) assert.equal(hrefs.filter((value) => value === href).length, 1, href);
        assert.equal(groups.every((group) => group.links.length > 0), true);
      }
    }
  }
  assert.doesNotMatch(source("src/components/nav-drawer.tsx"), /drawer-help-links|marker="drawer-help"/);
  assert.match(source("src/components/role-nav.tsx"), /item\.id === "help" && appearance === "drawer"/);
});

test("native shell hides donate the same way the footer does", () => {
  const shown = footerLinksForShell({ native: true, plansOn: false }).map((link) => link.to);
  assert.equal(shown.includes("/donate"), false);
  assert.equal(shown.includes("/plans"), false);
  assert.equal(shown.includes("/help"), true);
  assert.equal(shown.includes("/report"), true);
});
