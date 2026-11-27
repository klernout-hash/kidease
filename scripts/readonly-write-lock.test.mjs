/**
 * Read-only centre members must get 403 on every protected write, and the
 * in-memory test database must not gain a row. This file is part of `npm test`
 * in CI. It never opens POSTGRES_URL, DATABASE_URL, or production Neon.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import * as accessControl from "../src/lib/access-control.ts";
import * as centreDocuments from "../src/lib/centre-documents.ts";
import * as centreRoles from "../src/lib/centre-roles.ts";
import * as centreTools from "../src/lib/centre-tools.ts";
import * as dailyCare from "../src/lib/daily-care.ts";
import * as familyVault from "../src/lib/family-vault.ts";
import * as features from "../src/lib/features.ts";
import * as flags from "../src/lib/flags.ts";
import * as listingVisibility from "../src/lib/listing-visibility.ts";
import * as privateDocs from "../src/lib/private-docs.ts";
import * as providerScreening from "../src/lib/provider-screening.ts";
import * as utils from "../src/lib/utils.ts";
import * as runtimeSwitches from "../src/lib/runtime-switches.ts";
import * as staffPermissions from "../src/lib/staff-permissions.ts";

const READER = "reader-1";
const CENTRE = "centre-1";
const BOOKING = "book-1";
const FLAGS = {
  FEATURE_CHILD_CHECKIN: "1",
  FEATURE_DAILY_LOGS: "1",
  FEATURE_STAFF_TIMESHEETS: "1",
  FEATURE_CENTRE_DOCUMENTS: "1",
  FEATURE_MEAL_PLANNING: "1",
  FEATURE_ENROLMENT_ESIGN: "1",
  FEATURE_PARENT_AGREEMENT: "1",
};

const pdf = Buffer.from("%PDF-1.1\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const pdfUrl = `data:application/pdf;base64,${pdf.toString("base64")}`;

function serverSource(file) {
  return readFileSync(new URL(`../src/lib/server/${file}.ts`, import.meta.url), "utf8")
    .replaceAll("import.meta.env?.SSR", "false")
    .replaceAll("import.meta.env.SSR", "false");
}

function transpile(source) {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  return output.replace(/import\((['"])([^'"]+)\1\)/g, "Promise.resolve(require($1$2$1))");
}

function stub(name) {
  const called = (prop) => {
    const error = new Error(`Unexpected call ${name}.${String(prop)}`);
    error.status = 500;
    throw error;
  };
  return new Proxy(
    { __esModule: true },
    {
      get(target, prop) {
        if (prop === "__esModule" || prop in target) return target[prop];
        if (prop === "then") return undefined;
        return called.bind(null, prop);
      },
    },
  );
}

function load(file, modules) {
  const exports = {};
  const requireMod = (name) => {
    if (modules[name]) return modules[name];
    const serverName = name.startsWith("./") ? `@/lib/server/${name.slice(2)}` : "";
    if (serverName && modules[serverName]) return modules[serverName];
    return stub(name);
  };
  new Function("require", "exports", transpile(serverSource(file)))(requireMod, exports);
  return exports;
}

async function database() {
  const pg = new PGlite();
  assert.equal(typeof pg.query, "function");
  await pg.exec(`
    create table daycares (
      id text primary key, name text, slug text, province text,
      license_photo text, claim_status text, screening_on_file int,
      spots_infant int, spots_toddler int, spots_preschool int,
      last_vacancy_updated_at timestamptz, open_spots_hidden_at timestamptz
    );
    create table provider_daycares (user_id text, daycare_id text);
    create table centre_members (
      id text, daycare_id text, user_id text, role text, status text,
      revoked_at timestamptz, revoked_by text
    );
    create table bookings (
      id text primary key, daycare_id text, user_id text, status text,
      conversation_id text, child_id text
    );
    create table "user" (id text primary key, name text, email text);
    create table family_documents (
      id text primary key, user_id text, storage_ref text, mime text,
      file_name text, kind text, created_at timestamptz
    );
    create table family_document_shares (
      id text, document_id text, daycare_id text, revoked_at timestamptz, shared_at timestamptz
    );
    insert into daycares values ('${CENTRE}', 'Hidden QA', 'qa', 'MB', '', 'approved', 0, 1, 1, 1, null, null);
    insert into centre_members values ('cm-1', '${CENTRE}', '${READER}', 'read_only', 'active', null, null);
    insert into bookings values ('${BOOKING}', '${CENTRE}', 'parent-1', 'accepted', null, null);
    insert into "user" values ('parent-1', 'Jonny Doey', 'parent@example.invalid');
    insert into family_documents values (
      'doc-1', 'parent-1', 'family-docs/doc-1.pdf', 'application/pdf', 'immunization.pdf', 'immunization', now()
    );
    insert into family_document_shares values ('share-1', 'doc-1', '${CENTRE}', null, now());
  `);
  const writes = [];
  const run = async (text, values) => {
    if (/^\s*(insert|update|delete|create|alter|drop|truncate|with)\b/i.test(text)) {
      writes.push(text.replace(/\s+/g, " ").trim().slice(0, 180));
      return [];
    }
    return (await pg.query(text, values)).rows;
  };
  const sql = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run(text, values);
  };
  sql.query = (text, values) => run(text, values ?? []);
  const counts = async () =>
    (
      await pg.query(`
        select 'daycares' as t, count(*)::int as n from daycares
        union all select 'members', count(*)::int from centre_members
        union all select 'bookings', count(*)::int from bookings
        union all select 'docs', count(*)::int from family_documents
        union all select 'shares', count(*)::int from family_document_shares
      `)
    ).rows;
  return { pg, sql, writes, counts };
}

function modulesFor(sql, privateDocsServer, centreAccess) {
  const chain = () => {
    const api = {
      middleware: () => api,
      validator: () => api,
      handler: (fn) => fn,
    };
    return api;
  };
  return {
    "@tanstack/react-start": { createServerFn: chain, createServerOnlyFn: (fn) => fn },
    "@/lib/db": { getSql: async () => sql, getSqlWithin: async () => sql },
    "@/lib/auth/middleware": { authMiddleware: {} },
    "@/lib/centre-roles": centreRoles,
    "@/lib/staff-permissions": staffPermissions,
    "@/lib/server/centre-access": centreAccess,
    "@/lib/features": features,
    "@/lib/flags": flags,
    "@/lib/utils": utils,
    "@/lib/runtime-switches": runtimeSwitches,
    "@/lib/daily-care": dailyCare,
    "@/lib/centre-tools": centreTools,
    "@/lib/centre-documents": centreDocuments,
    "@/lib/private-docs": privateDocs,
    "@/lib/server/private-docs": privateDocsServer,
    "@/lib/provider-screening": providerScreening,
    "@/lib/family-vault": familyVault,
    "@/lib/access-control": accessControl,
    "@/lib/listing-visibility": listingVisibility,
    "@/lib/waitlist-pulse": {
      cooldownUntilIso: () => null,
      pulseRateLimited: () => false,
    },
    "@/lib/server/roles": {
      resolveAdminAccess: async () => ({ ok: false }),
      requireAdmin: async () => {
        throw Object.assign(new Error("admin"), { status: 403 });
      },
      writeProfileRole: async () => {
        throw new Error("Unexpected role write");
      },
    },
  };
}

async function harness() {
  const db = await database();
  const base = modulesFor(db.sql, {}, {});
  const centreAccess = load("centre-access", base);
  const privateDocsServer = load("private-docs", {
    ...base,
    "@/lib/server/r2": {
      resolveR2Config: () => ({ ok: false }),
      resolvePrivateR2Config: () => ({ ok: false }),
      R2_SETUP_MESSAGE: "off",
      R2_PRIVATE_SETUP_MESSAGE: "off",
    },
  });
  const modules = modulesFor(db.sql, privateDocsServer, centreAccess);
  for (const guard of ["screening-owner-access", "listing-owner-access"]) {
    modules[`@/lib/server/${guard}`] = load(guard, {
      ...modules,
      "@tanstack/react-start/server": { setResponseStatus: () => {} },
    });
  }
  const files = {
    "child-checkin": load("child-checkin", modules),
    claims: load("claims", modules),
    "waitlist-api": load("waitlist-api", modules),
    "daily-care": load("daily-care", modules),
    "care-ops": load("care-ops", modules),
    ops: load("ops", modules),
    "centre-documents": load("centre-documents", modules),
    "provider-screening": load("provider-screening", modules),
    timesheets: load("timesheets", modules),
    "centre-tools": load("centre-tools", modules),
    "family-vault": load("family-vault", modules),
    "care-floor": load("care-floor", modules),
    family: load("family", modules),
  };
  return { ...db, files };
}

const previous = {};
test.before(() => {
  for (const [key, value] of Object.entries(FLAGS)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
});
test.after(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const cases = [
  {
    name: "check-in",
    run: (files) => files["child-checkin"].recordChildCheck({ context: { userId: READER }, data: { bookingId: BOOKING, action: "check_in" } }),
  },
  {
    name: "Confirm open spots",
    run: (files) => files.claims.refreshVacancy({ context: { userId: READER }, data: { daycareId: CENTRE } }),
  },
  {
    name: "Notify waitlist",
    run: (files) => files["waitlist-api"].pulseWaitlistSpot({ context: { userId: READER }, data: { daycareId: CENTRE } }),
  },
  {
    name: "care nap",
    run: (files) =>
      files["daily-care"].logDailyCare({
        context: { userId: READER },
        data: { daycareId: CENTRE, bookingId: BOOKING, childName: "Avery", kind: "nap", state: "asleep", minutes: 30 },
      }),
  },
  {
    name: "care schedule",
    run: (files) =>
      files["care-ops"].saveCareMedication({
        context: { userId: READER },
        data: { daycareId: CENTRE, bookingId: BOOKING, childName: "Avery", name: "Vitamin", dosage: "1 ml", times: ["08:00"] },
      }),
  },
  {
    name: "care journal",
    run: (files) =>
      files["daily-care"].postDailyJournal({
        context: { userId: READER },
        data: { daycareId: CENTRE, bookingId: BOOKING, childName: "Avery", body: "Played outside." },
      }),
  },
  {
    name: "care report",
    run: (files) =>
      files["care-ops"].submitCareIncident({
        context: { userId: READER },
        data: { daycareId: CENTRE, bookingId: BOOKING, childName: "Avery", kind: "bump", description: "Bumped a knee." },
      }),
  },
  {
    name: "care absent",
    run: (files) =>
      files.ops.saveAttendance({
        context: { userId: READER },
        data: {
          daycareId: CENTRE,
          bookingId: BOOKING,
          childName: "Avery",
          day: "2026-11-15",
          dropOff: "08:00",
          pickUp: "16:00",
          status: "absent",
        },
      }),
  },
  {
    name: "document upload",
    run: (files) =>
      files["centre-documents"].saveCentreDocument({
        context: { userId: READER },
        data: { daycareId: CENTRE, kind: "policy", policyKey: "health", dataUrl: pdfUrl, mime: "application/pdf", filename: "health.pdf" },
      }),
  },
  {
    name: "screening upload",
    run: (files) =>
      files["provider-screening"].saveScreeningUpload({
        userId: READER,
        daycareId: CENTRE,
        personId: "person-1",
        kind: "vsc",
        body: pdf,
        mime: "application/pdf",
        filename: "vsc.pdf",
      }),
  },
  {
    name: "VSC letter",
    run: (files) =>
      files["provider-screening"].generateScreeningLetter({
        context: { userId: READER },
        data: { daycareId: CENTRE, personId: "person-1", kind: "vsc" },
      }),
  },
  {
    name: "clock in",
    run: (files) => files.timesheets.clockInTimesheet({ context: { userId: READER }, data: { daycareId: CENTRE, staffName: "Alex" } }),
  },
  {
    name: "clock out",
    run: (files) => files.timesheets.clockOutTimesheet({ context: { userId: READER }, data: { daycareId: CENTRE, entryId: "tim-1" } }),
  },
  {
    name: "timesheet edit",
    run: (files) =>
      files.timesheets.editTimesheet({
        context: { userId: READER },
        data: { daycareId: CENTRE, entryId: "tim-1", staffName: "Alex", clockIn: "2026-11-15T14:00:00.000Z", clockOut: "2026-11-15T18:00:00.000Z" },
      }),
  },
  {
    name: "meal plan save",
    run: (files) =>
      files["centre-tools"].saveCentreToolRecord({
        context: { userId: READER },
        data: { daycareId: CENTRE, kind: "menu", payload: { title: "Monday lunch" } },
      }),
  },
  {
    name: "toileting",
    run: (files) =>
      files["care-floor"].saveCareFloor({
        context: { userId: READER },
        data: { daycareId: CENTRE, action: "toilet", bookingId: BOOKING, payload: { kind: "diaper", note: "dry", child: "Avery" } },
      }),
  },
  {
    name: "authorised pickup",
    run: (files) =>
      files["care-floor"].saveCareFloor({
        context: { userId: READER },
        data: { daycareId: CENTRE, action: "pickup", bookingId: BOOKING, payload: { person: "Sam", confirmed: true, signature: "Sam", child: "Avery", allowed: ["Sam"] } },
      }),
  },
  {
    name: "health screen",
    run: (files) =>
      files["care-floor"].saveCareFloor({
        context: { userId: READER },
        data: { daycareId: CENTRE, action: "health", bookingId: BOOKING, payload: { checks: { fever: false, rash: false, cough: false, vomiting: false }, child: "Avery" } },
      }),
  },
  {
    name: "allergen/incident",
    run: (files) =>
      files["care-floor"].saveCareFloor({
        context: { userId: READER },
        data: { daycareId: CENTRE, action: "event", bookingId: BOOKING, payload: { kind: "allergen", note: "Milk splash", child: "Avery" } },
      }),
  },
  {
    name: "roll call",
    run: (files) => files["care-floor"].saveCareFloor({ context: { userId: READER }, data: { daycareId: CENTRE, action: "roll_start", payload: {} } }),
  },
  {
    name: "add a centre",
    run: (files) =>
      files.family.createListing({
        context: { userId: READER },
        data: { name: "New centre", address: "1 Main", city: "Winnipeg", postalCode: "R3C0A1", licenseNumber: "1", infantMonthly: 0, toddlerMonthly: 0, preschoolMonthly: 0 },
      }),
  },
  {
    name: "contract/family-file GET",
    run: (files) => files["family-vault"].loadFamilyDocumentFor({ userId: READER, documentId: "doc-1" }),
  },
];

test("read-only lockdown against the in-memory test database", async (t) => {
  const { files, writes, counts, pg } = await harness();
  t.after(() => pg.close());
  const before = await counts();
  const passed = [];
  for (const item of cases) {
    await t.test(item.name, async () => {
      writes.length = 0;
      await assert.rejects(item.run(files), (error) => {
        assert.equal(error?.status, 403, error?.message || String(error));
        return true;
      });
      assert.deepEqual(writes, [], "a write was attempted");
      passed.push(item.name);
    });
  }
  await t.test("no row was written", async () => {
    assert.deepEqual(await counts(), before);
    assert.deepEqual(passed, cases.map((item) => item.name));
    console.log(`READONLY_LOCK ${JSON.stringify(passed)}`);
  });
});
