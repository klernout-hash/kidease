/**
 * Authorization for medication schedules and the same parent-id shortcut on
 * attendance. Runs the real server handlers and their SQL on in-memory
 * Postgres. A signed-in caller is the user id auth middleware would attach
 * after a same-origin session. These tests fail while a caller can store a
 * child, booking, or centre they were not authorized to write.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before, beforeEach } from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { evaluateSameSiteRequest, resolveRequiredUserId } from "../src/lib/access-control.ts";
import * as centreRoles from "../src/lib/centre-roles.ts";
import * as dailyCare from "../src/lib/daily-care.ts";
import * as features from "../src/lib/features.ts";
import * as licensedDay from "../src/lib/licensed-day.ts";
import * as privateMedia from "../src/lib/private-media.ts";
import * as privatePhotoFeed from "../src/lib/private-photo-feed.ts";
import * as staffPermissions from "../src/lib/staff-permissions.ts";
import * as utils from "../src/lib/utils.ts";
import * as accessControl from "../src/lib/access-control.ts";

const ATTACKER = "parent-other";
const PARENT = "parent-ada";
const VICTIM_PARENT = "parent-victim";
const STAFF = "staff-victim";
const READER = "reader-victim";
const CENTRE = "centre-victim";
const OTHER = "centre-other";
const BOOKING_VICTIM = "booking-victim";
const BOOKING_ADA = "booking-ada";
const BOOKING_OTHER = "booking-other";
const CHILD_VICTIM = "child-victim";
const CHILD_ADA = "child-ada";
const CHILD_OTHER = "child-other";
const VICTIM_NAME = "Victim Child";
const ADA_NAME = "Ada Parent";
const OTHER_NAME = "Other Child";
const DAY = "2026-11-27";

const matchesChild = loadMatchesChild();

function loadMatchesChild() {
  const source = readFileSync(new URL("../src/components/care-child-ops.tsx", import.meta.url), "utf8");
  const start = source.indexOf("function matchesChild");
  const end = source.indexOf("export function CareChildOps");
  assert.ok(start >= 0 && end > start);
  const js = ts.transpileModule(`${source.slice(start, end)}\nexports.matchesChild = matchesChild;\n`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", js)(exports);
  assert.equal(typeof exports.matchesChild, "function");
  return exports.matchesChild;
}

function serverSource(file) {
  return readFileSync(new URL(`../src/lib/server/${file}.ts`, import.meta.url), "utf8")
    .replaceAll("import.meta.env?.SSR", "false")
    .replaceAll("import.meta.env.SSR", "false");
}

function transpile(source) {
  return ts
    .transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    })
    .outputText.replace(/import\((['"])([^'"]+)\1\)/g, "Promise.resolve(require($1$2$1))");
}

function load(file, modules) {
  const exports = {};
  const requireMod = (name) => {
    if (modules[name]) return modules[name];
    const serverName = name.startsWith("./") ? `@/lib/server/${name.slice(2)}` : "";
    if (serverName && modules[serverName]) return modules[serverName];
    throw new Error(`Unexpected import ${name} from ${file}`);
  };
  new Function("require", "exports", transpile(serverSource(file)))(requireMod, exports);
  return exports;
}

function createServerFn() {
  // @tanstack/start-client-core 1.170.39 execValidator runs a function
  // validator on the server, then the handler receives that data and the
  // middleware context. authMiddleware replaces client context with the
  // session user id before the handler runs.
  let validate = (value) => value;
  const api = {
    middleware() {
      return api;
    },
    validator(fn) {
      validate = fn;
      return api;
    },
    handler(fn) {
      return async (input = {}) => fn({ context: input.context, data: await validate(input.data) });
    },
  };
  return api;
}

function signedInUser(userId) {
  assert.equal(
    evaluateSameSiteRequest({
      secFetchSite: "same-origin",
      secFetchDest: "empty",
      secFetchMode: "cors",
      method: "POST",
    }),
    "allow",
  );
  const decided = resolveRequiredUserId({
    authConfigured: true,
    databaseConfigured: true,
    sessionUserId: userId,
  });
  assert.equal(decided.ok, true);
  assert.equal(decided.userId, userId);
  return decided.userId;
}

const state = {
  swap: null,
  queries: [],
};

let pg;
let sql;
let api;

function bindSql() {
  const run = async (text, values = []) => {
    state.queries.push(text.replace(/\s+/g, " ").trim());
    const result = await pg.query(text, values);
    if (state.swap && /\bfrom\s+bookings\b/i.test(text) && !/^\s*(insert|update|delete)\b/i.test(text)) {
      const swap = state.swap;
      state.swap = null;
      await pg.query("update bookings set child_id = $1 where id = $2", [swap.nextChildId, swap.bookingId]);
      await pg.query("update children set name = $1 where id = $2", [swap.renameTo, swap.renameChildId]);
    }
    return result.rows;
  };
  sql = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run(text, values);
  };
  sql.query = (text, values) => run(text, values ?? []);
}

before(async () => {
  pg = new PGlite();
  await pg.exec(`
    create table daycares (id text primary key, name text, province text);
    create table "user" (id text primary key, name text, email text);
    create table provider_daycares (user_id text, daycare_id text);
    create table centre_members (
      user_id text, daycare_id text, role text, status text,
      permission_preset text, permissions jsonb
    );
    create table profiles (user_id text primary key, role text);
    create table children (id text primary key, user_id text, name text);
    create table bookings (
      id text primary key, daycare_id text, user_id text, status text,
      conversation_id text, child_id text, parent_name text
    );
    create table care_rooms (
      id text primary key, daycare_id text, name text, capacity int, age_group text,
      sort_order int, archived_at timestamptz
    );
    create table care_child_room_assignments (
      id text, daycare_id text, room_id text, booking_id text, child_name text,
      parent_user_id text, assigned_by text
    );
    create table care_roster_assignments (
      id text, daycare_id text, room_id text, staff_user_id text, staff_name text,
      day date, assigned_by text
    );
    create table care_medications (
      id text primary key, daycare_id text not null, booking_id text, conversation_id text,
      child_id text, child_name text not null, parent_user_id text, name text not null,
      dosage text not null, instructions text not null default '', schedule_times jsonb not null,
      start_day date not null, end_day date, created_by text not null, archived_at timestamptz,
      created_at timestamptz not null default now()
    );
    create table care_medication_logs (
      id text primary key, medication_id text not null, daycare_id text not null,
      booking_id text, conversation_id text, child_name text not null, parent_user_id text,
      day date not null, scheduled_time text not null, status text not null,
      notes text not null default '', given_by text not null, given_by_name text not null default '',
      created_at timestamptz not null default now()
    );
    create table care_incidents (
      id text primary key, daycare_id text, daycare_name text, booking_id text, conversation_id text,
      child_name text, parent_user_id text, day date, occurred_at timestamptz, location text,
      kind text, description text, action_taken text, first_aid boolean, author_name text,
      author_user_id text, created_at timestamptz not null default now()
    );
    create table care_day_notes (
      id text, daycare_id text, booking_id text, child_name text, day date,
      food text, nap text, incident text, photo text, author_user_id text
    );
    create table care_enrolment_splits (
      booking_id text, daycare_id text, child_name text, parent_daily_cents int,
      program_daily_cents int, program_kind text, program_label text
    );
    create table attendance (
      id text primary key, daycare_id text not null, booking_id text, conversation_id text,
      child_name text not null, parent_user_id text, day date not null, drop_off text,
      pick_up text, status text not null, notes text, updated_by text,
      created_at timestamptz not null default now()
    );
    create unique index attendance_day_child_idx on attendance (daycare_id, child_name, day);
    create table messages (
      id text primary key, conversation_id text, sender text, body text, kind text
    );
    create table conversations (id text primary key, last_at timestamptz);
  `);
  bindSql();
  const modules = {
    "@tanstack/react-start": { createServerFn },
    "@/lib/db": { getSql: async () => sql },
    "@/lib/auth/middleware": { authMiddleware: {} },
    "@/lib/centre-roles": centreRoles,
    "@/lib/staff-permissions": staffPermissions,
    "@/lib/access-control": accessControl,
    "@/lib/features": features,
    "@/lib/utils": utils,
    "@/lib/daily-care": dailyCare,
    "@/lib/licensed-day": licensedDay,
    "@/lib/private-media": privateMedia,
    "@/lib/private-photo-feed": privatePhotoFeed,
    "@/lib/server/roles": { resolveAdminAccess: async () => ({ ok: false }) },
    "@/lib/server/notify": {
      lookupUser: async (userId) => ({ name: userId === STAFF ? "Floor Staff" : "Parent", email: null }),
      notifyThreadParty: async () => {
        throw new Error("mail is out of scope");
      },
    },
    "@/lib/server/thread-access": {
      markConversationRead: async () => {
        throw new Error("thread reads are out of scope");
      },
    },
  };
  modules["@/lib/server/centre-access"] = load("centre-access", modules);
  modules["@/lib/server/daily-care"] = load("daily-care", modules);
  api = {
    care: load("care-ops", modules),
    ops: load("ops", modules),
  };
});

after(async () => {
  await pg.close();
});

beforeEach(async () => {
  state.swap = null;
  state.queries = [];
  await pg.exec(`
    truncate care_medication_logs, care_medications, care_incidents, care_day_notes,
      care_enrolment_splits, care_child_room_assignments, care_roster_assignments, care_rooms,
      attendance, messages, conversations, bookings, children, centre_members, provider_daycares,
      profiles, "user", daycares;
    insert into daycares values
      ('${CENTRE}', 'Victim Centre', 'ON'),
      ('${OTHER}', 'Other Centre', 'ON');
    insert into "user" values
      ('${ATTACKER}', 'Other Parent', 'other@example.invalid'),
      ('${PARENT}', 'Ada Parent User', 'ada@example.invalid'),
      ('${VICTIM_PARENT}', 'Victim Parent', 'victim@example.invalid'),
      ('${STAFF}', 'Floor Staff', 'staff@example.invalid'),
      ('${READER}', 'Read Only', 'reader@example.invalid');
    insert into profiles values
      ('${ATTACKER}', 'parent'),
      ('${PARENT}', 'parent'),
      ('${VICTIM_PARENT}', 'parent'),
      ('${STAFF}', 'provider'),
      ('${READER}', 'provider');
    insert into centre_members values
      ('${STAFF}', '${CENTRE}', 'staff', 'active', 'staff', null),
      ('${READER}', '${CENTRE}', 'read_only', 'active', 'read_only', null);
    insert into children values
      ('${CHILD_VICTIM}', '${VICTIM_PARENT}', '${VICTIM_NAME}'),
      ('${CHILD_ADA}', '${PARENT}', '${ADA_NAME}'),
      ('${CHILD_OTHER}', '${ATTACKER}', '${OTHER_NAME}');
    insert into bookings values
      ('${BOOKING_VICTIM}', '${CENTRE}', '${VICTIM_PARENT}', 'active', null, '${CHILD_VICTIM}', 'Victim Parent'),
      ('${BOOKING_ADA}', '${CENTRE}', '${PARENT}', 'active', null, '${CHILD_ADA}', 'Ada Parent User'),
      ('${BOOKING_OTHER}', '${OTHER}', '${ATTACKER}', 'accepted', null, '${CHILD_OTHER}', 'Other Parent');
    insert into attendance (id, daycare_id, booking_id, child_name, parent_user_id, day, drop_off, pick_up, status, notes, updated_by) values
      ('att-victim', '${CENTRE}', '${BOOKING_VICTIM}', '${VICTIM_NAME}', '${VICTIM_PARENT}', '${DAY}', '08:00', '16:00', 'scheduled', '', '${STAFF}'),
      ('att-ada', '${CENTRE}', '${BOOKING_ADA}', '${ADA_NAME}', '${PARENT}', '${DAY}', '08:00', '16:00', 'scheduled', '', '${STAFF}');
  `);
});

function medicationInput(overrides = {}) {
  return {
    daycareId: CENTRE,
    childName: VICTIM_NAME,
    parentUserId: ATTACKER,
    name: "Forged Syrup",
    dosage: "5 ml",
    instructions: "Give at lunch",
    times: ["08:00", "12:00"],
    startDay: DAY,
    ...overrides,
  };
}

function attendanceInput(overrides = {}) {
  return {
    daycareId: CENTRE,
    childName: VICTIM_NAME,
    parentUserId: ATTACKER,
    day: DAY,
    dropOff: "08:00",
    pickUp: "16:00",
    status: "absent",
    notes: "forged absence",
    ...overrides,
  };
}

async function saveMedication(userId, data) {
  return api.care.saveCareMedication({ context: { userId: signedInUser(userId) }, data });
}

async function saveAttendance(userId, data) {
  return api.ops.saveAttendance({ context: { userId: signedInUser(userId) }, data });
}

async function medicationRows() {
  return (await pg.query(
    `select id, daycare_id, booking_id, child_name, parent_user_id, name, dosage, instructions, created_by,
            start_day::text as start_day, schedule_times::text as schedule_times
     from care_medications order by child_name, name`,
  )).rows;
}

async function logRows() {
  return (await pg.query(
    `select medication_id, daycare_id, child_name, parent_user_id, status, given_by, scheduled_time
     from care_medication_logs order by medication_id`,
  )).rows;
}

async function attendanceRows() {
  return (await pg.query(
    `select daycare_id, booking_id, child_name, parent_user_id, day::text as day, status, notes, updated_by
     from attendance order by child_name`,
  )).rows;
}

function victimDeskRow() {
  return {
    daycareId: CENTRE,
    bookingId: BOOKING_VICTIM,
    childName: VICTIM_NAME,
    parentUserId: VICTIM_PARENT,
    day: DAY,
  };
}

async function shownOnVictimDesk() {
  const ops = await api.care.listCareOps({ context: { userId: signedInUser(STAFF) }, data: { daycareId: CENTRE, day: DAY } });
  return ops.medications.filter((med) => matchesChild(victimDeskRow(), med.childName, med.bookingId));
}

async function logDose(medicationId) {
  return api.care.logCareMedicationDose({
    context: { userId: signedInUser(STAFF) },
    data: { medicationId, scheduledTime: "08:00", status: "given", day: DAY, notes: "from the desk" },
  });
}

function assertMedicationIs(row, expected) {
  assert.equal(row.daycare_id, expected.daycareId);
  assert.equal(row.booking_id, expected.bookingId);
  assert.equal(row.parent_user_id, expected.parentUserId);
  assert.equal(row.child_name, expected.childName);
  assert.equal(row.created_by, expected.createdBy);
}

async function assertNoForgedMedication(error, saved) {
  if (saved?.id) await logDose(saved.id).catch(() => undefined);
  const meds = await medicationRows();
  const logs = await logRows();
  let desk = [];
  let deskError = null;
  try {
    desk = await shownOnVictimDesk();
  } catch (err) {
    deskError = err instanceof Error ? err.message : String(err);
  }
  assert.ok(
    error,
    `saveCareMedication stored a medication the caller does not own: ${JSON.stringify({ meds, logs, desk, deskError })}`,
  );
  assert.deepEqual(meds, [], "a refused schedule must not leave a care_medications row");
  assert.deepEqual(logs, [], "a refused schedule must not leave a dose log");
  assert.equal(deskError, null);
  assert.deepEqual(desk, [], "staff desk must not show the forged order on the child's row");
}

test("an unrelated signed-in parent cannot file a medication under another centre's child", async () => {
  let saved = null;
  let error = null;
  try {
    saved = await saveMedication(ATTACKER, medicationInput());
  } catch (err) {
    error = err;
  }
  await assertNoForgedMedication(error, saved);
});

test("an unrelated parent cannot attach a medication to another family's booking", async () => {
  let saved = null;
  let error = null;
  try {
    saved = await saveMedication(ATTACKER, medicationInput({ bookingId: BOOKING_VICTIM, childName: "Wrong Name" }));
  } catch (err) {
    error = err;
  }
  await assertNoForgedMedication(error, saved);
});

test("a booking at a different centre does not authorize a medication at the target centre", async () => {
  let saved = null;
  let error = null;
  try {
    saved = await saveMedication(
      ATTACKER,
      medicationInput({ bookingId: BOOKING_OTHER, childName: VICTIM_NAME }),
    );
  } catch (err) {
    error = err;
  }
  await assertNoForgedMedication(error, saved);
});

test("a parent cannot store a medication for a different child than their enrolled booking", async () => {
  let error = null;
  try {
    await saveMedication(
      PARENT,
      medicationInput({
        parentUserId: PARENT,
        bookingId: BOOKING_ADA,
        childName: VICTIM_NAME,
        name: "Wrong Child Drops",
      }),
    );
  } catch (err) {
    error = err;
  }
  const meds = await medicationRows();
  if (error) {
    assert.deepEqual(meds, []);
    return;
  }
  assert.equal(meds.length, 1);
  assertMedicationIs(meds[0], {
    daycareId: CENTRE,
    bookingId: BOOKING_ADA,
    parentUserId: PARENT,
    childName: ADA_NAME,
    createdBy: PARENT,
  });
});

test("a medication keeps the child from the authorization read when the booking changes before insert", async () => {
  state.swap = {
    bookingId: BOOKING_ADA,
    nextChildId: CHILD_VICTIM,
    renameChildId: CHILD_ADA,
    renameTo: "Swapped Ada",
  };
  let error = null;
  try {
    await saveMedication(
      PARENT,
      medicationInput({
        parentUserId: PARENT,
        bookingId: BOOKING_ADA,
        childName: VICTIM_NAME,
        name: "Swapped Drops",
      }),
    );
  } catch (err) {
    error = err;
  }
  const booking = (await pg.query("select child_id from bookings where id = $1", [BOOKING_ADA])).rows[0];
  const meds = await medicationRows();
  if (error) {
    assert.deepEqual(meds, [], "a refused schedule must not leave a medication row");
    return;
  }
  assert.equal(booking.child_id, CHILD_VICTIM, "the booking must change after the authorization read");
  assert.equal(meds.length, 1);
  assertMedicationIs(meds[0], {
    daycareId: CENTRE,
    bookingId: BOOKING_ADA,
    parentUserId: PARENT,
    childName: ADA_NAME,
    createdBy: PARENT,
  });
  const renamed = (await pg.query("select name from children where id = $1", [CHILD_ADA])).rows[0];
  assert.equal(renamed.name, "Swapped Ada");
  assert.notEqual(meds[0].child_name, renamed.name);
});

test("an enrolled parent can schedule medicine for their own child", async () => {
  const saved = await saveMedication(
    PARENT,
    medicationInput({
      parentUserId: PARENT,
      bookingId: BOOKING_ADA,
      childName: ADA_NAME,
      name: "Vitamin D",
      dosage: "1 drop",
    }),
  );
  assert.equal(saved.ok, true);
  const meds = await medicationRows();
  assert.equal(meds.length, 1);
  assertMedicationIs(meds[0], {
    daycareId: CENTRE,
    bookingId: BOOKING_ADA,
    parentUserId: PARENT,
    childName: ADA_NAME,
    createdBy: PARENT,
  });
  assert.equal(meds[0].name, "Vitamin D");
  const desk = await api.care.listCareOps({
    context: { userId: signedInUser(PARENT) },
    data: { daycareId: CENTRE, day: DAY },
  });
  assert.equal(desk.medications.length, 1);
  assert.equal(desk.medications[0].childName, ADA_NAME);
  assert.equal(desk.role, "parent");
});

test("staff at the centre can schedule a medicine and log a dose for an enrolled child", async () => {
  const saved = await saveMedication(
    STAFF,
    medicationInput({
      parentUserId: VICTIM_PARENT,
      bookingId: BOOKING_VICTIM,
      childName: VICTIM_NAME,
      name: "Centre Vitamin",
    }),
  );
  assert.equal(saved.ok, true);
  const shown = await shownOnVictimDesk();
  assert.equal(shown.length, 1);
  assert.equal(shown[0].name, "Centre Vitamin");
  assert.equal(shown[0].childName, VICTIM_NAME);
  assert.equal(matchesChild(victimDeskRow(), shown[0].childName, shown[0].bookingId), true);
  const logged = await logDose(saved.id);
  assert.equal(logged.ok, true);
  const logs = await logRows();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].status, "given");
  assert.equal(logs[0].given_by, STAFF);
  assert.equal(logs[0].child_name, VICTIM_NAME);
});

test("a read-only member cannot schedule medicine by sending their own parent id", async () => {
  await assert.rejects(() =>
    saveMedication(READER, medicationInput({ parentUserId: READER, childName: VICTIM_NAME })),
  );
  assert.deepEqual(await medicationRows(), []);
  assert.deepEqual(await logRows(), []);
});

test("an unrelated parent cannot mark another centre's child absent", async () => {
  let error = null;
  try {
    await saveAttendance(ATTACKER, attendanceInput());
  } catch (err) {
    error = err;
  }
  const rows = await attendanceRows();
  const victim = rows.find((row) => row.child_name === VICTIM_NAME);
  assert.ok(error, `saveAttendance changed another child: ${JSON.stringify(rows)}`);
  assert.equal(victim.status, "scheduled");
  assert.equal(victim.updated_by, STAFF);
  assert.equal(victim.notes, "");
  assert.equal(rows.some((row) => row.updated_by === ATTACKER), false);
});

test("a parent cannot mark a different child absent by sending their own parent id", async () => {
  let error = null;
  try {
    await saveAttendance(
      PARENT,
      attendanceInput({ parentUserId: PARENT, bookingId: BOOKING_ADA, childName: VICTIM_NAME }),
    );
  } catch (err) {
    error = err;
  }
  const rows = await attendanceRows();
  const victim = rows.find((row) => row.child_name === VICTIM_NAME);
  assert.equal(victim.status, "scheduled");
  assert.equal(victim.updated_by, STAFF);
  const ada = rows.find((row) => row.child_name === ADA_NAME);
  if (!error) {
    assert.equal(ada.status, "absent");
    assert.equal(ada.updated_by, PARENT);
    assert.equal(ada.booking_id, BOOKING_ADA);
    assert.equal(ada.parent_user_id, PARENT);
  } else {
    assert.equal(ada.status, "scheduled");
    assert.equal(ada.updated_by, STAFF);
  }
});

test("an absence keeps the child from the authorization read when the booking changes before write", async () => {
  state.swap = {
    bookingId: BOOKING_ADA,
    nextChildId: CHILD_VICTIM,
    renameChildId: CHILD_ADA,
    renameTo: "Swapped Ada",
  };
  let error = null;
  try {
    await saveAttendance(
      PARENT,
      attendanceInput({
        parentUserId: PARENT,
        bookingId: BOOKING_ADA,
        childName: VICTIM_NAME,
        notes: "swap attempt",
      }),
    );
  } catch (err) {
    error = err;
  }
  const rows = await attendanceRows();
  const victim = rows.find((row) => row.child_name === VICTIM_NAME);
  assert.equal(victim.status, "scheduled");
  assert.equal(victim.updated_by, STAFF);
  assert.equal(victim.notes, "");
  const ada = rows.find((row) => row.child_name === ADA_NAME);
  const booking = (await pg.query("select child_id from bookings where id = $1", [BOOKING_ADA])).rows[0];
  if (error) {
    assert.equal(ada.status, "scheduled");
    assert.equal(ada.updated_by, STAFF);
    return;
  }
  assert.equal(ada.status, "absent");
  assert.equal(booking.child_id, CHILD_VICTIM, "the booking must change after the authorization read");
  assert.equal(ada.updated_by, PARENT);
  assert.equal(ada.booking_id, BOOKING_ADA);
  assert.equal(ada.parent_user_id, PARENT);
  assert.equal(ada.child_name, ADA_NAME);
});

test("an enrolled parent can mark their own child absent", async () => {
  const saved = await saveAttendance(
    PARENT,
    attendanceInput({
      parentUserId: PARENT,
      bookingId: BOOKING_ADA,
      childName: ADA_NAME,
      notes: "fever",
    }),
  );
  assert.equal(saved.ok, true);
  const rows = await attendanceRows();
  const ada = rows.find((row) => row.child_name === ADA_NAME);
  const victim = rows.find((row) => row.child_name === VICTIM_NAME);
  assert.equal(ada.status, "absent");
  assert.equal(ada.notes, "fever");
  assert.equal(ada.updated_by, PARENT);
  assert.equal(ada.parent_user_id, PARENT);
  assert.equal(ada.booking_id, BOOKING_ADA);
  assert.equal(victim.status, "scheduled");
  assert.equal(victim.updated_by, STAFF);
});

test("a read-only member cannot mark a child absent by sending their own parent id", async () => {
  await assert.rejects(() => saveAttendance(READER, attendanceInput({ parentUserId: READER })));
  const victim = (await attendanceRows()).find((row) => row.child_name === VICTIM_NAME);
  assert.equal(victim.status, "scheduled");
  assert.equal(victim.updated_by, STAFF);
});
