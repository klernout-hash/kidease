import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { signTwoFactorCookie, signTwoFactorDeviceCookie } from "../../src/lib/two-factor-cookie.ts";
import { KIDEASE_OPERATOR_EMAIL } from "../../src/lib/admin-email.ts";

// This is the real built Nitro application, Better Auth and in-memory PGlite.
// No auth/SQL modules are replaced. The listener permits document GETs and built
// static files only. JS stays disabled, so admin financial effects cannot run.
// Static errors deliberately omit values, even when this internal fixture is
// invoked directly in a dirty shell instead of through the clean launcher.
if (process.env.DATABASE_URL !== undefined)
  throw new Error("Synthetic HTTP instance refuses database configuration");
if (process.env.VERCEL !== undefined)
  throw new Error("Synthetic HTTP instance refuses deployment configuration");
if (process.env.E2E_ROLE_FIXTURE !== undefined)
  throw new Error("Synthetic HTTP instance refuses authentication fixtures");
if (!process.env.BETTER_AUTH_SECRET)
  throw new Error("Synthetic HTTP instance requires an ephemeral signing secret");
const enabled = process.env.FEATURE_ADMIN_QUEUE_SSR === "1";
const root = fileURLToPath(new URL("../../", import.meta.url));
const output = join(root, "artifacts/admin-http", enabled ? "enabled" : "disabled");
await mkdir(output, { recursive: true });
const results = [];
const blockedNetwork = [];
const forbiddenSql = [];
const browserRequests = [];
const pageErrors = [];
const secret = process.env.BETTER_AUTH_SECRET;
const userId = "synthetic-http-operator";
const parentId = "synthetic-http-parent";
const token = randomBytes(32).toString("hex");
const privateContact = "synthetic-private-contact@example.invalid";
const privateNote = "SYNTHETIC-PRIVATE-REVIEW-NOTE";
const sessionCookie = "__Host-grok-auth.session_token";
const proofCookie = "__Host-kidease.2fa";
const deviceCookie = "__Host-kidease.2fa.device";
const proof = signTwoFactorCookie(userId, Date.now() + 60 * 60_000, secret);
const signedToken = (value) =>
  `${value}.${createHmac("sha256", secret).update(value).digest("base64")}`;
const cookieHeader = (entries) =>
  Object.entries(entries)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");
const cookies = (overrides = {}) =>
  cookieHeader({
    [sessionCookie]: signedToken(token),
    [proofCookie]: proof,
    "kidease-locale": "en",
    ...overrides,
  });
const outputLine = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
// Application diagnostics can contain SQL parameters. Only sanitized verdicts
// below leave this process, including when a synthetic failure is intentional.
for (const name of ["log", "warn", "error", "info", "debug"]) console[name] = () => {};
const originalFetch = globalThis.fetch;
let origin;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.origin !== origin) {
    blockedNetwork.push(url.origin + url.pathname);
    throw new Error("External network forbidden in synthetic HTTP check");
  }
  return originalFetch(input, options);
};
let app;
let pg;
let browser;
let onQueueRead;
let queueReads = 0;
let lastResponse;
const marker = /data-ke="admin-queue-bootstrap"/;
const countMarker = /data-ke="admin-queue-bootstrap-counts"/;
const stripScripts = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const mime = {
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const listener = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    if (req.method !== "GET") {
      res.writeHead(405).end();
      return;
    }
    const staticPath = resolve(
      root,
      ".vercel/output/static",
      `.${decodeURIComponent(url.pathname)}`,
    );
    if (staticPath.startsWith(join(root, ".vercel/output/static") + "/")) {
      try {
        if ((await stat(staticPath)).isFile()) {
          res.writeHead(200, {
            "content-type": mime[extname(staticPath)] || "application/octet-stream",
          });
          res.end(await readFile(staticPath));
          return;
        }
      } catch {
        /* Only the explicit document routes below may reach Nitro. */
      }
    }
    if (!["/admin", "/fr/admin"].includes(url.pathname)) {
      res.writeHead(403).end();
      return;
    }
    const response = await app.fetch(new Request(url, { headers: req.headers }));
    res.statusCode = response.status;
    for (const [name, value] of response.headers)
      if (name !== "set-cookie") res.setHeader(name, value);
    const setCookies = response.headers.getSetCookie();
    if (setCookies.length) res.setHeader("set-cookie", setCookies);
    if (response.body) Readable.fromWeb(response.body).pipe(res);
    else res.end();
  } catch {
    res.writeHead(500).end("Synthetic HTTP adapter error");
  }
});
async function run(name, check) {
  try {
    await check();
    results.push({ name, passed: true });
    outputLine({ name, passed: true });
  } catch (error) {
    // Avoid printing HTML, tokens, cookies or SQL even in assertion failures.
    results.push({ name, passed: false, error: error?.code || error?.name || "Error" });
    outputLine({
      name,
      passed: false,
      error: error?.code || error?.name || "Error",
      lastResponse,
      location: error.stack
        ?.split("\n")
        .find((line) => /at .*admin-http-instance\.mjs:\d/.test(line))
        ?.trim(),
    });
    throw new Error(`Synthetic HTTP check failed: ${name}`);
  }
}
async function request(cookie = cookies(), path = "/admin", headers = {}) {
  const response = await fetch(origin + path, {
    redirect: "manual",
    headers: { "accept-language": "en", "accept-encoding": "gzip", cookie, ...headers },
    signal: AbortSignal.timeout(30_000),
  });
  const html = await response.text();
  lastResponse = {
    status: response.status,
    redirectPath: response.headers.get("location")?.split("?")[0],
    cacheControl: response.headers.get("cache-control"),
    marker: marker.test(stripScripts(html)),
    counts: [...stripScripts(html).matchAll(/<dd\b[^>]*>(\d+)<\/dd>/g)].map((match) =>
      Number(match[1]),
    ),
    queueReads,
  };
  assert.ok(
    !html.includes(token) && !html.includes(proof),
    "Authentication material must not serialize",
  );
  assert.ok(
    !html.includes(privateContact) && !html.includes(privateNote),
    "Private queue rows must not serialize",
  );
  return { response, html, body: stripScripts(html) };
}
function assertPrivate(response) {
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  for (const name of [
    "cdn-cache-control",
    "cloudflare-cdn-cache-control",
    "vercel-cdn-cache-control",
  ])
    assert.equal(response.headers.get(name), "no-store");
}
function assertCounts(result) {
  assert.equal(result.response.status, 200);
  assert.match(result.body, countMarker);
  const panels = result.body.match(
    /<dl\b(?=[^>]*data-ke="admin-queue-bootstrap-counts")[^>]*>[\s\S]*?<\/dl>/g,
  );
  assert.ok(panels?.length);
  // React can emit both the outer fallback and its streamed replacement. The
  // browser assertion below separately requires exactly one visible panel.
  for (const panel of panels) {
    const counts = [...panel.matchAll(/<dd\b[^>]*>(\d+)<\/dd>/g)].map((match) => Number(match[1]));
    assert.deepEqual(counts, [2, 1, 1, 4]);
  }
  assertPrivate(result.response);
}
async function assertDenied(cookie, status = 404, headers = {}) {
  const result = await request(cookie, "/admin", headers);
  assert.equal(result.response.status, status);
  assert.doesNotMatch(result.html, marker);
  assert.doesNotMatch(result.html, countMarker);
  assert.ok(!result.html.includes('"viewerId"') && !result.html.includes('"checkedAt"'));
  return result;
}
async function insertSession(id, value, actor = userId, createdMinutes = 1, expiryMinutes = 60) {
  await pg.query(
    `insert into "session" (id,token,"userId","createdAt","updatedAt","expiresAt")
    values ($1,$2,$3,now()-($4::int*interval '1 minute'),now(),now()+($5::int*interval '1 minute'))`,
    [id, value, actor, createdMinutes, expiryMinutes],
  );
}
try {
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${listener.address().port}`;
  process.env.BETTER_AUTH_URL = origin;
  const bundle = join(root, ".vercel/output/functions/__server.func");
  for (const name of ["pglite.data", "pglite.wasm", "initdb.wasm"])
    await copyFile(join(root, "node_modules/@electric-sql/pglite/dist", name), join(bundle, name));
  app = (await import(pathToFileURL(join(bundle, "index.mjs")))).default;
  const health = await app.fetch(new Request(origin + "/api/health"));
  assert.equal(health.status, 200);
  await globalThis.__pgBootstrapPromise__;
  pg = await globalThis.__pgliteInstance__;
  assert.ok(
    pg && !pg.dataDir,
    "Only a freshly initialized in-memory PGlite database may be seeded",
  );
  // No database URL or persistent directory exists in this child. All rows and
  // the full migrated schema disappear on close. No customer data is loaded.
  await pg.exec('truncate table daycares, "user", profiles restart identity cascade');
  await pg.query(
    `insert into "user" (id,name,email,"emailVerified","createdAt","updatedAt") values
    ($1,'Synthetic Operator',$2,true,now(),now()),($3,'Synthetic Parent','parent@example.invalid',true,now(),now())`,
    [userId, KIDEASE_OPERATOR_EMAIL, parentId],
  );
  await pg.query(
    "insert into profiles(user_id,role,locale,locale_chosen) values ($1,'admin','en',true),($2,'parent','en',true)",
    [userId, parentId],
  );
  await insertSession("synthetic-http-session", token);
  for (const [i, status] of ["waiting", "pending", "approved", "declined", "waiting"].entries()) {
    const id = i === 4 ? "qa-admin-http-hidden" : `synthetic-http-centre-${i}`;
    await pg.query(
      `insert into daycares(id,slug,name,name_fr,tagline,tagline_fr,description,description_fr,
      address,city,province,postal_code,lat,lng,hours,hours_fr,age_min_months,age_max_months,photos,
      claim_status,claimed_at,license_number,license_status,registry_match_state,is_test,visibility,
      rating_x10,review_count,verified,contact_email)
      values($1,$1,$2,$2,'Synthetic','Synthétique','Synthetic fixture','Fiche synthétique',
      $3,'Winnipeg','MB','R3C 0A1',49.8992,-97.1391,'08:00–17:00','08:00–17:00',0,72,'',
      $4,now(),$5,$6,$7,$8,$9,0,0,0,$10)`,
      [
        id,
        i === 4 ? "QA Admin HTTP Hidden" : `Synthetic Centre ${i}`,
        `${100 + i} Synthetic Avenue`,
        status,
        `LOCAL-SYNTHETIC-${i}`,
        i === 2 ? "matched" : "unverified",
        i === 2 ? "matched" : "unmatched",
        i === 4 ? 1 : 0,
        i === 4 ? "admin_only" : "public",
        privateContact,
      ],
    );
  }
  await pg.query(
    `insert into listing_claims(id,daycare_id,user_id,code,status,review_note)
    values('synthetic-http-claim','synthetic-http-centre-0',$1,'synthetic-code','waiting',$2)`,
    [parentId, privateNote],
  );
  const actualQuery = pg.query.bind(pg);
  pg.query = async (sql, params, options) => {
    const text = String(sql);
    if (
      /\b(?:from|join|into|update|table)\s+"?(?:\w*_)?(?:invoices?|payments?|stripe\w*|subscriptions?|tuition\w*|contracts?|refunds?|ledgers?|payouts?)\b/i.test(
        text,
      ) ||
      /\b(?:insert\s+into|update|delete\s+from)\s+"?(?:messages|email_outbox|outbound_messages|sms_outbox)\b/i.test(
        text,
      )
    ) {
      forbiddenSql.push("Forbidden financial or outbound SQL");
      throw new Error("Forbidden financial or outbound SQL");
    }
    if (/d\.id as daycare_id/.test(text) && /left join lateral/i.test(text)) {
      queueReads++;
      if (onQueueRead) {
        const action = onQueueRead;
        onQueueRead = undefined;
        await action(actualQuery);
      }
    }
    return actualQuery(sql, params, options);
  };

  if (!enabled) {
    await run(
      "disabled flag keeps authorized document free of bootstrap and queue reads",
      async () => {
        const result = await request();
        assert.equal(result.response.status, 200);
        assert.doesNotMatch(result.html, marker);
        assert.equal(queueReads, 0);
      },
    );
    await run("disabled flag preserves signed-out denial", () => assertDenied(""));
  } else {
    await run("authorized document contains real counts and private no-store headers", async () => {
      const result = await request();
      assertCounts(result);
      assert.equal(result.response.headers.get("content-encoding"), "gzip");
      assert.ok(queueReads > 0, "Actual SQL queue reader must execute");
      await writeFile(join(output, "authorized.html"), result.html);
    });
    await run("missing and tampered genuine session signatures deny", async () => {
      await assertDenied("");
      await assertDenied(cookies({ [sessionCookie]: `${signedToken(token)}tampered` }));
    });
    await run("expired and deleted real session rows deny", async () => {
      const expired = randomBytes(32).toString("hex");
      await insertSession("synthetic-http-expired", expired, userId, 120, -1);
      await assertDenied(cookies({ [sessionCookie]: signedToken(expired) }));
      const deleted = randomBytes(32).toString("hex");
      await insertSession("synthetic-http-deleted", deleted);
      await pg.query('delete from "session" where token=$1', [deleted]);
      await assertDenied(cookies({ [sessionCookie]: signedToken(deleted) }));
    });
    await run("stored admin on unauthorized mailbox denies", async () => {
      await pg.query('update "user" set email=$1 where id=$2', ["other@example.invalid", userId]);
      try {
        await assertDenied(cookies());
      } finally {
        await pg.query('update "user" set email=$1 where id=$2', [KIDEASE_OPERATOR_EMAIL, userId]);
      }
    });
    await run("unverified operator cannot bootstrap a parent role", async () => {
      // Keep the real database's last-admin trigger intact. This other mailbox
      // still cannot pass the application's operator-email authorization.
      await pg.query("update profiles set role='admin' where user_id=$1", [parentId]);
      await pg.query('update "user" set "emailVerified"=false where id=$1', [userId]);
      await pg.query("update profiles set role='parent' where user_id=$1", [userId]);
      try {
        await assertDenied(cookies());
      } finally {
        await pg.query('update "user" set "emailVerified"=true where id=$1', [userId]);
        await pg.query("update profiles set role='admin' where user_id=$1", [userId]);
        await pg.query("update profiles set role='parent' where user_id=$1", [parentId]);
      }
    });
    await run(
      "missing expired tampered and foreign signed 2FA redirect to verification",
      async () => {
        for (const value of [
          "",
          signTwoFactorCookie(userId, Date.now() - 60_000, secret),
          "tampered",
          signTwoFactorCookie(parentId, Date.now() + 60_000, secret),
        ]) {
          const result = await assertDenied(cookies({ [proofCookie]: value }), 307);
          assert.match(result.response.headers.get("location"), /\/verify-2fa/);
        }
      },
    );
    await run("revoked trusted device denies despite valid login 2FA", async () => {
      await pg.query(
        `insert into trusted_devices(id,user_id,device_id,expires_at,revoked_at)
        values('synthetic-device',$1,'synthetic-device',now()+interval '1 hour',now())`,
        [userId],
      );
      const result = await assertDenied(
        cookies({
          [deviceCookie]: signTwoFactorDeviceCookie(
            userId,
            "synthetic-device",
            Date.now() + 60_000,
            secret,
          ),
        }),
        307,
      );
      assert.match(result.response.headers.get("location"), /\/verify-2fa/);
    });
    await run("old session without idle proof denies", async () => {
      const old = randomBytes(32).toString("hex");
      await insertSession("synthetic-http-old", old, userId, 120);
      await assertDenied(cookies({ [sessionCookie]: signedToken(old) }));
    });
    await run("expired account denies without purging its real synthetic session", async () => {
      await pg.query("update profiles set deleted_at=now()-interval '40 days' where user_id=$1", [
        userId,
      ]);
      try {
        await assertDenied(cookies());
        assert.equal(
          (await pg.query('select count(*)::int n from "session" where token=$1', [token])).rows[0]
            .n,
          1,
        );
      } finally {
        await pg.query("update profiles set deleted_at=null where user_id=$1", [userId]);
      }
    });
    await run("active view-as cannot receive admin summary", async () => {
      await pg.query(
        `insert into view_as_sessions(id,admin_user_id,target_user_id,started_at,expires_at)
        values('synthetic-http-view-as',$1,$2,now(),now()+interval '1 hour')`,
        [userId, parentId],
      );
      try {
        await assertDenied(cookies());
      } finally {
        await pg.query("delete from view_as_sessions where id='synthetic-http-view-as'");
      }
    });
    await run("concurrent authorized and anonymous requests remain isolated", async () => {
      for (let i = 0; i < 3; i++) {
        const [allowed] = await Promise.all([request(), assertDenied("")]);
        assertCounts(allowed);
      }
    });
    await run("session revoked during actual queue read never serializes counts", async () => {
      onQueueRead = async (query) => {
        await query('delete from "session" where token=$1', [token]);
      };
      await assertDenied(cookies());
      assert.equal(onQueueRead, undefined, "Revocation must occur within the real queue query");
      await insertSession("synthetic-http-session-recreated", token);
      assertCounts(await request());
    });
    await run("actual SQL queue failure shows unavailable rather than zero", async () => {
      await pg.exec(
        "alter table daycares rename column import_fault to synthetic_missing_import_fault",
      );
      try {
        const result = await request();
        assert.equal(result.response.status, 200);
        assert.match(result.body, marker);
        assert.doesNotMatch(result.body, countMarker);
        assert.match(result.body, /Queue totals are unavailable/);
        assertPrivate(result.response);
      } finally {
        await pg.exec(
          "alter table daycares rename column synthetic_missing_import_fault to import_fault",
        );
      }
    });
    await run("native shell cannot receive admin counts", async () => {
      const result = await assertDenied(cookies(), 302, {
        "user-agent": "KidEaseNative SyntheticHTTP",
      });
      assert.match(result.response.headers.get("location"), /app-admin-unavailable/);
    });
    browser = await chromium.launch({
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: true,
      args: ["--disable-background-networking"],
    });
    for (const locale of ["en", "fr"])
      for (const width of [390, 1280]) {
        await run(`visible initial HTML without JavaScript ${locale} ${width}px`, async () => {
          // The real locale resolver gives an explicit profile choice priority
          // over cookie/header hints. Exercise that same persisted choice.
          await pg.query("update profiles set locale=$1 where user_id=$2", [locale, userId]);
          const context = await browser.newContext({
            javaScriptEnabled: false,
            serviceWorkers: "block",
            viewport: { width, height: 900 },
            extraHTTPHeaders: {
              cookie: cookies({ "kidease-locale": locale }),
              "accept-language": locale,
            },
          });
          await context.route("**/*", (route) => {
            const url = new URL(route.request().url());
            browserRequests.push(url.origin + url.pathname);
            if (url.origin !== origin || /^\/(?:api|_serverFn)(?:\/|$)/.test(url.pathname)) {
              blockedNetwork.push(url.origin + url.pathname);
              return route.abort();
            }
            return route.continue();
          });
          const page = await context.newPage();
          page.on("pageerror", (error) => pageErrors.push(error.name));
          try {
            const response = await page.goto(origin + "/admin", {
              waitUntil: "load",
              timeout: 30_000,
            });
            assert.equal(response.status(), 200);
            const panel = page.locator('[data-ke="admin-queue-bootstrap-counts"]:visible');
            assert.equal(await panel.count(), 1);
            assert.equal(
              await panel.isVisible(),
              true,
              "Counts must be visible without executing streamed reveal scripts",
            );
            assert.deepEqual(await panel.locator("dd").allTextContents(), ["2", "1", "1", "4"]);
            assert.deepEqual(
              await panel.locator("dt").allTextContents(),
              locale === "fr"
                ? ["En attente", "En ligne", "Refusées", "Total"]
                : ["Waiting", "Live", "Declined", "Total"],
            );
            const metrics = await page.evaluate(() => ({
              overflow: document.documentElement.scrollWidth > innerWidth,
              smallControls: [
                ...document.querySelectorAll('[data-ke="admin-queue-bootstrap"] a'),
              ].filter((el) => {
                const r = el.getBoundingClientRect();
                return r.width < 44 || r.height < 44;
              }).length,
            }));
            assert.deepEqual(metrics, { overflow: false, smallControls: 0 });
            await page.screenshot({ path: join(output, `${locale}-${width}.png`), fullPage: true });
            results.push({ name: `layout ${locale} ${width}`, ...metrics });
          } finally {
            await context.close();
          }
        });
      }
  }
  assert.deepEqual(forbiddenSql, []);
  assert.deepEqual(blockedNetwork, []);
  assert.deepEqual(pageErrors, []);
  await writeFile(
    join(output, "results.json"),
    JSON.stringify(
      { enabled, results, queueReads, forbiddenSql, blockedNetwork, browserRequests, pageErrors },
      null,
      2,
    ),
  );
  outputLine({
    enabled,
    passed: results.filter((result) => result.passed).length,
    queueReads,
    forbiddenSql: forbiddenSql.length,
    blockedNetwork: blockedNetwork.length,
  });
} catch (error) {
  outputLine({
    enabled,
    failed: true,
    error: error.message?.startsWith("Synthetic HTTP check failed:") ? error.message : error.name,
  });
  await writeFile(
    join(output, "results.json"),
    JSON.stringify({ enabled, results, queueReads, forbiddenSql, blockedNetwork }, null, 2),
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  listener.closeAllConnections();
  await new Promise((resolve) => listener.close(resolve));
  await pg?.close();
}
