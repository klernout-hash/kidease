// Local-only QA launcher for the Nov 26 combined test branch.
// Build first with env -i, as documented in docs/nov26-private-qa.md.
import assert from "node:assert/strict";
import { copyFileSync, readdirSync } from "node:fs";
import { preview } from "vite";

const allowed = new Set(["HOME", "PATH", "TMPDIR", "CI", "LANG", "LC_ALL"]);
assert.ok(
  Object.keys(process.env).every((name) => allowed.has(name)),
  "Use env -i; no app secrets.",
);
assert.ok(!readdirSync(".").some((name) => name.startsWith(".env") && name !== ".env.example"));
Object.assign(process.env, {
  E2E_ROLE_FIXTURE: "1",
  FEATURE_COPARENT_LINK: "1",
  FEATURE_COPARENT_EMAIL: "0",
  FEATURE_CENTRE_DOCUMENTS: "1",
  FEATURE_HOST_LISTING: "1",
  FEATURE_ORG_DASHBOARD: "1",
  FEATURE_BG_CHECK_RECORDS: "1",
  FEATURE_BG_CHECK_GUIDE: "1",
  SUBSCRIPTIONS_ENABLED: "0",
  SHOW_PAY_CTAS: "0",
});
for (const file of ["pglite.data", "pglite.wasm", "initdb.wasm"]) {
  copyFileSync(
    `node_modules/@electric-sql/pglite/dist/${file}`,
    `.vercel/output/functions/__server.func/${file}`,
  );
}
const origin = "http://127.0.0.1:8081";
const app = await preview({ preview: { host: "127.0.0.1", port: 8081, strictPort: true } });
try {
  assert.equal(app.httpServer.address().address, "127.0.0.1");
  const health = await fetch(origin + "/api/health").then((res) => res.json());
  assert.equal(health.runtime, "local");
  assert.equal(health.checks.database, "ok");
  const password = "E2e-role-fixture-pass-1";
  const staff = "e2e-qa-staff@kidease.test";
  const recipient = "e2e-qa-recipient@kidease.test";
  async function seed(path, body) {
    const result = await fetch(origin + path, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.ok(result.ok, `Synthetic seed failed: ${result.status}`);
  }
  await seed("/api/e2e-seed", { role: "parent" });
  await seed("/api/e2e-seed", { role: "provider", ownSlug: "e2e-centre", activity: true });
  await seed("/api/auth/sign-up/email", {
    email: recipient,
    password,
    name: "Synthetic Recipient",
  });
  await seed("/api/auth/sign-up/email", { email: staff, password, name: "Synthetic Staff" });
  const pg = await globalThis.__pgliteInstance__;
  assert.ok(pg, "Only the disposable in-memory database may be seeded");
  const user = await pg.query(
    'update "user" set "emailVerified" = true where email = $1 returning id',
    [staff],
  );
  assert.equal(user.rows.length, 1);
  await pg.query(
    "insert into centre_members (id, daycare_id, user_id, role, status) select 'e2e-qa-staff', id, $1, 'staff', 'active' from daycares where slug = 'e2e-centre'",
    [user.rows[0].id],
  );
  await pg.exec(`
    insert into daycares (id, slug, name, name_fr, tagline, tagline_fr, description, description_fr,
      address, city, province, postal_code, lat, lng, hours, hours_fr, age_min_months, age_max_months,
      photos, claimed_at, claim_status, listing_active, visibility, is_test)
    select 'e2e-qa-centre-b', 'e2e-qa-centre-b', 'Synthetic Centre Beta', 'Centre fictif Bêta',
      tagline, tagline_fr, description, description_fr, address, city, province, postal_code, lat,
      lng, hours, hours_fr, age_min_months, age_max_months, photos, now(), 'approved', 1, 'public', 0
    from daycares where slug = 'e2e-centre';
    insert into provider_daycares (user_id, daycare_id)
    select user_id, 'e2e-qa-centre-b' from provider_daycares where daycare_id = 'e2e-e2e-centre';
  `);
  console.log(`\nPrivate local KidEase QA ready at ${origin}/login (Ctrl+C to stop).\n`);
} catch (error) {
  app.httpServer.closeAllConnections();
  await new Promise((resolve) => app.httpServer.close(resolve));
  throw error;
}
