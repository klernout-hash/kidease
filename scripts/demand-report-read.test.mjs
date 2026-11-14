import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { after, afterEach, beforeEach, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// Exercise both real handlers and their real government/private/admin guards.
// SQL, verified session lookup, user lookup and 2FA proofs are local fixtures.
// No job, delivery helper, external service or real database is invoked.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const key = "__kideaseDemandReadTest";
const prefix = "kidease-demand-read-test:";
const modules = {
  transport: `
    export function createMiddleware() {
      return { client() { return this; }, server(run) { return { run }; } };
    }
    export function createServerFn() {
      let guards = [], validate = value => value;
      return {
        middleware(value) { guards = value; return this; },
        validator(value) { validate = value; return this; },
        handler(run) {
          return async (input = {}) => {
            const data = validate(input.data);
            const next = (index, context) => index === guards.length
              ? run({ data, context })
              : guards[index].run({ context, next: value => next(index + 1, { ...context, ...value?.context }) });
            return next(0, {});
          };
        }
      };
    }`,
  db: `export const getSql = async () => globalThis.${key}.acquire();`,
  verify: `export async function requireUserId() {
    const state = globalThis.${key};
    if (!state.userId) throw Object.assign(new Error("Not authenticated"), { status: 401 });
    return state.userId;
  }`,
  isolation: `export function assertSameSiteRequest() {
    if (globalThis.${key}.crossSite) throw Object.assign(new Error("Cross-site request"), { status: 403 });
  }`,
  notify: `export async function lookupUser() {
    const state = globalThis.${key}; state.userLookups++;
    if (state.userLookupError) throw state.userLookupError;
    return state.user;
  }`,
  centreAccess: `
    function unused() { throw new Error("Centre access is not part of demand reads"); }
    export const listAccessibleDaycareIds = unused;
    export const isActiveCentreMember = unused;
    export const listOwnedDaycareIds = unused;`,
  twoFactor: `
    export function assertTwoFactorVerified() {
      const state = globalThis.${key}; state.proofs.push("2fa");
      if (state.twoFactorError) throw state.twoFactorError;
    }
    export async function assertTrustedDeviceActive() {
      const state = globalThis.${key}; state.proofs.push("device");
      if (state.deviceError) throw state.deviceError;
    }
    export async function assertAdminIdleFresh() {
      const state = globalThis.${key}; state.proofs.push("idle");
      if (state.idleError) throw state.idleError;
      state.phase = "demand";
    }`,
};
const replacements = new Map([
  ["src/lib/db.ts", "db"],
  ["src/lib/auth/verify.server.ts", "verify"],
  ["src/lib/auth/isolation.server.ts", "isolation"],
  ["src/lib/server/notify.ts", "notify"],
  ["src/lib/server/centre-access.ts", "centreAccess"],
  ["src/lib/server/two-factor.server.ts", "twoFactor"],
].map(([file, name]) => [pathToFileURL(join(root, file)).href, name]));

function sourceFile(specifier, parentURL) {
  let file;
  if (specifier.startsWith("@/")) file = join(root, "src", specifier.slice(2));
  else if (specifier.startsWith(".") && parentURL?.startsWith("file:")) file = fileURLToPath(new URL(specifier, parentURL));
  if (!file) return null;
  return [file, `${file}.ts`, `${file}.tsx`, `${file}.mjs`].find(existsSync) ?? null;
}

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@tanstack/react-start") return { url: `${prefix}transport`, shortCircuit: true };
    const file = sourceFile(specifier, context.parentURL);
    if (!file) return nextResolve(specifier, context);
    const url = pathToFileURL(file).href;
    const mock = replacements.get(url);
    return { url: mock ? `${prefix}${mock}` : url, shortCircuit: true };
  },
  load(url, context, nextLoad) {
    if (!url.startsWith(prefix)) return nextLoad(url, context);
    return { format: "module", source: modules[url.slice(prefix.length)], shortCircuit: true };
  },
});

const { loadGovDemand, loadAdminDemand } = await import("../src/lib/server/compliance-demand.ts");

function reset(viewer = "government") {
  const admin = viewer === "admin";
  const fixture = {
    userId: admin ? "admin-user" : "gov-user",
    profileRole: admin ? "admin" : "government",
    user: { email: admin ? "kyle@kidease.ca" : "government@example.invalid", emailVerified: true, name: "Test reader" },
    actor: { role: "government", org_id: "org-mb", org_name: "Province desk", province: "MB", demo: 0, read_only: 0, status: "active" },
    scope: { role: "government", gov_province: "ON", org_province: "MB" },
    phase: "auth",
    calls: [],
    acquisitions: [],
    proofs: [],
    userLookups: 0,
    networkCalls: 0,
    failure: null,
    rows: [
      { province: "MB", city: "Winnipeg", age_group: "infant", n: 6, child_name: "Private child" },
      { province: "ON", city: "Toronto", age_group: "toddler", n: 7, email: "private@example.invalid" },
    ],
  };
  async function query(text, values = []) {
    if (/o\.province\s+as\s+org_province/i.test(text)) {
      fixture.calls.push({ kind: "scope", text, values });
      fixture.phase = "demand";
      return fixture.scope ? [fixture.scope] : [];
    }
    if (/join government_members/i.test(text)) {
      fixture.calls.push({ kind: "actor", text, values });
      if (fixture.actorQueryError) throw fixture.actorQueryError;
      fixture.phase = "scope";
      return fixture.actor ? [fixture.actor] : [];
    }
    if (/select role from profiles/i.test(text)) {
      fixture.calls.push({ kind: "profile-role", text, values });
      if (fixture.profileRoleError) throw fixture.profileRoleError;
      return [{ role: fixture.profileRole }];
    }
    if (/insert into profiles[\s\S]*on conflict \(user_id\) do nothing/i.test(text)) {
      // Existing resolveAdminAccess bookkeeping is simulated, never executed.
      fixture.calls.push({ kind: "mocked-profile-ensure", text, values });
      return [];
    }
    if (/from daycare_waitlist/i.test(text)) {
      fixture.calls.push({ kind: "demand", text, values });
      if (fixture.failure === "query") throw new Error("Mocked demand query failure");
      if (fixture.failure === "non-array") return { rows: [] };
      if (fixture.failure === "malformed-read") return [{ province: "MB", city: {}, age_group: "infant", n: 6 }];
      return fixture.rows;
    }
    throw new Error(`Unexpected mocked SQL: ${text.slice(0, 100)}`);
  }
  const sql = (parts, ...values) => query(parts.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, ""), values);
  sql.query = query;
  fixture.acquire = () => {
    fixture.acquisitions.push(fixture.phase);
    if (fixture.phase === "demand" && fixture.failure === "acquire") throw new Error("Mocked demand SQL acquisition failure");
    if (fixture.phase === "scope" && fixture.scopeAcquireError) throw fixture.scopeAcquireError;
    if (fixture.phase === "auth" && fixture.authAcquireError) throw fixture.authAcquireError;
    return sql;
  };
  globalThis[key] = fixture;
  return fixture;
}

const state = () => globalThis[key];
const demandCalls = () => state().calls.filter((call) => call.kind === "demand");
const flagNames = ["FEATURE_DEMAND_REPORTS", "FEATURE_DEMAND_REPORTS_LIVE"];
let oldFlags;
let oldFetch;
beforeEach(() => {
  reset();
  oldFlags = flagNames.map((flag) => process.env[flag]);
  process.env.FEATURE_DEMAND_REPORTS = "1";
  process.env.FEATURE_DEMAND_REPORTS_LIVE = "0";
  oldFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    state().networkCalls += 1;
    throw new Error("Network and delivery are forbidden in demand read tests");
  };
});
afterEach(() => {
  for (const [index, flag] of flagNames.entries()) {
    if (oldFlags[index] === undefined) delete process.env[flag];
    else process.env[flag] = oldFlags[index];
  }
  globalThis.fetch = oldFetch;
});
after(() => { hooks.deregister(); delete globalThis[key]; });

const readers = [
  { viewer: "government", province: "MB", run: () => loadGovDemand() },
  { viewer: "admin", province: "ON", run: () => loadAdminDemand({ data: { province: "ON" } }) },
];

function assertScopedRead(province) {
  const query = demandCalls()[0];
  assert.ok(query);
  assert.deepEqual(query.values, [province]);
  assert.match(query.text, /upper\(btrim\(d\.province\)\) = \$1/i);
  assert.equal(state().networkCalls, 0);
}

test("government and admin demand reads report acquisition, query and malformed results as unavailable without rows", async () => {
  for (const reader of readers) {
    for (const failure of ["acquire", "query", "non-array", "malformed-read"]) {
      reset(reader.viewer);
      state().failure = failure;
      const result = await reader.run();
      assert.equal(result.status, "unavailable", `${reader.viewer}/${failure}`);
      assert.equal(result.province, reader.province);
      assert.equal(Object.hasOwn(result, "rows"), false, "A failed read must not resemble an empty report");
      assert.equal(state().networkCalls, 0);
      assert.equal(state().acquisitions.at(-1), "demand", "Failure is simulated only after successful authorization");
      assert.equal(demandCalls().length, failure === "acquire" ? 0 : 1);
      if (failure !== "acquire") assertScopedRead(reader.province);
    }
  }
});

test("successful empty government and admin queries remain ready reports with real empty rows", async () => {
  for (const reader of readers) {
    reset(reader.viewer);
    state().rows = [];
    const result = await reader.run();
    assert.equal(result.status, "ready");
    assert.equal(result.enabled, true);
    assert.deepEqual(result.rows, []);
    assertScopedRead(reader.province);
  }
});

test("government organization scope and admin-selected province still filter mixed demand rows", async () => {
  for (const reader of readers) {
    reset(reader.viewer);
    const result = await reader.run();
    assert.equal(result.status, "ready");
    assert.equal(result.province, reader.province);
    const expected = reader.viewer === "government" ? ["Winnipeg", "infant", 6] : ["Toronto", "toddler", 7];
    assert.deepEqual(result.rows.map((row) => [row.area, row.ageKey, row.n]), [expected]);
    assert.equal(JSON.stringify(result).includes("Private child"), false);
    assert.equal(JSON.stringify(result).includes("private@example.invalid"), false);
    assertScopedRead(reader.province);
    if (reader.viewer === "admin") {
      assert.deepEqual(state().proofs, ["2fa", "device", "idle"], "Actual requireAdmin invokes all authentication proofs before querying demand");
      assert.equal(state().userLookups, 2, "Actual resolveAdminAccess and requireAdmin perform user checks");
    }
  }
});

test("successful demand reports retain small-cell suppression", async () => {
  for (const reader of readers) {
    reset(reader.viewer);
    state().rows = [
      { province: reader.province, city: "Small A", age_group: "infant", n: 2 },
      { province: reader.province, city: "Small B", age_group: "infant", n: 3 },
      { province: reader.province, city: "Larger", age_group: "toddler", n: 9 },
    ];
    const result = await reader.run();
    assert.equal(result.status, "ready");
    assert.equal(result.rows.some((row) => row.n > 0 && row.n < 5), false);
    assertScopedRead(reader.province);
  }
});

test("government and admin feature-off reads remain authenticated and do not acquire demand SQL", async () => {
  process.env.FEATURE_DEMAND_REPORTS = "0";
  for (const reader of readers) {
    reset(reader.viewer);
    state().failure = "acquire";
    const result = await reader.run();
    assert.equal(result.status, "off");
    assert.equal(result.enabled, false);
    assert.deepEqual(result.rows, []);
    assert.deepEqual(demandCalls(), []);
    assert.equal(state().acquisitions.includes("demand"), false);
    assert.equal(state().networkCalls, 0);
    if (reader.viewer === "admin") assert.deepEqual(state().proofs, ["2fa", "device", "idle"]);
  }
});

test("session, request, actor and scope failures propagate instead of becoming unavailable reports", async () => {
  for (const reader of readers) {
    reset(reader.viewer);
    state().userId = null;
    await assert.rejects(reader.run(), (error) => error.status === 401);
    assert.deepEqual(demandCalls(), []);
    reset(reader.viewer);
    state().crossSite = true;
    await assert.rejects(reader.run(), (error) => error.status === 403);
    assert.deepEqual(state().calls, []);
    reset(reader.viewer);
    state().authAcquireError = new Error("Mocked auth SQL failure");
    await assert.rejects(reader.run(), /Mocked auth SQL failure/);
    assert.deepEqual(demandCalls(), []);
  }
  reset();
  state().scopeAcquireError = new Error("Mocked scope SQL failure");
  await assert.rejects(loadGovDemand(), /Mocked scope SQL failure/);
  assert.deepEqual(demandCalls(), []);
  for (const actor of [null, { province: "invalid" }, { status: "revoked" }, { role: "parent" }]) {
    reset();
    if (actor) Object.assign(state().actor, actor);
    else state().actor = null;
    await assert.rejects(loadGovDemand(), (error) => error.status === 403);
    assert.deepEqual(demandCalls(), []);
  }
});

test("actual admin access and 2FA failures cannot be swallowed by demand read recovery", async () => {
  for (const role of ["parent", "provider", "support", "admin"]) {
    reset("admin");
    state().profileRole = role;
    state().user.email = "other@example.invalid";
    await assert.rejects(loadAdminDemand(), /Not authorized/);
    assert.deepEqual(state().proofs, []);
    assert.deepEqual(demandCalls(), []);
  }
  reset("admin");
  state().profileRole = "government";
  await assert.rejects(loadAdminDemand(), (error) => error.status === 403);
  assert.equal(state().userLookups, 0, "Government role stops at the actual private middleware");
  assert.deepEqual(demandCalls(), []);
  for (const proof of ["twoFactorError", "deviceError", "idleError"]) {
    reset("admin");
    state()[proof] = new Error(`Mocked ${proof}`);
    await assert.rejects(loadAdminDemand(), new RegExp(`Mocked ${proof}`));
    assert.deepEqual(demandCalls(), []);
  }
});

test("feature-off mode does not bypass government or admin authorization", async () => {
  process.env.FEATURE_DEMAND_REPORTS = "0";
  reset();
  state().actor.province = "invalid";
  await assert.rejects(loadGovDemand(), (error) => error.status === 403);
  reset("admin");
  state().user.email = "other@example.invalid";
  await assert.rejects(loadAdminDemand(), /Not authorized/);
  assert.deepEqual(demandCalls(), []);
});

test("government demo and read-only readers retain successful demand reads", async () => {
  for (const property of ["demo", "read_only"]) {
    reset();
    state().actor[property] = 1;
    const result = await loadGovDemand();
    assert.equal(result.status, "ready");
    assert.deepEqual(result.rows.map((row) => row.n), [6]);
    assertScopedRead("MB");
  }
});
