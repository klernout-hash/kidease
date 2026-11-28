// Spec for createBooking: a signed-in caller may attach only their own child.
// These tests fail while a client-supplied childId is stored and later read
// back, decrypted, on that caller's centre desk. They pass once that insert
// is refused and no booking, spot count, or health field changes.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { evaluateSameSiteRequest } from "../src/lib/access-control.ts";
import { sealHealth } from "../src/lib/child-health-crypto.ts";

// Placeholder only. Not a deployed key. 32 bytes so sealHealth and openHealth
// run the same AES path the desk uses when CHILD_HEALTH_KEY is set.
process.env.CHILD_HEALTH_KEY = "11".repeat(32);
delete process.env.DATABASE_URL;
delete process.env.POSTHOG_FLAGS_KEY;
delete process.env.VITE_PUBLIC_POSTHOG_KEY;
delete process.env.FEATURE_CHILD_PORTFOLIO_GATE;
delete process.env.FEATURE_COPARENT_LINK;
delete process.env.FEATURE_COPARENT_EMAIL;

const key = "__kideaseChildBookingTenancy";
const scheme = "kidease-child-booking-tenancy:";
const mocks = {
  "@tanstack/react-start": `
    export function createServerOnlyFn(fn) { return fn; }
    export function createMiddleware() { return {}; }
    export function createServerFn() {
      let validate = (input) => input;
      let guarded = false;
      const builder = {
        middleware(guards) {
          guarded = Array.isArray(guards) && guards.length > 0;
          return builder;
        },
        validator(fn) { validate = fn; return builder; },
        handler(fn) {
          return async (input = {}) => {
            const userId = globalThis.${key}.userId;
            if (guarded && !userId) throw new Error("Unauthorized");
            return fn({ data: validate(input.data), context: { userId } });
          };
        },
      };
      return builder;
    }
  `,
  "@/lib/auth/middleware": "export const authMiddleware = { name: 'session' };",
  "@/lib/db": `
    export const dbSource = "pglite";
    export const getSql = async () => globalThis.${key}.sql;
    export const getSqlWithin = async () => globalThis.${key}.sql;
    export const getPglite = async () => { throw new Error("pglite instance is not used by this test"); };
    export const ensureDbReady = async () => {};
  `,
};
registerHooks({
  resolve(specifier, context, next) {
    if (Object.hasOwn(mocks, specifier)) return { url: scheme + specifier, shortCircuit: true };
    if (
      (specifier === "../db" || specifier === "../db.ts") &&
      String(context.parentURL || "").includes("/src/lib/auth/")
    ) {
      return { url: scheme + "@/lib/db", shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      const rel = specifier.slice(2);
      const file = rel.endsWith(".ts") || rel.endsWith(".tsx") ? rel : `${rel}.ts`;
      return next(new URL(`../src/${file}`, import.meta.url).href, context);
    }
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !/\.(ts|tsx|js|mjs|cjs|json|node)$/.test(specifier)
    ) {
      try {
        return next(`${specifier}.ts`, context);
      } catch {
        return next(specifier, context);
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(scheme)) {
      return { format: "module", source: mocks[url.slice(scheme.length)], shortCircuit: true };
    }
    return next(url, context);
  },
});

const { createBooking, createListing, createSpotRequest } = await import("../src/lib/server/family.ts");
const { listDaycareIncoming } = await import("../src/lib/server/enrol-queue.ts");
const { listChildHealthLog } = await import("../src/lib/server/child-health-log.ts");

const PARENT = "user_parent";
const OWNER = "user_owner";
const STAFF = "user_staff";
const OUTSIDER = "user_outsider";
const MAPLE = "daycare_maple";
const VICTIM = "child_rowan";
const OWN = "child_alden";
const VICTIM_ALLERGY = "cashew-butter-note";
const VICTIM_MEDICINE = "cetirizine-dose";
const VICTIM_ADDRESS = "14 Oak Crescent Winnipeg";
const VICTIM_PICKUP = "Sam Hale";
const VICTIM_DOCTOR = "Dr Nunez";
const VICTIM_EMERGENCY = "Pat Hale";
const OWN_ALLERGY = "strawberry-jam-note";

function sqlFor(pg) {
  const sql = async (strings, ...values) => {
    let text = "";
    strings.forEach((part, index) => {
      text += part;
      if (index < values.length) text += `$${index + 1}`;
    });
    const result = await pg.query(text, values);
    return result.rows;
  };
  sql.query = async (text, params = []) => (await pg.query(text, params)).rows;
  return sql;
}

async function database() {
  const pg = new PGlite();
  await pg.exec(`
    create table "user" (
      id text primary key,
      email text,
      name text,
      "emailVerified" boolean,
      "createdAt" timestamptz not null default timestamptz '2020-01-01'
    );
    create table profiles (
      user_id text primary key,
      role text not null default 'parent',
      locale text not null default 'en',
      phone text,
      city text,
      display_name text,
      created_at timestamptz not null default now(),
      facebook_email_required boolean not null default false,
      crm_provider_at timestamptz,
      crm_signup_at timestamptz,
      selected_plan text,
      selected_addons text,
      stripe_subscription_status text,
      featured_city_status text,
      featured_city_centre_id text
    );
    create table daycares (
      id text primary key,
      slug text unique not null,
      name text not null,
      name_fr text not null,
      tagline text not null,
      tagline_fr text not null,
      description text not null,
      description_fr text not null,
      address text not null,
      city text not null,
      province text not null default 'MB',
      postal_code text not null,
      lat double precision not null,
      lng double precision not null,
      phone text,
      hours text not null,
      hours_fr text not null,
      age_min_months int not null,
      age_max_months int not null,
      infant_monthly int,
      toddler_monthly int,
      preschool_monthly int,
      part_time_monthly int,
      fee_program text,
      fact_source text,
      spots_infant int not null default 0,
      spots_toddler int not null default 0,
      spots_preschool int not null default 0,
      waitlist int not null default 0,
      rating_x10 int not null default 0,
      review_count int not null default 0,
      license_number text,
      license_status text,
      registry_match_state text,
      license_verification_source text,
      languages text not null default 'en',
      staff_languages jsonb,
      cultural_programs jsonb,
      cultural_team_note text,
      amenities text not null default '',
      photos text not null,
      verified int not null default 0,
      google_place_id text,
      contact_email text,
      website text,
      claimed_at timestamptz,
      founding_member int,
      claim_status text,
      listing_active int,
      staff_screening_attested int,
      screening_on_file int,
      visibility text,
      is_test int,
      is_demo int,
      merged_into text,
      import_fault text,
      ages_confirmed int,
      ages_source text,
      ages_source_url text,
      last_photo_updated_at timestamptz,
      created_at timestamptz not null default now()
    );
    create table children (
      id text primary key,
      user_id text not null,
      name text not null,
      preferred_name text,
      birthdate text not null,
      notes text,
      allergies text,
      epi_pen boolean not null default false,
      medical_notes text,
      medications text,
      doctor_name text,
      doctor_phone text,
      foods_like text,
      foods_avoid text,
      diet text,
      likes text,
      comfort_item text,
      nap_routine text,
      toilet text,
      home_language text,
      soothes text,
      fears text,
      emergency_name text,
      emergency_phone text,
      pickup_people text,
      photo_ok boolean not null default false,
      sunscreen_ok boolean not null default true,
      immunization_status text,
      immunization_note text,
      home_address text,
      created_at timestamptz not null default now()
    );
    create table provider_daycares (
      user_id text not null,
      daycare_id text not null references daycares(id) on delete cascade,
      primary key (user_id, daycare_id)
    );
    create table centre_members (
      id text primary key,
      daycare_id text not null,
      user_id text not null,
      role text not null,
      status text not null,
      revoked_at timestamptz,
      revoked_by text
    );
    create table listing_claims (
      id text primary key,
      daycare_id text not null,
      user_id text not null,
      code text,
      status text,
      created_at timestamptz not null default now()
    );
    create table availability (
      daycare_id text not null references daycares(id) on delete cascade,
      month text not null,
      infant int not null,
      toddler int not null,
      preschool int not null,
      primary key (daycare_id, month)
    );
    create table bookings (
      id text primary key,
      user_id text not null,
      daycare_id text not null references daycares(id),
      child_id text,
      start_month text not null,
      start_date text,
      schedule text not null,
      days text,
      age_group text not null,
      status text not null,
      monthly_amount int not null,
      parent_note text,
      parent_name text,
      conversation_id text,
      subsidy_interest boolean,
      share_consent_at timestamptz,
      batch_id text,
      status_updated_at timestamptz,
      photo_consent_at timestamptz,
      created_at timestamptz not null default now()
    );
    create table conversations (
      id text primary key,
      user_id text not null,
      daycare_id text not null references daycares(id),
      last_at timestamptz not null default now(),
      unique (user_id, daycare_id)
    );
    create table messages (
      id text primary key,
      conversation_id text not null references conversations(id) on delete cascade,
      sender text not null,
      body text not null,
      kind text not null default 'chat',
      created_at timestamptz not null default now()
    );
    create table payments (
      id text primary key,
      booking_id text,
      status text,
      created_at timestamptz not null default now()
    );
    create table safety_blocks (
      blocker_user_id text,
      blocked_user_id text,
      daycare_id text
    );
    create table child_profile_access (
      id text primary key,
      child_id text not null,
      actor_id text not null,
      action text not null,
      daycare_id text
    );
    create table second_factor_prefs (
      user_id text primary key,
      parent_opt_in boolean,
      provider_grace_started_at timestamptz
    );
  `);
  const sql = sqlFor(pg);
  globalThis[key] = { sql, userId: "" };
  await sql`
    insert into "user" (id, email, name, "emailVerified") values
      (${PARENT}, ${"family.maple@example.com"}, ${"Maple Parent"}, true),
      (${OWNER}, ${"owner.maple@example.com"}, ${"Maple Owner"}, true),
      (${STAFF}, ${"aide.maple@example.com"}, ${"Maple Aide"}, true),
      (${OUTSIDER}, ${"riverbend.desk@example.com"}, ${"Riverbend Desk"}, true)
  `;
  await sql`
    insert into children (
      id, user_id, name, birthdate, allergies, epi_pen, medical_notes, medications,
      doctor_name, doctor_phone, emergency_name, emergency_phone, pickup_people,
      immunization_status, immunization_note, home_address
    ) values (
      ${VICTIM}, ${PARENT}, ${"Rowan Hale"}, ${"2022-04-11"},
      ${sealHealth(VICTIM_ALLERGY)}, true, ${sealHealth("wheeze after nuts")},
      ${sealHealth(VICTIM_MEDICINE)}, ${sealHealth(VICTIM_DOCTOR)}, ${sealHealth("2045550199")},
      ${sealHealth(VICTIM_EMERGENCY)}, ${sealHealth("2045550142")}, ${VICTIM_PICKUP},
      ${"record"}, ${sealHealth("card on file")}, ${VICTIM_ADDRESS}
    )
  `;
  await sql`
    insert into children (id, user_id, name, birthdate, allergies, epi_pen, home_address)
    values (
      ${OWN}, ${OUTSIDER}, ${"Alden Pike"}, ${"2021-06-02"},
      ${sealHealth(OWN_ALLERGY)}, false, ${"9 Birch Lane Winnipeg"}
    )
  `;
  await sql`
    insert into daycares (
      id, slug, name, name_fr, tagline, tagline_fr, description, description_fr,
      address, city, province, postal_code, lat, lng, hours, hours_fr,
      age_min_months, age_max_months, infant_monthly, toddler_monthly, preschool_monthly,
      part_time_monthly, spots_infant, spots_toddler, spots_preschool, waitlist,
      rating_x10, review_count, license_number, languages, amenities, photos, verified,
      claim_status, visibility, is_test
    ) values (
      ${MAPLE}, ${"maple-room"}, ${"Maple Room"}, ${"Maple Room"},
      ${"Licensed centre"}, ${"Centre permis"},
      ${"A licensed centre."}, ${"Un centre permis."},
      ${"20 Maple Street"}, ${"Winnipeg"}, ${"MB"}, ${"R3C 0A2"}, 49.89, -97.14,
      ${"7:30 a.m. to 5:30 p.m."}, ${"7 h 30 a 17 h 30"},
      6, 72, 800, 700, 650, 400, 1, 1, 1, 0, 40, 0, ${"MB10001"}, ${"en"}, ${"meals"},
      ${"https://media.kidease.ca/fixtures/maple.webp"}, 1, ${"claimed"}, ${"public"}, 0
    )
  `;
  await sql`insert into provider_daycares (user_id, daycare_id) values (${OWNER}, ${MAPLE})`;
  await sql`
    insert into centre_members (id, daycare_id, user_id, role, status)
    values (${"cm_staff"}, ${MAPLE}, ${STAFF}, ${"staff"}, ${"active"})
  `;
  await sql`
    insert into bookings (
      id, user_id, daycare_id, child_id, start_month, schedule, age_group, status, monthly_amount
    ) values (
      ${"bk_maple"}, ${PARENT}, ${MAPLE}, ${VICTIM}, ${"2026-12"}, ${"full"}, ${"preschool"}, ${"requested"}, 650
    )
  `;
  return sql;
}

function asCaller(userId) {
  globalThis[key].userId = userId;
}

function bookingInput(daycareId, childId) {
  return {
    daycareId,
    childId,
    startMonth: "2026-12",
    schedule: "full",
    ageGroup: "preschool",
  };
}

async function vacancy(sql, daycareId) {
  const rows = await sql`
    select spots_infant, spots_toddler, spots_preschool, waitlist
    from daycares where id = ${daycareId}
  `;
  return rows[0];
}

function deskLeak(rows, daycareId) {
  return rows
    .filter((row) => !daycareId || row.daycareId === daycareId)
    .filter((row) => row.childId === VICTIM || row.childName === "Rowan Hale" || row.child?.id === VICTIM)
    .map((row) => ({
      daycareId: row.daycareId,
      childId: row.childId,
      childName: row.childName,
      birthdate: row.birthdate,
      status: row.status,
      allergies: row.allergies || row.child?.allergies || "",
      epiPen: row.epiPen,
      medications: row.child?.medications || "",
      medicalNotes: row.child?.medicalNotes || "",
      doctorName: row.child?.doctorName || "",
      emergencyName: row.child?.emergencyName || "",
      pickupPeople: row.child?.pickupPeople || "",
      immunizationStatus: row.child?.immunizationStatus || "",
      homeAddress: row.child?.homeAddress || "",
    }));
}

async function victimBookings(sql, daycareId) {
  return sql`
    select id, user_id, child_id, status from bookings
    where daycare_id = ${daycareId} and child_id = ${VICTIM}
  `;
}

test("same-origin signed-in calls are allowed through to the server function", () => {
  assert.equal(
    evaluateSameSiteRequest({
      secFetchSite: "same-origin",
      secFetchDest: "empty",
      secFetchMode: "cors",
      method: "POST",
    }),
    "allow",
  );
});

test("staff at a centre the family applied to can read that child's id", async () => {
  const sql = await database();
  asCaller(STAFF);
  const incoming = await listDaycareIncoming();
  assert.equal(incoming.some((row) => row.childId === VICTIM), true);
  const health = incoming.find((row) => row.childId === VICTIM);
  assert.equal(health?.child?.allergies, VICTIM_ALLERGY);
  assert.equal(health?.child?.homeAddress, VICTIM_ADDRESS);
  // The application is what shared the file with Maple. This test only records
  // that the id is visible there. It is not the cross-centre bug.
  void sql;
});

test("a caller can book their own child into a centre they just listed", async () => {
  const sql = await database();
  asCaller(OUTSIDER);
  const listing = await createListing({
    data: {
      name: "Riverbend Early Learning",
      address: "18 Elm Street",
      city: "Winnipeg",
      province: "MB",
      postalCode: "R3C 0A1",
      licenseNumber: "MB44219",
      infantMonthly: 900,
      toddlerMonthly: 800,
      preschoolMonthly: 700,
    },
  });
  assert.equal(listing.ok, true);
  const owned = await sql`
    select daycare_id from provider_daycares where user_id = ${OUTSIDER} and daycare_id = ${listing.id}
  `;
  assert.equal(owned.length, 1);
  const created = await createBooking({ data: bookingInput(listing.id, OWN) });
  assert.equal(created.status, "accepted");
  asCaller(OUTSIDER);
  const incoming = await listDaycareIncoming();
  const mine = incoming.find((row) => row.childId === OWN);
  assert.ok(mine);
  assert.equal(mine.child?.allergies, OWN_ALLERGY);
  assert.equal(mine.child?.name, "Alden Pike");
});

test("createBooking refuses another family's child and does not change the centre", async () => {
  const sql = await database();
  asCaller(OUTSIDER);
  const listing = await createListing({
    data: {
      name: "Riverbend Early Learning",
      address: "18 Elm Street",
      city: "Winnipeg",
      province: "MB",
      postalCode: "R3C 0A1",
      licenseNumber: "MB44219",
      infantMonthly: 900,
      toddlerMonthly: 800,
      preschoolMonthly: 700,
    },
  });
  assert.equal(listing.ok, true);
  // The caller also has their own child, so a check that only asks "does this
  // account have a child?" and then inserts the supplied id still fails.
  const own = await createBooking({ data: bookingInput(listing.id, OWN) });
  assert.equal(own.status, "accepted");
  const before = await vacancy(sql, listing.id);

  let refusal = "";
  try {
    const created = await createBooking({ data: bookingInput(listing.id, VICTIM) });
    refusal = `returned ${created.status} ${created.id}`;
  } catch (err) {
    refusal = err instanceof Error ? err.message : "threw";
  }

  const staffOnNewCentre = "user_new_aide";
  await sql`
    insert into "user" (id, email, name, "emailVerified")
    values (${staffOnNewCentre}, ${"aide.riverbend@example.com"}, ${"Riverbend Aide"}, true)
  `;
  await sql`
    insert into centre_members (id, daycare_id, user_id, role, status)
    values (${"cm_new_aide"}, ${listing.id}, ${staffOnNewCentre}, ${"staff"}, ${"active"})
  `;

  asCaller(OUTSIDER);
  const linked = await victimBookings(sql, listing.id);
  const spots = await vacancy(sql, listing.id);
  const incoming = deskLeak(await listDaycareIncoming(), listing.id);
  const log = (await listChildHealthLog()).rows.filter(
    (row) => row.id === VICTIM || row.name === "Rowan Hale" || row.allergies === VICTIM_ALLERGY,
  );
  asCaller(staffOnNewCentre);
  const staffIncoming = deskLeak(await listDaycareIncoming(), listing.id);
  const staffLog = (await listChildHealthLog()).rows.filter(
    (row) => row.id === VICTIM || row.medications === VICTIM_MEDICINE || row.allergies === VICTIM_ALLERGY,
  );
  assert.deepEqual(
    {
      refusal,
      linked,
      spots,
      incoming,
      log,
      staffIncoming,
      staffLog,
      spotsUnchanged: JSON.stringify(spots) === JSON.stringify(before),
    },
    {
      refusal,
      linked: [],
      spots: before,
      incoming: [],
      log: [],
      staffIncoming: [],
      staffLog: [],
      spotsUnchanged: true,
    },
  );
});

test("an owner who already sees a child cannot copy that child onto a second centre", async () => {
  const sql = await database();
  asCaller(OWNER);
  const seen = await listDaycareIncoming();
  assert.equal(seen.some((row) => row.childId === VICTIM && row.child?.allergies === VICTIM_ALLERGY), true);
  const listing = await createListing({
    data: {
      name: "North Elm Care",
      address: "44 Elm Street",
      city: "Winnipeg",
      province: "MB",
      postalCode: "R3C 0A3",
      licenseNumber: "MB44220",
      infantMonthly: 900,
      toddlerMonthly: 800,
      preschoolMonthly: 700,
    },
  });
  assert.equal(listing.ok, true);
  const before = await vacancy(sql, listing.id);
  let refusal = "";
  try {
    const created = await createBooking({ data: bookingInput(listing.id, VICTIM) });
    refusal = `returned ${created.status} ${created.id}`;
  } catch (err) {
    refusal = err instanceof Error ? err.message : "threw";
  }
  assert.deepEqual(await victimBookings(sql, listing.id), [], refusal);
  assert.deepEqual(await vacancy(sql, listing.id), before, refusal);
  assert.deepEqual(deskLeak(await listDaycareIncoming(), listing.id), [], refusal);
  const log = await listChildHealthLog();
  // Maple's accepted-or-active filter: the original booking is only requested,
  // so the health log must not gain Rowan through the new centre either.
  assert.equal(log.rows.some((row) => row.id === VICTIM), false, refusal);
});

test("createSpotRequest does not attach a child id the caller does not own", async () => {
  const sql = await database();
  asCaller(OUTSIDER);
  const listing = await createListing({
    data: {
      name: "Riverbend Early Learning",
      address: "18 Elm Street",
      city: "Winnipeg",
      province: "MB",
      postalCode: "R3C 0A1",
      licenseNumber: "MB44219",
      infantMonthly: 900,
      toddlerMonthly: 800,
      preschoolMonthly: 700,
    },
  });
  assert.equal(listing.ok, true);
  await createSpotRequest({
    data: {
      daycareId: listing.id,
      childId: VICTIM,
      childName: "Alden Pike",
      birthdate: "2021-06-02",
      startDate: "2026-12-01",
      schedule: "full",
    },
  });
  assert.deepEqual(await victimBookings(sql, listing.id), []);
  const victim = await sql`select allergies, home_address from children where id = ${VICTIM}`;
  assert.equal(victim[0].home_address, VICTIM_ADDRESS);
  const incoming = await listDaycareIncoming();
  assert.equal(incoming.some((row) => row.childId === VICTIM), false);
  assert.equal(deskLeak(incoming, listing.id).length, 0);
});

test("member-only staff cannot open a listing while they only work at someone else's centre", async () => {
  await database();
  asCaller(STAFF);
  await assert.rejects(
    () =>
      createListing({
        data: {
          name: "Aide Side Centre",
          address: "8 Oak Street",
          city: "Winnipeg",
          province: "MB",
          postalCode: "R3C 0A4",
          licenseNumber: "MB44221",
          infantMonthly: 900,
          toddlerMonthly: 800,
          preschoolMonthly: 700,
        },
      }),
    /Only the centre owner can add a listing/,
  );
});
