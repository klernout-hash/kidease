import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// Import the real handlers, government middleware, actor loader and aggregation
// rules. Only framework transport, SQL, session lookup and feature flags are
// replaced. No database or HTTP server is involved in this boundary suite.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stateKey = "__kideaseGovQueryScopeTest";
const virtualPrefix = "kidease-gov-query-test:";
const virtual = {
  transport: `
    export function createMiddleware() {
      return { client() { return this; }, server(run) { return { run }; } };
    }
    export function createServerFn() {
      let middlewares = [], validate = value => value;
      return {
        middleware(value) { middlewares = value; return this; },
        validator(value) { validate = value; return this; },
        handler(run) {
          return async (input = {}) => {
            const data = validate(input.data);
            const next = (index, context) => index === middlewares.length
              ? run({ data, context })
              : middlewares[index].run({ context, next: value => next(index + 1, { ...context, ...value?.context }) });
            return next(0, {});
          };
        }
      };
    }`,
  db: `export async function getSql() { return globalThis.${stateKey}.sql; }`,
  features: `
    export const eceJobsEnabled = () => globalThis.${stateKey}.jobsEnabled;
    export const curriculumPackEnabled = () => globalThis.${stateKey}.curriculumEnabled;
    export const curriculumPackLive = () => globalThis.${stateKey}.curriculumLive;
    export const govScopesEnabled = () => globalThis.${stateKey}.scopesEnabled;
    export const storyCornerEnabled = () => false;`,
  verify: `export async function requireUserId() {
    const id = globalThis.${stateKey}.userId;
    if (!id) throw Object.assign(new Error("Not authenticated"), { status: 401 });
    return id;
  }`,
  isolation: `export function assertSameSiteRequest() {
    if (globalThis.${stateKey}.crossSite) throw Object.assign(new Error("Cross-site request"), { status: 403 });
  }`,
  privateAuth: `export const authMiddleware = { run: () => { throw new Error("Wrong auth middleware"); } };`,
  centreAccess: `export const listAccessibleDaycareIds = () => { throw new Error("Private centre lookup is not part of government reads"); };`,
  roles: `export const requireAdmin = () => { throw new Error("Government reads must not invoke admin access"); };`,
};
const mockFiles = new Map([
  ["src/lib/db.ts", "db"],
  ["src/lib/features.ts", "features"],
  ["src/lib/auth/verify.server.ts", "verify"],
  ["src/lib/auth/isolation.server.ts", "isolation"],
  ["src/lib/auth/middleware.ts", "privateAuth"],
  ["src/lib/server/centre-access.ts", "centreAccess"],
  ["src/lib/server/roles.ts", "roles"],
].map(([file, name]) => [pathToFileURL(join(root, file)).href, name]));

function resolveSource(specifier, parentURL) {
  let candidate;
  if (specifier.startsWith("@/")) candidate = join(root, "src", specifier.slice(2));
  else if (specifier.startsWith(".") && parentURL?.startsWith("file:")) candidate = fileURLToPath(new URL(specifier, parentURL));
  if (!candidate) return null;
  return [candidate, `${candidate}.ts`, `${candidate}.tsx`, `${candidate}.mjs`].find(existsSync) ?? null;
}

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@tanstack/react-start") return { url: `${virtualPrefix}transport`, shortCircuit: true };
    const source = resolveSource(specifier, context.parentURL);
    if (!source) return nextResolve(specifier, context);
    const url = pathToFileURL(source).href;
    const mock = mockFiles.get(url);
    return { url: mock ? `${virtualPrefix}${mock}` : url, shortCircuit: true };
  },
  load(url, context, nextLoad) {
    if (!url.startsWith(virtualPrefix)) return nextLoad(url, context);
    return { format: "module", source: virtual[url.slice(virtualPrefix.length)], shortCircuit: true };
  },
});

const { listJobShortage } = await import("../src/lib/server/ece-jobs.ts");
const { governmentCurriculumTotals } = await import("../src/lib/server/curriculum-pack.ts");
const { loadGovScope } = await import("../src/lib/server/gov-scopes.ts");
const { readScope } = await import("../src/lib/server/compliance-common.ts");
const { loadGovDemand } = await import("../src/lib/server/compliance-demand.ts");
const { loadGovActor } = await import("../src/lib/server/gov-actor.server.ts");
const { PROVINCE_CODES } = await import("../src/lib/curriculum/pack.ts");
const { PUBLIC_LISTING_SQL } = await import("../src/lib/listing-visibility.ts");

function reset() {
  const state = {
    userId: "gov-user",
    actor: { role: "government", org_id: "org-mb", org_name: "Province desk", province: "MB", demo: 0, read_only: 0, status: "active" },
    actorError: null,
    crossSite: false,
    jobsEnabled: true,
    curriculumEnabled: true,
    curriculumLive: true,
    scopesEnabled: true,
    legacyError: null,
    complianceScope: { role: "government", gov_province: "ON", org_province: "MB" },
    complianceScopeError: null,
    networkCalls: 0,
    calls: [],
    jobs: [
      { province: "MB", open_jobs: 4, centres: 2 },
      { province: "Manitoba", open_jobs: 2, centres: 1 },
      { province: "ON", open_jobs: 28, centres: 9 },
      { province: "QC", open_jobs: 16, centres: 8 },
    ],
    stories: [
      ...Array.from({ length: 6 }, () => ({ province: "MB", goal_ids: ["MB-belong"] })),
      ...Array.from({ length: 7 }, () => ({ province: "ON", goal_ids: ["ON-well"] })),
    ],
    legacyRows: [
      { province: "MB", open_spots: 2, name: "Private centre name", address: "Private street", child: "Private child" },
      { province: " mb ", open_spots: 3 },
      { province: "ON", open_spots: 99, name: "Foreign centre" },
      { province: "US", open_spots: 400 },
    ],
    demandRows: [
      { province: "MB", city: "Winnipeg", age_group: "infant", n: 6, child_name: "Private child" },
      { province: "ON", city: "Toronto", age_group: "toddler", n: 7, email: "private@example.invalid" },
    ],
  };
  async function query(text, values = []) {
    if (/o\.province\s+as\s+org_province/i.test(text)) {
      state.calls.push({ kind: "compliance-scope", text, values });
      if (state.complianceScopeError) throw state.complianceScopeError;
      return state.complianceScope ? [state.complianceScope] : [];
    }
    if (/from profiles p/i.test(text)) {
      state.calls.push({ kind: "actor", text, values });
      if (state.actorError) throw state.actorError;
      return state.actor ? [state.actor] : [];
    }
    if (/from centre_job_posts/i.test(text)) {
      state.calls.push({ kind: "jobs", text, values });
      // Deliberately include foreign rows even with a scoped SQL predicate.
      return state.jobs;
    }
    if (/^\s*create table/i.test(text)) {
      state.calls.push({ kind: "mocked-schema-ensure", text, values });
      return [];
    }
    if (/from curriculum_story_meta/i.test(text)) {
      state.calls.push({ kind: "curriculum", text, values });
      return state.stories;
    }
    if (/from daycares\b/i.test(text) && /open_spots/i.test(text)) {
      state.calls.push({ kind: "legacy-scope", text, values });
      if (state.legacyError) throw state.legacyError;
      return state.legacyRows;
    }
    if (/from daycare_waitlist\b/i.test(text)) {
      state.calls.push({ kind: "demand", text, values });
      return state.demandRows;
    }
    throw new Error(`Unexpected mocked SQL: ${text.slice(0, 80)}`);
  }
  state.sql = (parts, ...values) => query(parts.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, ""), values);
  state.sql.query = query;
  globalThis[stateKey] = state;
  return state;
}

beforeEach(reset);
after(() => { hooks.deregister(); delete globalThis[stateKey]; });
const state = () => globalThis[stateKey];
const aggregateCalls = () => state().calls.filter((call) => call.kind !== "actor");
const readCall = (kind) => state().calls.find((call) => call.kind === kind);
function assertSqlScope(kind, province) {
  const call = readCall(kind);
  assert.ok(call, `${kind} query executed`);
  assert.match(call.text, /(?:where|and)[\s\S]*\bd\.province\b[\s\S]*=\s*any\(/i, "SQL has a bound province predicate");
  const aliases = call.values.find(Array.isArray);
  assert.ok(aliases?.includes(province), "SQL receives only the authorized province aliases");
  const foreignCode = province === "ON" ? "MB" : "ON";
  assert.equal(aliases.includes(foreignCode), false, "Foreign province is absent from the SQL scope");
}

test("job counts clamp foreign, national and omitted requests to the authenticated province", async () => {
  for (const requested of ["ON", "ALL", "CA", "", undefined]) {
    reset();
    const result = await listJobShortage({ data: { province: requested } });
    assert.deepEqual(result, { enabled: true, province: "MB", openJobs: 6, centres: 3 });
    assertSqlScope("jobs", "MB");
    assert.ok(readCall("jobs").values.find(Array.isArray).includes("MANITOBA"), "Existing full-name province rows remain supported");
  }
});

test("curriculum counts clamp foreign, national and invalid requests before aggregation", async () => {
  for (const requested of ["ON", "ALL", "CA", "", undefined, "invalid"]) {
    reset();
    const result = await governmentCurriculumTotals({ data: { province: requested } });
    assert.equal(result.province, "MB");
    assert.equal(result.childCount, 6);
    assert.deepEqual(result.goals.map((goal) => [goal.goalId, goal.children]), [["MB-belong", 6]]);
    assertSqlScope("curriculum", "MB");
  }
});

test("national actors retain selected-province jobs and provincial or all-Canada curriculum reads", async () => {
  for (const stored of ["CA", "ALL"]) {
    reset();
    state().actor.province = stored;
    const jobs = await listJobShortage({ data: { province: "ON" } });
    assert.deepEqual(jobs, { enabled: true, province: "ON", openJobs: 28, centres: 9 });
    assertSqlScope("jobs", "ON");
    const selected = await governmentCurriculumTotals({ data: { province: "ON" } });
    assert.equal(selected.province, "ON");
    assert.equal(selected.childCount, 7);
    assert.deepEqual(selected.goals.map((goal) => goal.goalId), ["ON-well"]);
    assertSqlScope("curriculum", "ON");
    for (const requested of ["ALL", "CA", undefined]) {
      const all = await governmentCurriculumTotals({ data: { province: requested } });
      assert.equal(all.province, "ALL");
      assert.equal(all.childCount, 13);
      assert.deepEqual(all.goals.map((goal) => [goal.goalId, goal.children]), [["MB-belong", 6], ["ON-well", 7]]);
      const allQuery = state().calls.filter((call) => call.kind === "curriculum").at(-1);
      assert.equal(allQuery.values[0], "ALL");
    }
  }
});

test("curriculum keeps existing stored province aliases without widening national alias requests", async () => {
  const cases = [
    { stored: "PE", requested: "ON", rowProvince: "PEI", scoped: "PE" },
    { stored: "QC", requested: "ON", rowProvince: "Q.C.", scoped: "QC" },
    { stored: "CA", requested: "PEI", rowProvince: "PEI", scoped: "PE" },
    { stored: "CA", requested: "Québec", rowProvince: "Q.C.", scoped: "QC" },
  ];
  for (const scenario of cases) {
    reset();
    state().actor.province = scenario.stored;
    state().stories = [
      ...Array.from({ length: 6 }, () => ({ province: scenario.rowProvince, goal_ids: [`${scenario.scoped}-belong`] })),
      ...Array.from({ length: 7 }, () => ({ province: "ON", goal_ids: ["ON-well"] })),
    ];
    const result = await governmentCurriculumTotals({ data: { province: scenario.requested } });
    assert.equal(result.province, scenario.scoped);
    assert.equal(result.childCount, 6);
    assert.deepEqual(result.goals.map((goal) => goal.goalId), [`${scenario.scoped}-belong`]);
    assertSqlScope("curriculum", scenario.scoped);
    const query = readCall("curriculum");
    assert.equal(query.values[0], scenario.scoped);
    assert.match(query.text, /replace\(upper\(btrim/, "Stored dotted aliases remain supported by SQL normalization");
    if (scenario.scoped === "PE") assert.ok(query.values[1].includes("PEI"));
  }
});

test("unsupported national jobs scope does not issue an unscoped totals query", async () => {
  for (const requested of ["ALL", "CA", undefined]) {
    reset();
    state().actor.province = "CA";
    const result = await listJobShortage({ data: { province: requested } });
    assert.equal(result.province, "", "Legacy unsupported scope is retained, not advertised as a verified national total");
    assert.deepEqual(aggregateCalls(), []);
  }
});

test("invalid or missing stored organization scopes fail closed before either aggregate query", async () => {
  for (const stored of [null, undefined, "", " ", "invalid", "Ontario", "US"]) {
    for (const handler of [listJobShortage, governmentCurriculumTotals]) {
      reset();
      state().actor.province = stored;
      await assert.rejects(handler({ data: { province: "MB" } }), (error) => error.status === 403);
      assert.deepEqual(aggregateCalls(), []);
    }
  }
});

test("all legitimate provincial and national organizations retain their actor classification", async () => {
  for (const province of [...PROVINCE_CODES, "CA", "ALL"]) {
    reset();
    state().actor.province = ` ${province.toLowerCase()} `;
    const actor = await loadGovActor("gov-user");
    assert.equal(actor?.national, province === "CA" || province === "ALL");
    assert.equal(actor?.province, province === "CA" ? "ALL" : province);
    assert.equal(actor?.userId, "gov-user");
  }
});

test("unauthenticated, wrong-role, inactive and missing membership requests never reach aggregates", async () => {
  const cases = [
    { userId: null, status: 401 },
    ...["parent", "provider", "admin", "support"].map((role) => ({ actor: { role }, status: 403 })),
    { actor: { status: "revoked" }, status: 403 },
    { actor: { status: "pending" }, status: 403 },
    { missing: true, status: 403 },
  ];
  for (const scenario of cases) {
    for (const handler of [listJobShortage, governmentCurriculumTotals]) {
      reset();
      if ("userId" in scenario) state().userId = scenario.userId;
      if (scenario.actor) Object.assign(state().actor, scenario.actor);
      if (scenario.missing) state().actor = null;
      await assert.rejects(handler({ data: { province: "MB" } }), (error) => error.status === scenario.status);
      assert.deepEqual(aggregateCalls(), []);
    }
  }
});

test("actor lookup failures and cross-site requests propagate without aggregate queries", async () => {
  for (const handler of [listJobShortage, governmentCurriculumTotals]) {
    reset();
    state().actorError = new Error("Mocked actor lookup failure");
    await assert.rejects(handler({ data: { province: "MB" } }), /Mocked actor lookup failure/);
    assert.deepEqual(aggregateCalls(), []);
    reset();
    state().crossSite = true;
    await assert.rejects(handler({ data: { province: "MB" } }), (error) => error.status === 403);
    assert.deepEqual(state().calls, []);
  }
});

test("feature-off responses still authenticate and clamp scope without aggregate or schema queries", async () => {
  state().jobsEnabled = false;
  state().curriculumEnabled = false;
  const jobs = await listJobShortage({ data: { province: "ON" } });
  assert.deepEqual(jobs, { enabled: false, province: "MB", openJobs: 0, centres: 0 });
  const curriculum = await governmentCurriculumTotals({ data: { province: "ALL" } });
  assert.equal(curriculum.enabled, false);
  assert.deepEqual(aggregateCalls(), []);
  state().actor.province = "invalid";
  for (const handler of [listJobShortage, governmentCurriculumTotals]) {
    await assert.rejects(handler({ data: { province: "MB" } }), (error) => error.status === 403);
  }
  assert.deepEqual(aggregateCalls(), []);
});

test("demo and read-only government actors retain scoped reads and curriculum suppression", async () => {
  for (const properties of [{ read_only: 1 }, { demo: 1 }]) {
    reset();
    Object.assign(state().actor, properties);
    assert.equal((await loadGovActor("gov-user"))?.readOnly, true);
    const jobs = await listJobShortage({ data: { province: "ON" } });
    assert.equal(jobs.province, "MB");
    assert.equal(jobs.openJobs, 6);
    state().stories = state().stories.slice(0, 3);
    const curriculum = await governmentCurriculumTotals({ data: { province: "ON" } });
    assert.equal(curriculum.province, "MB");
    assert.equal(curriculum.childCount, null);
    assert.deepEqual(curriculum.goals.map((goal) => goal.children), [null]);
    assertSqlScope("jobs", "MB");
    assertSqlScope("curriculum", "MB");
  }
});

function assertNoLegacyTotals(result) {
  assert.equal(Object.hasOwn(result, "centres"), false);
  assert.equal(Object.hasOwn(result, "openSpots"), false);
  assert.equal(Object.values(result).some((value) => typeof value === "number"), false, "Unavailable states contain no numeric total");
}

function assertLegacySqlScope(province) {
  const call = readCall("legacy-scope");
  assert.ok(call, "The scoped legacy aggregate query executed");
  assert.deepEqual(call.values, [province]);
  assert.match(call.text, /upper\(btrim\(coalesce\(province,\s*''\)\)\)\s*=\s*\$1/i);
  assert.ok(call.text.includes(PUBLIC_LISTING_SQL), "The existing public-listing exclusions remain in SQL");
}

test("legacy scope trusts organization membership instead of conflicting profile or request provinces", async () => {
  state().actor.gov_province = "ON";
  const result = await loadGovScope({ data: { province: "ALL", govProvince: "ON" } });
  assert.deepEqual(result, { show: true, reason: "ok", province: "MB", centres: 2, openSpots: 5 });
  assertLegacySqlScope("MB");
  assert.equal(state().calls.filter((call) => call.kind === "actor").length, 1);
  assert.equal(state().calls.some((call) => /gov_province/i.test(call.text)), false, "The separate legacy profile scope is never queried");
  assert.deepEqual(Object.keys(result).sort(), ["centres", "openSpots", "province", "reason", "show"]);
  assert.equal(JSON.stringify(result).includes("Private"), false);
  assert.equal(JSON.stringify(result).includes("Foreign"), false);
});

test("legacy scope preserves legitimate reads for all thirteen provinces and territories", async () => {
  for (const province of PROVINCE_CODES) {
    reset();
    state().actor.province = province;
    const foreign = province === "MB" ? "ON" : "MB";
    state().legacyRows = [
      { province, open_spots: 2 },
      { province: ` ${province.toLowerCase()} `, open_spots: 3 },
      { province: foreign, open_spots: 99 },
    ];
    const result = await loadGovScope();
    assert.deepEqual(result, { show: true, reason: "ok", province, centres: 2, openSpots: 5 });
    assertLegacySqlScope(province);
  }
});

test("legacy national scope is explicitly unsupported without querying or returning totals", async () => {
  for (const province of ["CA", "ALL"]) {
    reset();
    state().actor.province = province;
    const result = await loadGovScope({ data: { province: "MB" } });
    assert.deepEqual(result, { show: true, reason: "unsupported", province: null });
    assertNoLegacyTotals(result);
    assert.deepEqual(aggregateCalls(), []);
  }
});

test("legacy feature-off response authenticates first and contains no fabricated zero totals", async () => {
  state().scopesEnabled = false;
  const result = await loadGovScope();
  assert.deepEqual(result, { show: true, reason: "off", province: null });
  assertNoLegacyTotals(result);
  assert.deepEqual(aggregateCalls(), []);
  state().actor.province = "invalid";
  await assert.rejects(loadGovScope(), (error) => error.status === 403);
  assert.deepEqual(aggregateCalls(), []);
});

test("legacy scope rejects invalid actors before the data query", async () => {
  const cases = [
    { userId: null, status: 401 },
    ...["parent", "provider", "admin", "support"].map((role) => ({ actor: { role }, status: 403 })),
    ...[null, undefined, "", " ", "US", "invalid"].map((province) => ({ actor: { province }, status: 403 })),
    { actor: { status: "revoked" }, status: 403 },
    { actor: { status: "pending" }, status: 403 },
    { missing: true, status: 403 },
  ];
  for (const scenario of cases) {
    reset();
    if ("userId" in scenario) state().userId = scenario.userId;
    if (scenario.actor) Object.assign(state().actor, scenario.actor);
    if (scenario.missing) state().actor = null;
    await assert.rejects(loadGovScope(), (error) => error.status === scenario.status);
    assert.deepEqual(aggregateCalls(), []);
  }
  reset();
  state().actorError = new Error("Mocked actor lookup failure");
  await assert.rejects(loadGovScope(), /Mocked actor lookup failure/);
  assert.deepEqual(aggregateCalls(), []);
  reset();
  state().crossSite = true;
  await assert.rejects(loadGovScope(), (error) => error.status === 403);
  assert.deepEqual(state().calls, []);
});

test("legacy read failure is unavailable while a successful empty query reports real zeros", async () => {
  state().legacyError = new Error("Mocked scope data failure");
  const failed = await loadGovScope();
  assert.deepEqual(failed, { show: true, reason: "unavailable", province: "MB" });
  assertNoLegacyTotals(failed);
  assertLegacySqlScope("MB");
  reset();
  state().legacyRows = [];
  const empty = await loadGovScope();
  assert.deepEqual(empty, { show: true, reason: "ok", province: "MB", centres: 0, openSpots: 0 });
  assertLegacySqlScope("MB");
});

test("legacy demo and read-only government members retain scoped aggregate reads", async () => {
  for (const properties of [{ read_only: 1 }, { demo: 1 }]) {
    reset();
    Object.assign(state().actor, properties);
    const result = await loadGovScope();
    assert.deepEqual(result, { show: true, reason: "ok", province: "MB", centres: 2, openSpots: 5 });
    assertLegacySqlScope("MB");
  }
});

function assertComplianceMembershipRead() {
  const query = readCall("compliance-scope");
  assert.ok(query);
  assert.deepEqual(query.values, ["gov-user"]);
  assert.match(query.text, /left join government_members m on m\.user_id = p\.user_id and m\.status = 'active'/i);
}

async function withDemandRead(enabled, run) {
  const flags = ["FEATURE_DEMAND_REPORTS", "FEATURE_DEMAND_REPORTS_LIVE"];
  const previous = flags.map((flag) => process.env[flag]);
  const previousFetch = globalThis.fetch;
  process.env.FEATURE_DEMAND_REPORTS = enabled ? "1" : "0";
  process.env.FEATURE_DEMAND_REPORTS_LIVE = "0";
  globalThis.fetch = async () => {
    state().networkCalls += 1;
    throw new Error("Network and delivery are forbidden in government read tests");
  };
  try {
    return await run();
  } finally {
    for (const [index, flag] of flags.entries()) {
      if (previous[index] === undefined) delete process.env[flag];
      else process.env[flag] = previous[index];
    }
    globalThis.fetch = previousFetch;
  }
}

function assertDemandReadOnlyScope(province) {
  const query = readCall("demand");
  assert.ok(query);
  assert.deepEqual(query.values, [province]);
  assert.match(query.text, /where w\.status = 'waiting' and upper\(btrim\(d\.province\)\) = \$1/i);
  assert.ok(state().calls.every((call) => /^\s*select\b/i.test(call.text)), "Only mocked SELECT reads are executed");
  assert.equal(state().networkCalls, 0);
}

test("shared compliance scope uses the valid provincial organization over a conflicting profile", async () => {
  for (const province of PROVINCE_CODES) {
    reset();
    state().complianceScope.org_province = ` ${province.toLowerCase()} `;
    state().complianceScope.gov_province = province === "ON" ? "MB" : "ON";
    const scope = await readScope("gov-user");
    assert.equal(scope?.province, province);
    assert.equal(scope?.role, "government");
    assertComplianceMembershipRead();
    assert.deepEqual(state().calls.map((call) => call.kind), ["compliance-scope"]);
  }
});

test("shared compliance scope rejects invalid organizations without falling back to the profile", async () => {
  for (const organization of [null, undefined, "", " ", "US", "Ontario", "invalid"]) {
    reset();
    state().complianceScope.org_province = organization;
    state().complianceScope.gov_province = "ON";
    assert.equal(await readScope("gov-user"), null);
    assertComplianceMembershipRead();
    assert.equal(readCall("demand"), undefined);
  }
  reset();
  state().complianceScope = null;
  assert.equal(await readScope("gov-user"), null);
  reset();
  state().complianceScopeError = new Error("Mocked compliance membership lookup failure");
  assert.equal(await readScope("gov-user"), null);
  assert.equal(readCall("demand"), undefined);
});

test("national compliance scope keeps only a valid provincial profile preference", async () => {
  for (const organization of ["CA", "ALL"]) {
    for (const province of PROVINCE_CODES) {
      reset();
      state().complianceScope.org_province = organization;
      state().complianceScope.gov_province = ` ${province.toLowerCase()} `;
      assert.equal((await readScope("gov-user"))?.province, province);
    }
    for (const preference of [null, undefined, "", "ALL", "CA", "US", "Ontario", "invalid"]) {
      reset();
      state().complianceScope.org_province = organization;
      state().complianceScope.gov_province = preference;
      assert.equal((await readScope("gov-user"))?.province, null, "Invalid national preference cannot create a national aggregate scope");
    }
  }
});

test("shared compliance scope leaves the existing non-government preference behavior unchanged", async () => {
  const cases = [
    { role: "parent", gov_province: "ON", org_province: "MB", expected: "ON" },
    { role: "provider", gov_province: "ON", org_province: null, expected: "ON" },
    { role: "admin", gov_province: "invalid", org_province: "QC", expected: "QC" },
    { role: "support", gov_province: null, org_province: null, expected: null },
  ];
  for (const scenario of cases) {
    reset();
    state().complianceScope = scenario;
    const scope = await readScope("gov-user");
    assert.equal(scope?.role, scenario.role);
    assert.equal(scope?.province, scenario.expected);
  }
});

test("actual government demand handler cannot use a conflicting profile to widen provincial scope", async () => {
  await withDemandRead(true, async () => {
    const report = await loadGovDemand({ data: { province: "ON" } });
    assert.equal(report.enabled, true);
    assert.equal(report.mode, "dry_run");
    assert.equal(report.province, "MB");
    assert.deepEqual(report.rows.map((row) => [row.area, row.ageKey, row.n]), [["Winnipeg", "infant", 6]]);
    assert.equal(JSON.stringify(report).includes("Toronto"), false);
    assert.equal(JSON.stringify(report).includes("Private child"), false);
    assert.equal(JSON.stringify(report).includes("private@example.invalid"), false);
    assertComplianceMembershipRead();
    assertDemandReadOnlyScope("MB");
    assert.deepEqual(state().calls.map((call) => call.kind), ["actor", "compliance-scope", "demand"]);
  });
});

test("actual national government demand reads preserve a valid selected province", async () => {
  await withDemandRead(true, async () => {
    for (const organization of ["CA", "ALL"]) {
      reset();
      state().actor.province = organization;
      state().complianceScope.org_province = organization;
      state().complianceScope.gov_province = "ON";
      const report = await loadGovDemand();
      assert.equal(report.province, "ON");
      assert.deepEqual(report.rows.map((row) => [row.area, row.ageKey, row.n]), [["Toronto", "toddler", 7]]);
      assertDemandReadOnlyScope("ON");
    }
  });
});

test("actual government demand denies invalid actors and inactive membership before reading report cells", async () => {
  await withDemandRead(true, async () => {
    const cases = [
      { userId: null, status: 401 },
      ...["parent", "provider", "admin", "support"].map((role) => ({ actor: { role }, status: 403 })),
      ...[null, undefined, "", "US", "invalid"].map((province) => ({ actor: { province }, status: 403 })),
      { actor: { status: "revoked" }, status: 403 },
      { actor: { status: "pending" }, status: 403 },
      { missing: true, status: 403 },
    ];
    for (const scenario of cases) {
      reset();
      if ("userId" in scenario) state().userId = scenario.userId;
      if (scenario.actor) Object.assign(state().actor, scenario.actor);
      if (scenario.missing) state().actor = null;
      await assert.rejects(loadGovDemand(), (error) => error.status === scenario.status);
      assert.equal(readCall("compliance-scope"), undefined);
      assert.equal(readCall("demand"), undefined);
      assert.equal(state().networkCalls, 0);
    }
  });
});

test("actual government demand preserves read-only/demo reads and feature-off no-cell behavior", async () => {
  await withDemandRead(true, async () => {
    for (const properties of [{ read_only: 1 }, { demo: 1 }]) {
      reset();
      Object.assign(state().actor, properties);
      const report = await loadGovDemand();
      assert.equal(report.province, "MB");
      assert.deepEqual(report.rows.map((row) => row.n), [6]);
      assertDemandReadOnlyScope("MB");
    }
  });
  reset();
  await withDemandRead(false, async () => {
    const report = await loadGovDemand();
    assert.equal(report.enabled, false);
    assert.equal(report.mode, "off");
    assert.equal(report.province, "MB");
    assert.deepEqual(report.rows, []);
    assert.equal(readCall("demand"), undefined);
    assert.equal(state().networkCalls, 0);
    assert.deepEqual(state().calls.map((call) => call.kind), ["actor", "compliance-scope"]);
    state().actor.province = "invalid";
    await assert.rejects(loadGovDemand(), (error) => error.status === 403);
    assert.equal(readCall("demand"), undefined);
  });
});
