import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { frAdminRedirectHref } from "../src/lib/fr-admin-redirect.ts";
import { destinationAfterSignIn } from "../src/lib/role-access.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

test("/fr/admin* goes to the same English admin path and query", () => {
  assert.equal(frAdminRedirectHref("/fr/admin", ""), "/admin");
  assert.equal(frAdminRedirectHref("/fr/admin/", ""), "/admin");
  for (const tab of ["queue", "verify", "mail", "people", "payouts"]) {
    assert.equal(frAdminRedirectHref("/fr/admin", `?tab=${tab}`), `/admin?tab=${tab}`);
  }
  for (const page of ["truth", "spam", "trust", "vacancies", "ranking", "qc-home", "support", "triage", "ai", "email-health"]) {
    assert.equal(frAdminRedirectHref(`/fr/admin-${page}`, ""), `/admin-${page}`);
  }
  assert.equal(frAdminRedirectHref("/fr/admin/government", ""), "/admin/government");
  assert.equal(frAdminRedirectHref("/fr/admin/features", "?x=1"), "/admin/features?x=1");
  assert.equal(frAdminRedirectHref("/fr/admin_/escalations", ""), "/admin_/escalations");
});

test("other French pages are not redirected", () => {
  for (const p of ["/fr", "/fr/parent", "/fr/provider", "/fr/administration", "/fr/gov/login", "/admin", "/fr/adminx"]) {
    assert.equal(frAdminRedirectHref(p, ""), null, p);
  }
});

test("both French entry points redirect instead of rendering the admin desk", () => {
  const frAdmin = read("src/routes/fr.admin.tsx");
  assert.match(frAdmin, /throw redirect\(\{ href: frAdminRedirectHref\(location\.pathname, location\.searchStr\)/);
  assert.doesNotMatch(frAdmin, /AdminRoute|component:/);
  assert.match(read("src/routes/fr.tsx"), /frAdminRedirectHref\(location\.pathname, location\.searchStr\)/);
});

test("French sign-in leaves admin landings in English", () => {
  assert.equal(destinationAfterSignIn({ role: "admin", next: "/admin", locale: "fr" }), "/admin");
  assert.equal(destinationAfterSignIn({ role: "admin", next: "/admin?tab=queue", locale: "fr" }), "/admin?tab=queue");
});
