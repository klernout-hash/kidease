import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * Security spec for anonymous licence attachment.
 * These assertions describe the safe outcome. They fail while an anonymous
 * caller can still write a centre's licence evidence.
 *
 * Network, Better Auth, and the private bucket stay in-process. SQL is PGLite.
 * Placeholders below are not credentials.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stateKey = "__enrollLicenseTamper";
const prefix = "enroll-license-tamper:";

process.env.VERCEL_ENV = "production";
process.env.TURNSTILE_SITE_KEY = "turnstile-site-placeholder";
process.env.TURNSTILE_SECRET_KEY = "turnstile-secret-placeholder";
process.env.R2_ACCESS_KEY_ID = "r2-access-placeholder";
process.env.R2_SECRET_ACCESS_KEY = "r2-secret-placeholder";
process.env.R2_ENDPOINT = "https://example.r2.cloudflarestorage.com";
process.env.R2_BUCKET = "kidease-media";
process.env.R2_PRIVATE_BUCKET = "kidease-private-docs";
delete process.env.DATABASE_URL;

const virtual = {
  serverFn: `
    export function createServerFn() {
      let validate = (value) => value;
      const middlewares = [];
      const builder = {
        middleware(list) { middlewares.push(...(list || [])); return builder; },
        validator(fn) { validate = fn; return builder; },
        handler(fn) {
          return async (opts = {}) => {
            let context = { ...(opts.context || {}) };
            let index = 0;
            const run = async () => {
              if (index >= middlewares.length) return fn({ context, data: validate(opts.data) });
              const mw = middlewares[index++];
              const server = mw && mw.options && mw.options.server;
              if (typeof server !== "function") return run();
              return server({
                context,
                data: opts.data,
                next: async (extra = {}) => {
                  if (extra && extra.context) context = { ...context, ...extra.context };
                  return run();
                },
              });
            };
            return run();
          };
        },
      };
      return builder;
    }
    export function createMiddleware() {
      const options = {};
      const api = {
        options,
        middleware() { return api; },
        validator(fn) { options.validator = fn; return api; },
        client(fn) { options.client = fn; return api; },
        server(fn) { options.server = fn; return api; },
      };
      return api;
    }
    export function createServerOnlyFn(fn) { return fn; }
    export function createIsomorphicFn() {
      const api = { server(fn) { api.fn = fn; return fn; }, client(fn) { return fn; } };
      return api;
    }
    export function getRequest() { return globalThis.${stateKey}.request; }
    export function getCookie() { return undefined; }
    export function setCookie() {}
  `,
  db: `
    export const dbSource = "pglite";
    export function getSql() { return Promise.resolve(globalThis.${stateKey}.sql); }
    export function getSqlWithin() { return getSql(); }
    export function ensureDbReady() { return Promise.resolve(); }
    export async function getPglite() { throw new Error("embedded client is not used here"); }
  `,
  verify: `
    export class UnauthorizedError extends Error {
      constructor() { super("Unauthorized"); this.status = 401; this.name = "UnauthorizedError"; }
    }
    export async function requireUserId() {
      const id = globalThis.${stateKey}.actorId;
      if (!id) throw new UnauthorizedError();
      return id;
    }
    export async function getSessionUser() {
      const id = globalThis.${stateKey}.actorId;
      return id ? { id, email: null } : null;
    }
  `,
  // Anonymous callers are not admins. The real helper returns false with no session.
  listing: `export async function callerIsAdmin() { return false; }`,
};

function sourceFile(specifier, parentURL) {
  let file;
  if (specifier.startsWith("@/")) file = join(root, "src", specifier.slice(2));
  else if (specifier.startsWith(".") && parentURL?.startsWith("file:"))
    file = fileURLToPath(new URL(specifier, parentURL));
  if (!file) return null;
  return [file, `${file}.ts`, `${file}.tsx`, `${file}.mjs`].find(existsSync) ?? null;
}

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@tanstack/react-start" || specifier === "@tanstack/react-start/server") {
      return { url: `${prefix}serverFn`, shortCircuit: true };
    }
    const file = sourceFile(specifier, context.parentURL);
    if (!file) return nextResolve(specifier, context);
    if (file.endsWith(`${join("src", "lib", "db.ts")}`)) return { url: `${prefix}db`, shortCircuit: true };
    if (file.endsWith(`${join("src", "lib", "auth", "verify.server.ts")}`))
      return { url: `${prefix}verify`, shortCircuit: true };
    if (file.endsWith(`${join("src", "lib", "server", "public-listing.ts")}`))
      return { url: `${prefix}listing`, shortCircuit: true };
    return { url: pathToFileURL(file).href, shortCircuit: true };
  },
  load(url, context, nextLoad) {
    if (!url.startsWith(prefix)) return nextLoad(url, context);
    return { format: "module", source: virtual[url.slice(prefix.length)], shortCircuit: true };
  },
});

const { submitEnrollLicense, verifyClaim, updateListing } = await import("../src/lib/server/claims.ts");
const { loadDaycareHealth } = await import("../src/lib/server/profile-health.ts");
const { readAdminCentreQueueRows } = await import("../src/lib/server/admin-centre-queue.ts");
const { resetTurnstileVerifyCacheForTests } = await import("../src/lib/server/turnstile-verify.ts");
const licenseRoute = await import("../src/routes/api/license-docs.$daycareId.ts");
const licenseHandlers = licenseRoute.Route.options.server.handlers;
const { PROVIDER_TERMS_VERSION } = await import("../src/lib/legal-copy-v2.ts");

const ATTACK_BYTES = Buffer.from("synthetic-licence-not-a-real-document");
const OFFICIAL_BYTES = Buffer.from("synthetic-official-licence-on-file");
const ATTACK_URL = `data:application/pdf;base64,${ATTACK_BYTES.toString("base64")}`;
const SOLVED = "solved-widget-token";
const PUBLIC_ID = "mb-harbour-kids";
const REVIEW_ID = "mb-river-kids";
const HIDDEN_ID = "mb-hidden-kids";
const OWNED_ID = "mb-owned-kids";
const PASSTHROUGH_KEY = "licenses/other-centre/attacker-chosen.pdf";
const OFFICIAL_KEY = "licenses/mb-harbour-kids/official-lic.pdf";

const pg = new PGlite();
await pg.exec(`
  create table daycares (
    id text primary key,
    slug text,
    name text,
    name_fr text,
    tagline text,
    tagline_fr text,
    description text,
    description_fr text,
    address text,
    city text,
    province text,
    postal_code text,
    lat double precision,
    lng double precision,
    phone text,
    hours text,
    hours_fr text,
    age_min_months int,
    age_max_months int,
    ages_confirmed int,
    ages_source text,
    ages_source_url text,
    infant_monthly int,
    toddler_monthly int,
    preschool_monthly int,
    part_time_monthly int,
    fee_program text,
    fact_source text,
    spots_infant int,
    spots_toddler int,
    spots_preschool int,
    waitlist int,
    rating_x10 int,
    review_count int,
    license_number text,
    license_status text,
    registry_match_state text,
    license_verification_source text,
    languages text,
    staff_languages jsonb,
    cultural_programs jsonb,
    cultural_team_note text,
    amenities text,
    photos text,
    claimed_at timestamptz,
    founding_member int,
    claim_status text,
    listing_active int,
    staff_screening_attested int,
    staff_screening_attested_at timestamptz,
    screening_on_file int,
    screening_on_file_at timestamptz,
    visibility text,
    is_test int,
    is_demo int,
    google_place_id text,
    contact_email text,
    website text,
    merged_into text,
    import_fault text,
    license_photo text,
    license_expiry text,
    licensed_capacity int,
    license_verified_at timestamptz,
    last_photo_updated_at timestamptz,
    last_vacancy_updated_at timestamptz,
    created_at timestamptz not null default now(),
    review_of text,
    fee_confidence text,
    open_spots_hidden_at timestamptz,
    facility_type text,
    schedule_options jsonb,
    opening_window text,
    programs jsonb,
    financial_flags jsonb,
    curriculum_tags jsonb,
    values_note text,
    safety_features jsonb,
    promo_text text,
    meal_offerings jsonb
  );
  create table listing_claims (
    id text primary key,
    daycare_id text,
    user_id text,
    code text,
    status text,
    license_photo text,
    created_at timestamptz not null default now(),
    reviewed_at timestamptz,
    review_note text,
    verified_at timestamptz,
    contact_verified int,
    code_attempts int,
    code_sent_at timestamptz,
    code_sends int,
    fee_infant int,
    fee_toddler int,
    fee_preschool int
  );
  create table provider_daycares (user_id text, daycare_id text);
  create table centre_members (user_id text, daycare_id text, status text, role text);
  create table "user" (id text primary key, name text, email text, "emailVerified" boolean);
  create table profiles (
    user_id text primary key,
    role text,
    display_name text,
    phone text,
    city text,
    is_test int
  );
  create table account ("userId" text, "providerId" text);
  create table license_uploads (
    id text primary key,
    daycare_id text,
    user_id text,
    centre_name text not null,
    contact_name text,
    contact_email text,
    city text,
    phone text,
    note text,
    license_photo text not null,
    created_at timestamptz not null default now()
  );
  create table second_factor_prefs (
    user_id text primary key,
    parent_opt_in boolean,
    provider_grace_started_at timestamptz
  );
  create table platform_events (
    id text primary key,
    kind text,
    daycare_name text,
    address text,
    city text,
    province text,
    slug text,
    provider_name text,
    provider_email text,
    listing_url text,
    email_to text,
    email_status text,
    email_error text,
    detail text
  );
`);

function state() {
  return globalThis[stateKey];
}

function jsonResponse(body, status = 200) {
  const raw = JSON.stringify(body);
  return new Response(raw, {
    status,
    headers: { "content-type": "application/json" },
  });
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(href);
  const method = String(init.method || "GET").toUpperCase();
  if (url.hostname === "challenges.cloudflare.com") {
    const form = String(init.body || "");
    const solved = form.includes(`response=${encodeURIComponent(SOLVED)}`) || form.includes(`response=${SOLVED}`);
    return jsonResponse(
      solved ? { success: true } : { success: false, "error-codes": ["invalid-input-response"] },
    );
  }
  if (url.hostname.endsWith(".r2.cloudflarestorage.com")) {
    const parts = url.pathname.split("/").filter(Boolean);
    const key = decodeURIComponent(parts.slice(1).join("/"));
    if (method === "PUT") {
      const body = Buffer.from(init.body);
      state().objects.set(key, {
        body,
        type: new Headers(init.headers).get("content-type") || "application/octet-stream",
      });
      state().puts.push(key);
      return new Response("", { status: 200, headers: { etag: "synthetic" } });
    }
    if (method === "GET" || method === "HEAD") {
      const found = state().objects.get(key);
      if (!found) return new Response("missing", { status: 404 });
      return new Response(method === "HEAD" ? null : found.body, {
        status: 200,
        headers: { "content-type": found.type, etag: "synthetic", "content-length": String(found.body.length) },
      });
    }
    return new Response("unsupported", { status: 405 });
  }
  return new Response("local transport only", { status: 503 });
};

function enrol(overrides = {}) {
  return {
    name: "Pat Visitor",
    email: "pat.visitor@example.invalid",
    centre: "Harbour Kids Centre",
    city: "Winnipeg",
    phone: "204-555-0100",
    body: "Please add this licence file.",
    licensePhoto: ATTACK_URL,
    daycareId: PUBLIC_ID,
    turnstileToken: SOLVED,
    ...overrides,
  };
}

async function callEnroll(data, userId) {
  state().actorId = userId || null;
  try {
    const result = await submitEnrollLicense({ data, context: userId ? { userId } : {} });
    return { result };
  } catch (error) {
    return { error };
  }
}

async function column(id) {
  const found = (await pg.query("select license_photo from daycares where id = $1", [id])).rows[0];
  return found ? found.license_photo : undefined;
}

async function uploadRefs() {
  return (await pg.query("select daycare_id, license_photo from license_uploads order by created_at")).rows;
}

function fileCheck(health) {
  return health.checks.find((check) => check.id === "licence_file");
}

async function seed() {
  await pg.exec(`
    truncate daycares, listing_claims, provider_daycares, centre_members, "user", profiles, account,
      license_uploads, second_factor_prefs, platform_events;
  `);
  const insert = `insert into daycares (
      id, slug, name, address, city, province, postal_code, lat, lng, phone,
      license_number, visibility, is_test, is_demo, listing_active, claim_status, license_photo,
      languages, amenities, photos
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'en','licensed','')`;
  const rows = [
    [PUBLIC_ID, "harbour-kids-centre", "Harbour Kids Centre", "10 River Road", "Winnipeg", "MB", "R3B 0A1", 49.9, -97.1, "204-555-0199", "MB-100200", "public", 0, 0, 1, null, null],
    [REVIEW_ID, "river-kids-centre", "River Kids Centre", "12 River Road", "Winnipeg", "MB", "R3B 0A2", 49.9, -97.1, "204-555-0188", "MB-100201", "public", 0, 0, 1, "waiting", null],
    [HIDDEN_ID, "hidden-kids-centre", "Hidden Kids Centre", "14 River Road", "Winnipeg", "MB", "R3B 0A3", 49.9, -97.1, "204-555-0177", "MB-100202", "admin_only", 0, 0, 1, null, null],
    [OWNED_ID, "owned-kids-centre", "Owned Kids Centre", "16 River Road", "Winnipeg", "MB", "R3B 0A4", 49.9, -97.1, "204-555-0166", "MB-100203", "public", 0, 0, 1, null, null],
  ];
  for (const row of rows) await pg.query(insert, row);
  await pg.query(
    `insert into listing_claims (id, daycare_id, user_id, status, license_photo, code, contact_verified)
     values ('claim-river', $1, 'owner-river', 'waiting', null, 'ABCDEF', 0)`,
    [REVIEW_ID],
  );
  await pg.query(`insert into "user" (id, name, email) values ('owner-later', 'Owner Later', 'owner.later@example.invalid')`);
  await pg.query(`insert into profiles (user_id, role) values ('owner-later', 'provider'), ('owner-a', 'provider'), ('stranger', 'parent')`);
  await pg.query(`insert into provider_daycares (user_id, daycare_id) values ('owner-a', $1)`, [OWNED_ID]);
}

beforeEach(async () => {
  resetTurnstileVerifyCacheForTests();
  const objects = new Map();
  objects.set(OFFICIAL_KEY, { body: OFFICIAL_BYTES, type: "application/pdf" });
  globalThis[stateKey] = {
    actorId: null,
    request: undefined,
    objects,
    puts: [],
    sql: null,
  };
  const run = async (text, values = []) => {
    const rows = (await pg.query(text, values)).rows;
    return rows;
  };
  const sql = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run(text, values);
  };
  sql.query = (text, values = []) => run(text, values);
  state().sql = sql;
  await seed();
});

after(async () => {
  await pg.close();
  hooks.deregister();
  delete globalThis[stateKey];
  globalThis.fetch = originalFetch;
});

async function assertUntouched(id, label) {
  assert.equal(await column(id), null, `${label}: daycares.license_photo`);
  const health = await loadDaycareHealth(state().sql, id);
  assert.equal(fileCheck(health).state, "missing", `${label}: profile health licence file`);
  const uploads = await uploadRefs();
  assert.equal(
    uploads.some((row) => row.daycare_id === id && String(row.license_photo || "").includes("attacker-chosen")),
    false,
    `${label}: passthrough key stored on an upload`,
  );
}

test("a missing Turnstile token stores nothing and leaves the licence empty", async () => {
  const putsBefore = state().puts.length;
  const outcome = await callEnroll(enrol({ turnstileToken: "" }));
  assert.ok(outcome.error, "production Turnstile must refuse an empty token");
  assert.equal(state().puts.length, putsBefore);
  assert.equal((await uploadRefs()).length, 0);
  await assertUntouched(PUBLIC_ID, "missing token");
});

test("an anonymous solved Turnstile submission does not become the public centre licence", async () => {
  const outcome = await callEnroll(enrol());
  const stored = await column(PUBLIC_ID);
  const health = await loadDaycareHealth(state().sql, PUBLIC_ID);
  await pg.query(`insert into provider_daycares (user_id, daycare_id) values ('owner-later', $1)`, [PUBLIC_ID]);
  state().actorId = "owner-later";
  const response = await licenseHandlers.GET({ params: { daycareId: PUBLIC_ID } });
  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(stored, null, `column after ${outcome.error ? outcome.error.message : "ok"}`);
  assert.equal(fileCheck(health).state, "missing");
  assert.equal(fileCheck(health).points, 0);
  assert.equal(body.equals(ATTACK_BYTES), false, `owner download status ${response.status}`);
  const uploads = await uploadRefs();
  const served = uploads.some((row) => row.daycare_id === PUBLIC_ID);
  if (served) {
    const again = await licenseHandlers.GET({ params: { daycareId: PUBLIC_ID } });
    const againBody = Buffer.from(await again.arrayBuffer());
    assert.equal(againBody.equals(ATTACK_BYTES), false, "upload overlay served the anonymous file");
  }
});

test("an anonymous submission does not replace the licence already on file", async () => {
  await pg.query("update daycares set license_photo = $2 where id = $1", [PUBLIC_ID, OFFICIAL_KEY]);
  await callEnroll(enrol());
  assert.equal(await column(PUBLIC_ID), OFFICIAL_KEY);
  await pg.query(`insert into provider_daycares (user_id, daycare_id) values ('owner-later', $1)`, [PUBLIC_ID]);
  state().actorId = "owner-later";
  const response = await licenseHandlers.GET({ params: { daycareId: PUBLIC_ID } });
  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(body.equals(OFFICIAL_BYTES), true);
  assert.equal(body.equals(ATTACK_BYTES), false);
});

test("an anonymous private storage key is not attached to the centre", async () => {
  const putsBefore = state().puts.length;
  await callEnroll(enrol({ licensePhoto: PASSTHROUGH_KEY }));
  assert.equal(state().puts.length, putsBefore);
  assert.equal(await column(PUBLIC_ID), null);
  const uploads = await uploadRefs();
  assert.equal(uploads.some((row) => row.license_photo === PASSTHROUGH_KEY), false);
  const health = await loadDaycareHealth(state().sql, PUBLIC_ID);
  assert.equal(fileCheck(health).state, "missing");
});

test("a signed-in owner of one centre cannot attach a licence to another centre", async () => {
  const outcome = await callEnroll(enrol({ daycareId: PUBLIC_ID, centre: "Harbour Kids Centre" }), "owner-a");
  assert.equal(await column(PUBLIC_ID), null, outcome.error ? outcome.error.message : "owner of another centre");
  assert.equal(await column(OWNED_ID), null);
  const health = await loadDaycareHealth(state().sql, PUBLIC_ID);
  assert.equal(fileCheck(health).state, "missing");
});

test("a refused enrol does not leave a private object behind", async () => {
  const missing = await callEnroll(enrol({ name: "   ", email: "", centre: "", city: "", body: "" }));
  assert.ok(missing.error);
  assert.deepEqual(state().puts, []);
  assert.equal((await uploadRefs()).length, 0);
  assert.equal(await column(PUBLIC_ID), null);

  const hidden = await callEnroll(
    enrol({
      daycareId: HIDDEN_ID,
      centre: "Hidden Kids Centre",
      city: "Winnipeg",
    }),
  );
  assert.ok(hidden.error);
  assert.deepEqual(state().puts, []);
  assert.equal((await uploadRefs()).length, 0);
  assert.equal(await column(HIDDEN_ID), null);
});

test("the admin queue and profile health ignore an anonymous licence on a centre already in review", async () => {
  await callEnroll(enrol({ daycareId: REVIEW_ID, centre: "River Kids Centre" }));
  const stored = await column(REVIEW_ID);
  const health = await loadDaycareHealth(state().sql, REVIEW_ID);
  const queue = await readAdminCentreQueueRows();
  const card = queue.find((row) => row.daycareId === REVIEW_ID);
  assert.equal(stored, null);
  assert.equal(fileCheck(health).state, "missing");
  assert.ok(card, "the waiting claim stays on the admin queue");
  assert.equal(card.licensePhoto, null);
});

test("verifyClaim does not store a file or write a licence before the caller has that claim", async () => {
  state().actorId = "stranger";
  await assert.rejects(
    verifyClaim({
      context: { userId: "stranger" },
      data: {
        daycareId: PUBLIC_ID,
        code: "AAAAAA",
        licensePhoto: ATTACK_URL,
        turnstileToken: SOLVED,
        acceptTermsVersion: PROVIDER_TERMS_VERSION,
      },
    }),
  );
  assert.deepEqual(state().puts, []);
  assert.equal(await column(PUBLIC_ID), null);
  assert.equal((await uploadRefs()).length, 0);
});

test("verifyClaim does not copy a caller-supplied private key onto the centre", async () => {
  await pg.query(
    `insert into listing_claims (id, daycare_id, user_id, status, code, contact_verified)
     values ('claim-stranger', $1, 'stranger', 'pending', 'ABCDEF', 0)`,
    [PUBLIC_ID],
  );
  state().actorId = "stranger";
  await verifyClaim({
    context: { userId: "stranger" },
    data: {
      daycareId: PUBLIC_ID,
      code: "",
      licensePhoto: PASSTHROUGH_KEY,
      turnstileToken: SOLVED,
      acceptTermsVersion: PROVIDER_TERMS_VERSION,
    },
  }).catch((error) => error);
  assert.equal(await column(PUBLIC_ID), null);
  const claimPhoto = (
    await pg.query("select license_photo from listing_claims where id = 'claim-stranger'")
  ).rows[0].license_photo;
  assert.equal(claimPhoto, null);
});

test("updateListing still refuses a licence write from someone who does not work at the centre", async () => {
  state().actorId = "stranger";
  await assert.rejects(
    updateListing({
      context: { userId: "stranger" },
      data: { daycareId: PUBLIC_ID, licensePhoto: ATTACK_URL },
    }),
  );
  assert.deepEqual(state().puts, []);
  assert.equal(await column(PUBLIC_ID), null);
});
