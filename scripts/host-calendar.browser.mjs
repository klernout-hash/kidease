/**
 * Signed-in Calendar regression, on an isolated local production build.
 * Run npm run build without application credentials, then:
 *   env -i HOME="$HOME" PATH="$PATH" node scripts/host-calendar.browser.mjs
 * Set KE_QA_CHROMIUM to an executable when Playwright Chromium is not installed.
 */
import assert from "node:assert/strict";
import { copyFileSync, readdirSync } from "node:fs";
import { chromium } from "playwright";
import { preview } from "vite";

const allowedEnvironment = new Set([
  "HOME",
  "PATH",
  "TMPDIR",
  "CI",
  "LANG",
  "LC_ALL",
  "PLAYWRIGHT_BROWSERS_PATH",
  "KE_QA_CHROMIUM",
]);
const otherKeys = Object.keys(process.env).filter((name) => !allowedEnvironment.has(name));
assert.deepEqual(
  otherKeys,
  [],
  "Run with env -i so the test cannot inherit application configuration.",
);
assert.equal(
  readdirSync(".").some(
    (name) =>
      name.startsWith(".env") && name !== ".env.example" && name !== ".env.production.example",
  ),
  false,
  "Use a clean checkout without environment files.",
);
for (const file of ["pglite.data", "pglite.wasm", "initdb.wasm"]) {
  copyFileSync(
    `node_modules/@electric-sql/pglite/dist/${file}`,
    `.vercel/output/functions/__server.func/${file}`,
  );
}
Object.assign(process.env, {
  E2E_ROLE_FIXTURE: "1",
  FEATURE_HOST_LISTING: "1",
  FEATURE_ORG_DASHBOARD: "1",
  SUBSCRIPTIONS_ENABLED: "0",
  SHOW_PAY_CTAS: "0",
});
const origin = "http://127.0.0.1:8081";
const local = await preview({ preview: { host: "127.0.0.1", port: 8081, strictPort: true } });
let browser;
try {
  assert.equal(local.httpServer.address().address, "127.0.0.1");
  const health = await fetch(origin + "/api/health").then((res) => res.json());
  assert.equal(health.runtime, "local");
  assert.equal(health.checks.database, "ok");
  const seed = await fetch(origin + "/api/e2e-seed", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ role: "provider", ownSlug: "calendar-a", activity: true }),
  });
  assert.ok(seed.ok, `seed failed: ${seed.status}`);
  const db = await globalThis.__pgliteInstance__;
  assert.ok(db, "Only the disposable embedded database may be seeded");
  await db.exec(`
    update daycares set name = 'Calendar Alpha', name_fr = 'Calendrier Alpha'
    where slug = 'calendar-a';
    insert into daycares(id, slug, name, name_fr, tagline, tagline_fr, description, description_fr,
      address, city, province, postal_code, lat, lng, hours, hours_fr, age_min_months, age_max_months, photos)
      select 'e2e-calendar-b', 'calendar-b', 'Calendar Beta', 'Calendrier Beta',
        tagline, tagline_fr, description, description_fr, address, city, province, postal_code,
        lat, lng, hours, hours_fr, age_min_months, age_max_months, photos
        from daycares where slug='calendar-a';
    update daycares set claimed_at = now(), claim_status = 'approved',
      listing_active = 1, visibility = 'public', is_test = 0
      where slug='calendar-b';
    insert into provider_daycares (user_id, daycare_id)
      select user_id, 'e2e-calendar-b' from provider_daycares where daycare_id='e2e-calendar-a';
  `);
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Winnipeg",
    dateStyle: "short",
  }).format(new Date());
  const day = `${date.slice(0, 7)}-10`;
  await db.query(
    "insert into host_calendar_days(daycare_id, day, spots_infant, spots_toddler, spots_preschool, closed) values ('e2e-calendar-a', $1, 11, 0, 0, false), ('e2e-calendar-b', $1, 23, 0, 0, false)",
    [day],
  );

  browser = await chromium.launch({
    executablePath: process.env.KE_QA_CHROMIUM || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "en-CA",
  });
  await context.route("**/*", (route) =>
    route
      .request()
      .url()
      .startsWith(origin + "/")
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  await page.goto(origin + "/login", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const form = document.querySelector('[data-ke="email-sign-in"]');
    return Boolean(form && Object.keys(form).some((key) => key.startsWith("__react")));
  });
  await page.locator('input[type="email"]').fill("e2e-provider@kidease.test");
  await page.locator('input[type="password"]').fill("E2e-role-fixture-pass-1");
  const signIn = page.waitForResponse(
    (res) => res.url().includes("/api/auth/sign-in/email") && res.request().method() === "POST",
  );
  await page.locator('[data-ke="email-primary"]').click();
  assert.ok((await signIn).ok());
  const dismiss = page.getByRole("button", { name: /not now/i });
  await dismiss
    .waitFor({ timeout: 4000 })
    .then(() => dismiss.click())
    .catch(() => {});
  await page.waitForURL((url) => !url.pathname.endsWith("/login"));
  const session = await page.evaluate(
    async () => (await (await fetch("/api/auth/get-session")).json()).user.email,
  );
  assert.equal(session, "e2e-provider@kidease.test");

  const calendar = page.locator('[data-ke="host-calendar"]');
  const cell = () => calendar.getByRole("gridcell", { name: new RegExp(day) });
  const editor = page.locator('[data-ke="host-day-editor"]');
  const loadRequest = page.waitForResponse((res) => {
    const address = new URL(res.url());
    const query = decodeURIComponent(address.search);
    return (
      address.pathname.includes("/_serverFn/") &&
      query.includes("e2e-calendar-a") &&
      query.includes("month")
    );
  });
  await page.goto(`${origin}/provider?desk=calendar&centre=e2e-calendar-a`, {
    waitUntil: "domcontentloaded",
  });
  await cell().waitFor();
  assert.match(await cell().getAttribute("aria-label"), /11/);
  const serverFn = new URL((await loadRequest).url()).pathname;
  assert.equal(await calendar.getByRole("combobox").locator("option").count(), 2);
  await cell().click();
  await editor.waitFor();

  let releaseRequest;
  const stop = new Promise((resolve) => {
    releaseRequest = resolve;
  });
  let stalled = false;
  let releaseFailed;
  const failedRequest = new Promise((resolve) => {
    releaseFailed = resolve;
  });
  let observedTarget = false;
  await page.route(`**${serverFn}*`, async (route) => {
    const query = decodeURIComponent(new URL(route.request().url()).search);
    if (query.includes("e2e-calendar-b") && !observedTarget) {
      observedTarget = true;
      await stop;
    }
    if (stalled) {
      stalled = false;
      await failedRequest;
    }
    return route.continue();
  });
  try {
    await calendar.getByRole("combobox").selectOption("e2e-calendar-b");
    await calendar.locator('[data-ke="host-calendar-loading"]').waitFor();
    assert.equal(await calendar.getByRole("grid").count(), 0);
    assert.equal(await editor.count(), 0);
  } finally {
    releaseRequest();
  }
  await page.waitForURL((url) => url.searchParams.get("centre") === "e2e-calendar-b");
  await cell().waitFor();
  assert.match(await cell().getAttribute("aria-label"), /23/);
  assert.ok(observedTarget);

  stalled = true;
  const failure = calendar.locator('[data-ke="host-calendar-load-failed"]');
  try {
    await calendar.getByRole("button", { name: "Next month" }).click();
    await failure.waitFor();
    assert.equal(await calendar.getByRole("grid").count(), 0);
  } finally {
    releaseFailed();
  }
  await failure.getByRole("button", { name: "Try again" }).click();
  await calendar.getByRole("grid").waitFor();
  await calendar.getByRole("button", { name: "Previous month" }).click();
  await cell().waitFor();

  await cell().click();
  await editor.getByRole("spinbutton").first().fill("31");
  await editor.getByRole("button", { name: "Save this day" }).click();
  const edited = calendar.getByRole("gridcell", { name: new RegExp(`${day}.*31`) });
  await edited.waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await edited.waitFor();
  const saved = await db.query(
    "select daycare_id, spots_infant from host_calendar_days where day=$1 and daycare_id in ('e2e-calendar-a','e2e-calendar-b') order by daycare_id",
    [day],
  );
  assert.deepEqual(
    saved.rows.map((row) => row.spots_infant),
    [11, 31],
  );
  console.log(
    "PASS English phone: switching clears the old grid/editor, stalled month retries, and only the current centre is updated after save and reload.",
  );

  await page.setViewportSize({ width: 1280, height: 850 });
  await page.goto(`${origin}/fr/provider?desk=calendar&centre=e2e-not-linked`, {
    waitUntil: "domcontentloaded",
  });
  const unavailable = page.locator('[data-ke="host-calendar-centre-unavailable"]');
  await unavailable.waitFor();
  assert.equal(await calendar.getByRole("grid").count(), 0);
  await unavailable.getByRole("button", { name: /calendrier/i }).click();
  await calendar.getByRole("grid").waitFor();
  assert.equal(new URL(page.url()).searchParams.has("centre"), false);
  console.log(
    "PASS French desktop: unavailable centre never falls back silently and recovery opens the calendar.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => local.httpServer.close(resolve));
}
