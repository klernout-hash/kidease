import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { demandReport, quarterKey } from "../src/lib/compliance/demand.ts";

// Only the production SQL-client boundary is replaced. The actual cells/read
// declarations run their unmodified query against an ephemeral local database.
const sourcePath = new URL("../src/lib/server/compliance-demand.ts", import.meta.url);
const source = ts.createSourceFile(sourcePath.pathname, readFileSync(sourcePath, "utf8"), ts.ScriptTarget.Latest, true);
const names = new Set(["cells", "readDemandReport"]);
const declarations = source.statements.filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text));
assert.equal(declarations.length, names.size, "production demand declarations must be exercised");
const javascript = ts.transpileModule(declarations.map((node) => node.getText(source)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

const pg = new PGlite();
const queries = [];
let unavailable = false;
const sql = async (strings, ...values) => {
  const text = strings.reduce((query, part, index) => query + (index ? `$${index}` : "") + part, "");
  queries.push({ text, values });
  if (unavailable) throw new Error("local fixture read failure");
  return (await pg.query(text, values)).rows;
};
const context = vm.createContext({ sqlClient: async () => sql, demandReport, quarterKey });
new vm.Script(`${javascript}\nglobalThis.subject = { cells, readDemandReport };`, {
  filename: sourcePath.pathname,
}).runInContext(context);
const { cells, readDemandReport } = context.subject;
const plain = (value) => JSON.parse(JSON.stringify(value));

before(async () => {
  await pg.exec(`
    create table daycares (
      id text primary key, province text not null, city text not null,
      visibility text not null default 'public', is_test int not null default 0,
      listing_active int not null default 1
    );
    create table daycare_waitlist (
      id text primary key, daycare_id text not null references daycares(id),
      user_id text not null,
      age_group text not null check (age_group in ('infant', 'toddler', 'preschool', 'any')),
      status text not null check (status in ('waiting', 'offered', 'accepted', 'declined', 'expired', 'withdrawn')),
      joined_at timestamptz not null
    );
    create unique index fixture_active_waitlist_once
      on daycare_waitlist(daycare_id, user_id) where status in ('waiting', 'offered');
    insert into daycares (id, province, city, visibility, is_test, listing_active) values
      ('toronto-a', 'ON', 'Toronto', 'public', 0, 1),
      ('toronto-b', 'ON', 'Toronto', 'public', 0, 1),
      ('ottawa', 'ON', 'Ottawa', 'public', 0, 1),
      ('hidden-centre', 'ON', 'Hidden city', 'admin_only', 0, 0),
      ('test-centre', 'ON', 'Test city', 'public', 1, 1),
      ('spaced-province', ' on ', 'Toronto', 'public', 0, 1),
      ('blank-city', 'ON', '   ', 'public', 0, 1),
      ('winnipeg', 'MB', 'Winnipeg', 'public', 0, 1);
    insert into daycare_waitlist (id, daycare_id, user_id, age_group, status, joined_at) values
      ('repeat-a', 'toronto-a', 'same-parent', 'infant', 'waiting', '2026-11-01'),
      ('repeat-b', 'toronto-b', 'same-parent', 'infant', 'waiting', '2026-11-02'),
      ('old-a', 'toronto-a', 'old-parent-a', 'infant', 'waiting', '2019-01-01'),
      ('old-b', 'toronto-b', 'old-parent-b', 'infant', 'waiting', '2021-03-01'),
      ('current', 'toronto-a', 'current-parent', 'infant', 'waiting', '2026-11-03'),
      ('toddler', 'toronto-a', 'toddler-parent', 'toddler', 'waiting', '2026-11-03'),
      ('any', 'toronto-b', 'any-parent', 'any', 'waiting', '2026-11-03'),
      ('offered', 'toronto-b', 'offered-parent', 'infant', 'offered', '2026-11-03'),
      ('accepted', 'toronto-b', 'accepted-parent', 'infant', 'accepted', '2026-11-03'),
      ('withdrawn', 'toronto-b', 'withdrawn-parent', 'infant', 'withdrawn', '2026-11-03'),
      ('ottawa-waiting', 'ottawa', 'ottawa-parent', 'infant', 'waiting', '2026-11-03'),
      ('hidden-waiting', 'hidden-centre', 'hidden-parent', 'infant', 'waiting', '2026-11-03'),
      ('test-waiting', 'test-centre', 'test-parent', 'infant', 'waiting', '2026-11-03'),
      ('spaced-waiting', 'spaced-province', 'spaced-parent', 'infant', 'waiting', '2026-11-03'),
      ('blank-waiting', 'blank-city', 'blank-parent', 'any', 'waiting', '2026-11-03'),
      ('foreign-waiting', 'winnipeg', 'foreign-parent', 'infant', 'waiting', '2026-11-03');
  `);
});
after(async () => { await pg.close(); });

test("actual demand SQL counts waiting entries by daycare city and age, without deduplicating accounts", async () => {
  const rows = plain(await cells(" on "));
  const toronto = rows.filter((row) => row.province === "ON" && row.area === "Toronto");
  assert.equal(toronto.find((row) => row.ageKey === "infant").n, 5,
    "the same parent at two centres contributes two entries; older waiting entries still count");
  assert.equal(toronto.find((row) => row.ageKey === "toddler").n, 1);
  assert.equal(toronto.find((row) => row.ageKey === "any").n, 1, "any is retained, not reassigned to an age band");
  assert.equal(rows.find((row) => row.area === "Ottawa").n, 1, "another city stays a separate cell");
  assert.equal(rows.some((row) => row.area === "Winnipeg"), false);
  assert.deepEqual(queries.at(-1).values, ["ON"], "the normalized province is a bound parameter");
  const { rows: duplicates } = await pg.query(`
    select count(*)::int as entries, count(distinct user_id)::int as accounts
    from daycare_waitlist where id in ('repeat-a', 'repeat-b', 'old-a', 'old-b', 'current')
  `);
  assert.deepEqual(duplicates, [{ entries: 5, accounts: 4 }]);
  assert.equal(toronto.find((row) => row.ageKey === "infant").n, duplicates[0].entries);
  assert.notEqual(duplicates[0].entries, duplicates[0].accounts);
});

test("actual SQL applies no public/test-listing predicate and groups raw stored province values", async () => {
  const rows = plain(await cells("ON"));
  assert.equal(rows.find((row) => row.area === "Hidden city").n, 1);
  assert.equal(rows.find((row) => row.area === "Test city").n, 1);
  assert.equal(rows.find((row) => row.area === "area" && row.ageKey === "any").n, 1);
  const sameLabels = rows.filter((row) => row.area === "Toronto" && row.ageKey === "infant");
  assert.equal(sameLabels.length, 2, "raw province groups are not merged by cells' presentation mapping");
  assert.deepEqual(sameLabels.map((row) => [row.province, row.n]).sort(), [[" on ", 1], ["ON", 5]]);
});

test("province selection is bound to the real query, including hostile-looking input", async () => {
  assert.deepEqual(plain(await cells("MB")), [{ province: "MB", area: "Winnipeg", ageKey: "infant", n: 1 }]);
  assert.deepEqual(plain(await cells("ON' OR TRUE --")), []);
  assert.deepEqual(queries.at(-1).values, ["ON' OR TRUE --"]);
});

test("the actual report quarter labels the report and does not filter older waiting rows", async () => {
  const first = plain(await readDemandReport("live", "ON", "2026-01-02"));
  const second = plain(await readDemandReport("live", "ON", "2026-11-12"));
  assert.equal(first.quarter, "2026-Q1");
  assert.equal(second.quarter, "2026-Q4");
  assert.equal(first.status, "ready");
  const sorted = (rows) => [...rows].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  assert.deepEqual(sorted(first.rows), sorted(second.rows));
  assert.ok(second.rows.some((row) => row.area === "Toronto" && row.ageKey === "infant" && row.n === 5));
  assert.deepEqual(queries.slice(-2).map((query) => query.values), [["ON"], ["ON"]]);
});

test("actual demandReport scopes province before suppression and preserves a releasable any-age cell", () => {
  const report = demandReport([
    { province: " on ", area: "Toronto", ageKey: "any", n: 5 },
    { province: "MB", area: "Foreign private city", ageKey: "infant", n: 1 },
  ], " on ");
  assert.deepEqual(report, {
    province: "ON", k: 5,
    rows: [{ area: "Toronto", ageKey: "any", n: 5, suppressed: false }],
  });
});

test("small cells and the count-neighbour lose their counts and both identifying labels", () => {
  const report = demandReport([
    { province: "ON", area: "Sensitive city A", ageKey: "sensitive-age-A", n: 2 },
    { province: "ON", area: "Sensitive city B", ageKey: "sensitive-age-B", n: 7 },
    { province: "ON", area: "Released city", ageKey: "preschool", n: 20 },
  ], "ON");
  assert.deepEqual(report.rows, [
    { area: "hidden", ageKey: "hidden", n: null, suppressed: true },
    { area: "hidden", ageKey: "hidden", n: null, suppressed: true },
    { area: "Released city", ageKey: "preschool", n: 20, suppressed: false },
  ]);
  assert.doesNotMatch(JSON.stringify(report), /Sensitive|sensitive-age/);
});

test("fully suppressed cities fall back to province-by-age totals without city labels", () => {
  const report = demandReport([
    { province: "ON", area: "Private city A", ageKey: "infant", n: 2 },
    { province: "ON", area: "Private city B", ageKey: "infant", n: 3 },
    { province: "MB", area: "Foreign city", ageKey: "infant", n: 100 },
  ], "ON");
  assert.deepEqual(report.rows, [{ area: "ON", ageKey: "infant", n: 5, suppressed: false }]);
  assert.doesNotMatch(JSON.stringify(report), /Private city|Foreign city/);
});

test("province fallback repeats small-cell and secondary suppression instead of exposing a small age group", () => {
  for (const rows of [
    [{ province: "ON", area: "Private A", ageKey: "infant", n: 2 }, { province: "ON", area: "Private B", ageKey: "toddler", n: 3 }],
    [{ province: "ON", area: "Private A", ageKey: "infant", n: 2 }, { province: "ON", area: "Private B", ageKey: "infant", n: 3 },
      { province: "ON", area: "Private C", ageKey: "toddler", n: 1 }],
  ]) {
    const report = demandReport(rows, "ON");
    assert.equal(report.rows.length, 2);
    assert.ok(report.rows.every((row) => row.area === "hidden" && row.ageKey === "hidden" && row.n === null && row.suppressed));
    assert.doesNotMatch(JSON.stringify(report), /Private|infant|toddler/);
  }
});

test("actual data-read boundary distinguishes off, successful empty, and unavailable results", async () => {
  const before = queries.length;
  assert.deepEqual(plain(await readDemandReport("off", "ON", "2026-11-12")), {
    mode: "off", province: "ON", quarter: "2026-Q4", enabled: false, status: "off", rows: [],
  });
  assert.equal(queries.length, before);
  const empty = plain(await readDemandReport("live", "BC", "2026-11-12"));
  assert.equal(empty.status, "ready");
  assert.deepEqual(empty.rows, []);
  unavailable = true;
  try {
    const failed = plain(await readDemandReport("live", "ON", "2026-11-12"));
    assert.equal(failed.status, "unavailable");
    assert.equal(Object.hasOwn(failed, "rows"), false);
  } finally { unavailable = false; }
});
