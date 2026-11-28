/**
 * Authorization spec for parent absence writes.
 *
 * These tests call the real server handlers. They fail while a signed-in parent
 * can store a child name that did not come from that parent's enrolled booking.
 * A passing run rejects that write, including when the child's name is read
 * again after the booking check.
 *
 * Run:
 *   node --experimental-strip-types --test scripts/absence-report-authorization.test.mjs
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stateKey = "__absenceReportAuthorizationTest";
const prefix = "absence-report-authz:";
const day = "2026-11-28";
const flagKeys = [
  "FEATURE_ABSENCE_REPORTS",
  "VITE_FEATURE_ABSENCE_REPORTS",
  "FEATURE_ABSENCE_REPORTS_LIVE",
  "VITE_FEATURE_ABSENCE_REPORTS_LIVE",
  "FEATURE_PARENT_ABSENCE",
  "VITE_FEATURE_PARENT_ABSENCE",
];
const savedFlags = Object.fromEntries(flagKeys.map((key) => [key, process.env[key]]));

const virtual = {
  serverFn: `
    export function createServerFn() {
      let validate = (value) => value;
      const builder = {
        middleware() { return builder; },
        validator(fn) { validate = fn; return builder; },
        handler(fn) {
          return async ({ context, data }) => fn({ context, data: await validate(data) });
        },
      };
      return builder;
    }
    export function createMiddleware() {
      return {};
    }
  `,
  db: `export function getSql() { return Promise.resolve(globalThis.${stateKey}.sql); }`,
  auth: "export const authMiddleware = {}; export const sessionBearerMiddleware = {};",
};

const mockFiles = new Map(
  [
    ["src/lib/db.ts", "db"],
    ["src/lib/auth/middleware.ts", "auth"],
  ].map(([file, name]) => [pathToFileURL(join(root, file)).href, name]),
);

function resolveSource(specifier, parentURL) {
  let file;
  if (specifier.startsWith("@/")) file = join(root, "src", specifier.slice(2));
  else if (specifier.startsWith(".") && parentURL?.startsWith("file:")) file = fileURLToPath(new URL(specifier, parentURL));
  if (!file) return null;
  return [file, `${file}.ts`, `${file}.tsx`, `${file}.mjs`].find((candidate) => existsSync(candidate)) ?? null;
}

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@tanstack/react-start" || specifier === "@tanstack/react-start/server") {
      return { url: `${prefix}serverFn`, shortCircuit: true };
    }
    const file = resolveSource(specifier, context.parentURL);
    if (!file) return nextResolve(specifier, context);
    const url = pathToFileURL(file).href;
    return { url: mockFiles.has(url) ? `${prefix}${mockFiles.get(url)}` : url, shortCircuit: true };
  },
  load(url, context, nextLoad) {
    return url.startsWith(prefix)
      ? { format: "module", source: virtual[url.slice(prefix.length)], shortCircuit: true }
      : nextLoad(url, context);
  },
});

const state = { sql: null, swap: false, pg: null };
globalThis[stateKey] = state;

const { reportAbsence } = await import("../src/lib/server/wiring/absence-reports.ts");
const { reportParentAbsence } = await import("../src/lib/server/phase5.ts");

function taggedSql(pg) {
  const run = async (text, params) => {
    const rows = (await pg.query(text, params)).rows;
    if (state.swap && !state.swapped && /\b(bookings|children)\b/i.test(text) && rows.length) {
      state.swapped = true;
      // The first enrolment read has returned. Rename the caller's child before
      // any later read, so a second lookup cannot be what gets stored.
      await pg.query("update children set name = 'Renamed' where id = 'child-a'");
    }
    return rows;
  };
  const sql = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run(text, values);
  };
  sql.query = (text, params) => run(text, params ?? []);
  return sql;
}

async function attendance(daycareId, childName) {
  const found = await state.pg.query(
    "select status, notes, parent_user_id, updated_by from attendance where daycare_id = $1 and child_name = $2 and day = $3",
    [daycareId, childName, day],
  );
  return found.rows[0] ?? null;
}

async function reports() {
  return (await state.pg.query("select child_name, parent_user_id from absence_reports")).rows;
}

async function noticeCount() {
  const found = await state.pg.query("select count(*)::int as n from wiring_notices");
  return Number(found.rows[0].n);
}

function clearFlags() {
  for (const key of flagKeys) delete process.env[key];
}

function enableAbsenceReports() {
  process.env.FEATURE_ABSENCE_REPORTS = "1";
}

function enableParentAbsence() {
  process.env.FEATURE_PARENT_ABSENCE = "1";
}

async function assertClassmateUntouched(allowCallerChild) {
  const ben = await attendance("centre-x", "Ben");
  assert.ok(ben, "classmate check-in row missing");
  assert.equal(ben.status, "arrived", `classmate check-in became ${ben.status}`);
  assert.equal(ben.notes, "Checked in at the door");
  assert.equal(ben.updated_by, "staff-1");
  assert.equal(ben.parent_user_id, "parent-b");
  const otherCentre = await attendance("centre-y", "Ben");
  assert.equal(otherCentre.status, "arrived");
  assert.equal(otherCentre.notes, "Checked in at the door");
  for (const name of ["Sam", "Renamed", "Nobody"]) {
    assert.equal(await attendance("centre-x", name), null, `${name} was written`);
    assert.equal(await attendance("centre-y", name), null, `${name} was written at the other centre`);
  }
  const written = await reports();
  for (const report of written) {
    assert.equal(report.parent_user_id, "parent-a");
    assert.equal(report.child_name, "Ava");
  }
  const notices = await noticeCount();
  if (!allowCallerChild) {
    assert.equal(await attendance("centre-x", "Ava"), null);
    assert.equal(written.length, 0);
    assert.equal(notices, 0);
    return;
  }
  if (notices > 0) {
    assert.ok(
      written.some((report) => report.child_name === "Ava"),
      "staff were notified without an absence for the caller's own child",
    );
  }
}

async function callAbsence(userId, data) {
  let result = null;
  let thrown = null;
  try {
    result = await reportAbsence({ context: { userId }, data });
  } catch (error) {
    thrown = error;
  }
  return { result, thrown };
}

async function callPhase5(userId, data) {
  let result = null;
  let thrown = null;
  try {
    result = await reportParentAbsence({ context: { userId }, data });
  } catch (error) {
    thrown = error;
  }
  return { result, thrown };
}

const pg = new PGlite();
state.pg = pg;
state.sql = taggedSql(pg);

before(async () => {
  await pg.exec(`
    create table daycares (
      id text primary key,
      province text not null
    );
    create table children (
      id text primary key,
      user_id text not null,
      name text not null
    );
    create table bookings (
      id text primary key,
      user_id text not null,
      daycare_id text not null,
      child_id text,
      status text not null
    );
    create table attendance (
      id text primary key,
      daycare_id text not null,
      booking_id text,
      child_name text not null,
      parent_user_id text,
      day date not null,
      status text not null,
      notes text,
      updated_by text
    );
    create unique index attendance_day_booking_idx on attendance (daycare_id, booking_id, day)
      where booking_id is not null;
    create unique index attendance_day_child_unlinked_idx on attendance (daycare_id, child_name, day)
      where booking_id is null;
    create table staff_shifts (
      daycare_id text,
      room_band text,
      starts_at text,
      ends_at text
    );
    create table absence_reports (
      id text primary key,
      daycare_id text not null,
      parent_user_id text not null,
      child_name text not null,
      day date not null,
      province text not null,
      band text not null,
      children_now int,
      ratio_status text
    );
    create table provider_daycares (
      user_id text not null,
      daycare_id text not null
    );
    create table centre_members (
      user_id text not null,
      daycare_id text not null,
      status text
    );
    create table wiring_notices (
      id text primary key,
      feature text not null,
      user_id text not null,
      channel text not null,
      mode text not null,
      body text not null,
      created_at timestamptz not null default now()
    );
  `);
  await pg.exec(`
    insert into daycares (id, province) values ('centre-x', 'MB');
    insert into attendance (id, daycare_id, child_name, day, status)
    values ('probe', 'centre-x', 'Probe', '${day}', 'arrived');
  `);
  await pg.query(
    `insert into attendance (id, daycare_id, child_name, parent_user_id, day, status, notes, updated_by)
     values ('probe-2', 'centre-x', 'Probe', 'parent-b', $1, 'scheduled', 'replaced', 'intruder')
     on conflict (daycare_id, child_name, day) where booking_id is null
     do update set status = 'scheduled', notes = excluded.notes, updated_by = excluded.updated_by`,
    [day],
  );
  const probe = await pg.query("select status, notes, updated_by from attendance where child_name = 'Probe'");
  assert.equal(probe.rows.length, 1);
  assert.equal(probe.rows[0].status, "scheduled");
  assert.equal(probe.rows[0].notes, "replaced");
  assert.equal(probe.rows[0].updated_by, "intruder");
});

beforeEach(async () => {
  clearFlags();
  state.swap = false;
  state.swapped = false;
  await pg.exec(`
    truncate attendance, absence_reports, wiring_notices, bookings, children, provider_daycares, centre_members, staff_shifts, daycares;
    insert into daycares (id, province) values ('centre-x', 'MB'), ('centre-y', 'MB');
    insert into children (id, user_id, name) values
      ('child-a', 'parent-a', 'Ava'),
      ('child-b', 'parent-b', 'Ben'),
      ('child-s', 'parent-b', 'Sam');
    insert into bookings (id, user_id, daycare_id, child_id, status) values
      ('booking-a', 'parent-a', 'centre-x', 'child-a', 'accepted'),
      ('booking-b', 'parent-b', 'centre-x', 'child-b', 'active'),
      ('booking-s', 'parent-b', 'centre-x', 'child-s', 'accepted'),
      ('booking-by', 'parent-b', 'centre-y', 'child-b', 'active'),
      ('booking-pending', 'parent-d', 'centre-x', 'child-b', 'pending');
    insert into attendance (id, daycare_id, child_name, parent_user_id, day, status, notes, updated_by) values
      ('at-ben-x', 'centre-x', 'Ben', 'parent-b', '${day}', 'arrived', 'Checked in at the door', 'staff-1'),
      ('at-ben-y', 'centre-y', 'Ben', 'parent-b', '${day}', 'arrived', 'Checked in at the door', 'staff-1');
    insert into provider_daycares (user_id, daycare_id) values ('staff-1', 'centre-x');
  `);
});

after(async () => {
  clearFlags();
  for (const [key, value] of Object.entries(savedFlags)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await pg.close();
  hooks.deregister();
  delete globalThis[stateKey];
});

describe("parent absence authorization", { concurrency: false }, () => {
  test("reportAbsence overwrites a classmate check-in when the caller is enrolled at that centre", async () => {
    enableAbsenceReports();
    state.swap = true;
    await callAbsence("parent-a", {
      daycareId: "centre-x",
      childName: "Ben",
      day,
      band: "preschool",
    });
    await assertClassmateUntouched(true);
  });

  test("reportAbsence creates an absence for a classmate who has no check-in row", async () => {
    enableAbsenceReports();
    state.swap = true;
    await callAbsence("parent-a", {
      daycareId: "centre-x",
      childName: "Sam",
      day,
      band: "preschool",
    });
    await assertClassmateUntouched(true);
  });

  test("reportAbsence creates an attendance row for a name that is not a child at the centre", async () => {
    enableAbsenceReports();
    state.swap = true;
    await callAbsence("parent-a", {
      daycareId: "centre-x",
      childName: "Nobody",
      day,
      band: "preschool",
    });
    await assertClassmateUntouched(true);
  });

  test("reportAbsence keeps the caller's booking when the request also names a classmate", async () => {
    enableAbsenceReports();
    state.swap = true;
    await callAbsence("parent-a", {
      daycareId: "centre-x",
      childName: "Ben",
      day,
      band: "preschool",
      bookingId: "booking-a",
    });
    await assertClassmateUntouched(true);
  });

  test("reportAbsence does not act on another parent's booking id", async () => {
    enableAbsenceReports();
    state.swap = true;
    await callAbsence("parent-a", {
      daycareId: "centre-x",
      childName: "Ben",
      day,
      band: "preschool",
      bookingId: "booking-b",
    });
    await assertClassmateUntouched(false);
  });

  test("reportParentAbsence overwrites a classmate check-in for an enrolled parent", async () => {
    enableParentAbsence();
    state.swap = true;
    await callPhase5("parent-a", {
      daycareId: "centre-x",
      childName: "Ben",
      from: day,
      to: day,
      reason: "away",
    });
    await assertClassmateUntouched(true);
  });

  test("reportParentAbsence overwrites a classmate check-in for a signed-in parent with no booking", async () => {
    enableParentAbsence();
    state.swap = true;
    await callPhase5("parent-c", {
      daycareId: "centre-x",
      childName: "Ben",
      from: day,
      to: day,
      reason: "away",
    });
    await assertClassmateUntouched(false);
  });

  test("reportAbsence records the caller's own child", async () => {
    enableAbsenceReports();
    const { result, thrown } = await callAbsence("parent-a", {
      daycareId: "centre-x",
      childName: "Ava",
      day,
      band: "preschool",
      bookingId: "booking-a",
    });
    assert.equal(thrown, null);
    assert.equal(result?.ok, true);
    const ava = await attendance("centre-x", "Ava");
    assert.ok(ava);
    assert.equal(ava.status, "absent");
    assert.equal(ava.notes, "Parent reported an absence");
    assert.equal(ava.parent_user_id, "parent-a");
    assert.equal(ava.updated_by, "parent-a");
    await assertClassmateUntouched(true);
    const written = await reports();
    assert.equal(written.length, 1);
    assert.equal(written[0].child_name, "Ava");
    const notices = await state.pg.query("select body from wiring_notices");
    assert.ok(notices.rows.length > 0);
    assert.ok(notices.rows.every((row) => String(row.body).includes("Absence saved")));
  });

  test("reportParentAbsence records the caller's own child", async () => {
    enableParentAbsence();
    const { result, thrown } = await callPhase5("parent-a", {
      daycareId: "centre-x",
      childName: "Ava",
      from: day,
      to: day,
      reason: "away",
      bookingId: "booking-a",
    });
    assert.equal(thrown, null);
    assert.equal(result?.ok, true);
    const ava = await attendance("centre-x", "Ava");
    assert.ok(ava);
    assert.equal(ava.status, "absent");
    assert.equal(ava.parent_user_id, "parent-a");
    assert.equal(ava.updated_by, "parent-a");
    await assertClassmateUntouched(true);
  });

  test("reportAbsence does nothing when the caller is not enrolled at that centre", async () => {
    enableAbsenceReports();
    const { result, thrown } = await callAbsence("parent-c", {
      daycareId: "centre-x",
      childName: "Ben",
      day,
      band: "preschool",
    });
    assert.equal(thrown, null);
    assert.equal(result?.ok, false);
    await assertClassmateUntouched(false);
  });

  test("reportAbsence does nothing at a centre where the caller has no booking", async () => {
    enableAbsenceReports();
    const { result, thrown } = await callAbsence("parent-a", {
      daycareId: "centre-y",
      childName: "Ben",
      day,
      band: "preschool",
    });
    assert.equal(thrown, null);
    assert.equal(result?.ok, false);
    await assertClassmateUntouched(false);
  });

  test("reportAbsence does nothing when the feature flag is off", async () => {
    const { result, thrown } = await callAbsence("parent-a", {
      daycareId: "centre-x",
      childName: "Ben",
      day,
      band: "preschool",
    });
    assert.equal(thrown, null);
    assert.equal(result?.ok, false);
    assert.equal(result?.error, "off");
    await assertClassmateUntouched(false);
  });

  test("reportAbsence does nothing for a booking that is not enrolled", async () => {
    enableAbsenceReports();
    const { result, thrown } = await callAbsence("parent-d", {
      daycareId: "centre-x",
      childName: "Ben",
      day,
      band: "preschool",
      bookingId: "booking-pending",
    });
    assert.equal(thrown, null);
    assert.equal(result?.ok, false);
    await assertClassmateUntouched(false);
  });

  test("reportParentAbsence does nothing when its feature flag is off", async () => {
    const { result, thrown } = await callPhase5("parent-a", {
      daycareId: "centre-x",
      childName: "Ben",
      from: day,
      to: day,
      reason: "away",
    });
    assert.equal(thrown, null);
    assert.equal(result?.ok, false);
    assert.equal(result?.error, "off");
    await assertClassmateUntouched(false);
  });
});
