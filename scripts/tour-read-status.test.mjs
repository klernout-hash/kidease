import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NOW = Date.parse("2026-11-12T15:00:00Z");
const CREATED = new Date(NOW - 48 * 60 * 60 * 1000).toISOString();
const FUTURE = new Date(NOW + 1).toISOString();
const DEADLINE = new Date(NOW).toISOString();

// Execute the actual handlers with an explicit, credential-free dependency boundary.
// Any attempted write or notification is recorded even if the handler catches it.
function harness(answer, overrides = {}) {
  const writes = [];
  const effects = [];
  const queries = [];
  const sql = async (strings, ...params) => {
    const query = strings.reduce((out, part, index) => out + (index ? `$${index}` : "") + part, "");
    return sql.query(query, params);
  };
  sql.query = async (query, params = []) => {
    queries.push({ query, params });
    if (!/^\s*select\b/i.test(query)) {
      writes.push(query);
      throw new Error("A read attempted a database write");
    }
    return structuredClone(await answer(query, params));
  };
  const forbidden = (module) =>
    new Proxy(
      {},
      {
        get:
          (_, name) =>
          (...args) => {
            effects.push({ module, name, args });
            throw new Error(`A read called ${module}.${String(name)}`);
          },
      },
    );
  const serverFn = () => ({
    middleware() {
      return this;
    },
    validator() {
      return this;
    },
    handler(handler) {
      return handler;
    },
  });
  const mocks = {
    "@tanstack/react-start": { createServerFn: serverFn },
    "@/lib/db": { getSql: async () => sql },
    "@/lib/auth/middleware": { authMiddleware: {} },
    "@/lib/server/coparent": { familyScopeFor: async (userId) => ({ dataUserId: userId }) },
    "@/lib/listing-photo": {
      splitPhotoList: (photos) => (photos ? String(photos).split(",") : []),
    },
    "@/lib/templates": { formatAgeLabel: () => null },
    "@/lib/utils": forbidden("@/lib/utils"),
    "@/lib/host-listing": { EMPTY_GUIDE: {} },
    "node:crypto": forbidden("node:crypto"),
    "@/lib/trust": { isClaimVerified: () => false },
    "@/lib/features": { hostListingEnabled: () => true },
    ...overrides,
  };
  const cache = new Map();
  function load(file) {
    const filename = resolve(root, file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const source = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const require = (specifier) => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (
        specifier.startsWith("@/lib/server/") ||
        specifier === "./notify" ||
        specifier === "./thread-access"
      )
        return forbidden(specifier);
      if (specifier.startsWith("@/")) return load(`src/${specifier.slice(2)}.ts`);
      if (specifier.startsWith(".")) {
        const next = resolve(dirname(filename), specifier);
        return load(next.endsWith(".ts") ? next : `${next}.ts`);
      }
      throw new Error(`Unexpected dependency ${specifier}`);
    };
    new Function("require", "module", "exports", source)(require, module, module.exports);
    return module.exports;
  }
  return {
    load,
    queries,
    assertReadOnly() {
      assert.deepEqual(writes, [], "database writes");
      assert.deepEqual(effects, [], "mail, push, outbox, or other server calls");
    },
  };
}

function tour(id, status = "pending", deadline = DEADLINE) {
  return {
    id,
    conversation_id: `conversation-${id}`,
    daycare_id: "centre-a",
    daycare_name: "Centre A",
    slug: "centre-a",
    parent_user_id: `parent-${id}`,
    parent_name: "Parent",
    child_name: null,
    status,
    created_at: CREATED,
    hold_expires_at: deadline,
    preferred_times: JSON.stringify([{ date: "2026-11-20", time: "10:00" }]),
  };
}

test("inbox projects boundary and fallback expiry with no writes or notification effects for either tenant", async (t) => {
  t.mock.method(Date, "now", () => NOW);
  for (const userId of ["parent-a", "parent-b"]) {
    const source = [
      tour("due"),
      tour("legacy", "pending", null),
      tour("live", "pending", FUTURE),
      tour("confirmed", "accepted"),
    ];
    const rows = source.map((row) => ({
      ...row,
      parent_user_id: userId,
      name: "Centre A",
      tour_status: row.status,
      tour_created_at: row.created_at,
      tour_hold_expires_at: row.hold_expires_at,
      tour_times: row.preferred_times,
      last_at: "2026-11-10T10:00:00Z",
      last_body: "Original parent message",
      tour_staff_note: null,
      status: null,
      photos: "",
    }));
    const run = harness((query, params) => {
      assert.match(query, /from conversations c/);
      assert.ok(params.includes(userId));
      return rows;
    });
    const { listInbox } = run.load("src/lib/server/inbox.ts");
    const result = await listInbox({ context: { userId }, data: { view: "family" } });
    assert.deepEqual(
      result.map((row) => row.tourStatus),
      ["expired", "expired", "pending", "accepted"],
    );
    assert.deepEqual(
      result.map((row) => row.stage),
      ["follow_up", "follow_up", "tour_requested", "tour_booked"],
    );
    assert.deepEqual(
      result.map((row) => row.tourHold),
      ["blocked", "blocked", "soft_hold", "confirmed"],
    );
    assert.equal(result[0].slaRemainingMs, null);
    assert.equal(result[2].slaRemainingMs, 1);
    for (const row of result) {
      assert.equal(row.lastAt, rows[0].last_at);
      assert.equal(row.lastBody, rows[0].last_body);
      assert.equal(row.staffNote, null);
    }
    assert.equal(source[0].status, "pending");
    run.assertReadOnly();
  }
});

test("conversation details projects expiry without schema writes or invented messages", async (t) => {
  t.mock.method(Date, "now", () => NOW);
  for (const deadline of [DEADLINE, null, FUTURE]) {
    const run = harness(
      (query) => (query.includes("from tour_requests") ? [tour("one", "pending", deadline)] : []),
      {
        "./thread-access": {
          requireConversationRead: async () => ({
            role: "parent",
            conversation: {
              id: "conversation-one",
              user_id: "parent-one",
              daycare_id: "centre-a",
              name: "Centre A",
              slug: "centre-a",
              photos: "",
            },
          }),
        },
      },
    );
    const { getConversationDetails } = run.load("src/lib/server/conversation-state.ts");
    const details = await getConversationDetails({
      context: { userId: "parent-one" },
      data: { conversationId: "conversation-one" },
    });
    assert.equal(details.tourStatus, deadline === FUTURE ? "pending" : "expired");
    assert.deepEqual(details.reads, []);
    assert.deepEqual(details.phoneAlerts, []);
    run.assertReadOnly();
  }
});

test("CRM excludes overdue holds while preserving live pending and accepted stages", async (t) => {
  t.mock.method(Date, "now", () => NOW);
  const source = [
    tour("due"),
    tour("legacy", "pending", null),
    tour("live", "pending", FUTURE),
    tour("confirmed", "accepted"),
  ];
  const run = harness((query) => {
    if (query.includes("select daycare_id from provider_daycares"))
      return [{ daycare_id: "centre-a" }];
    if (query.includes("from tour_requests t")) return source;
    if (query.includes("from conversations c") || query.includes("from bookings b")) return [];
    throw new Error(`Unexpected query ${query}`);
  });
  const { listCentrePipeline } = run.load("src/lib/server/crm-pipeline.ts");
  const result = await listCentrePipeline({ context: { userId: "owner-a" } });
  assert.deepEqual(
    result.map((row) => [row.id, row.stage]),
    [
      ["confirmed", "tour_accepted"],
      ["live", "tour_pending"],
    ],
  );
  assert.ok(result.every((row) => row.updatedAt === CREATED));
  assert.equal(source[0].status, "pending");
  run.assertReadOnly();
});

test("host calendar excludes overdue pending requests and keeps accepted tours without writes", async (t) => {
  t.mock.method(Date, "now", () => NOW);
  const source = [
    tour("due"),
    tour("legacy", "pending", null),
    tour("live", "pending", FUTURE),
    tour("confirmed", "accepted"),
  ];
  const run = harness(
    (query) => {
      if (query.includes("from daycares"))
        return [{ timezone: "America/Winnipeg", province: "MB" }];
      if (query.includes("from tour_requests")) return source;
      return [];
    },
    {
      "@/lib/server/centre-access": { assertCentreCanMutateVacancies: async () => undefined },
    },
  );
  const { loadHostCalendar } = run.load("src/lib/server/host-calendar.ts");
  const result = await loadHostCalendar({
    context: { userId: "owner-a" },
    data: { daycareId: "centre-a", month: "2026-11" },
  });
  assert.deepEqual(result.tours, { "2026-11-20": 2 });
  assert.equal(source[0].status, "pending");
  run.assertReadOnly();
});

test("family scope used by tour reads never ensures schema for either co-parent feature mode", async () => {
  for (const [linkEnabled, emailEnabled] of [[false, false], [true, false], [false, true], [true, true]]) {
    const run = harness((query, params) => {
      assert.match(query, /from coparent_links/);
      assert.ok(params.includes("member-a"));
      return [{
        id: "link-a", owner_user_id: "owner-a", member_user_id: "member-a",
        access: "view", status: "active", invite_token: "synthetic-test-token",
      }];
    }, {
      "@/lib/features": {
        coparentLinkEnabled: () => linkEnabled,
        coparentEmailEnabled: () => emailEnabled,
      },
    });
    const { familyScopeFor } = run.load("src/lib/server/coparent.ts");
    const scope = await familyScopeFor("member-a");
    const enabled = linkEnabled || emailEnabled;
    assert.equal(scope.dataUserId, enabled ? "owner-a" : "member-a");
    assert.equal(scope.canWrite, !enabled);
    assert.equal(run.queries.length, enabled ? 1 : 0);
    run.assertReadOnly();
  }
});
