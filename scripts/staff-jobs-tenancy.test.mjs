import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { after, beforeEach, test } from "node:test";

// Integration fixture: real job server functions, resume route and profile
// projection. Framework transport, sessions, SQL, 2FA and blob storage are
// synthetic boundaries. No database, Vercel, production config or real account.
const key = "__kideaseStaffJobsTenancyFixture";
const scheme = "kidease-staff-jobs-tenancy:";
const mocks = {
  "@tanstack/react-start": `
    export function createServerFn() {
      let validate = x => x;
      let guarded = false;
      return {
        middleware(guards) { guarded = guards.includes("fixture-session"); return this; },
        validator(fn) { validate = fn; return this; },
        handler(fn) { return async (input = {}) => {
          const userId = globalThis.${key}.userId;
          if (guarded && !userId) throw Error("Unauthorized");
          return fn({ data: validate(input.data), context: { userId } });
        }; }
      };
    }`,
  "@tanstack/react-router": "export const createFileRoute = () => config => config;",
  "@/lib/auth/middleware": 'export const authMiddleware = "fixture-session";',
  "@/lib/auth/verify.server": `
    export async function requireUserId() {
      const userId = globalThis.${key}.userId;
      if (!userId) throw Error("Unauthorized");
      return userId;
    }`,
  "@/lib/db": `export const getSql = async () => globalThis.${key}.sql;`,
  "@/lib/features": `export const staffJobBoardEnabled = () => globalThis.${key}.enabled;`,
  "@/lib/utils": 'export const nid = () => "fixture-id";',
  "@/lib/private-docs":
    'export const asUploadPart = () => null, inferPrivateDocMime = () => null, PRIVATE_DOC_BAD_FILE = "bad file";',
  "@/lib/server/centre-access": `
    export const listAccessibleDaycareIds = async (_sql, userId) => Object.keys(globalThis.${key}.roles[userId] ?? {});
    export const loadCentreRole = async (_sql, userId, id) => globalThis.${key}.roles[userId]?.[id] ?? null;`,
  "@/lib/server/second-factor": `
    export async function assertSensitiveFileAccess(userId, role) {
      const fixture = globalThis.${key};
      fixture.factorCalls.push([userId, role]);
      if (!fixture.factor) throw Object.assign(Error("Verification required"), { status: 403 });
    }`,
  "@/lib/server/private-docs": `
    export async function loadPrivateDoc(ref) {
      globalThis.${key}.storageReads.push(ref);
      return "synthetic resume";
    }
    export const privateDocResponse = body => new Response(body);`,
};
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (Object.hasOwn(mocks, specifier)) return { url: scheme + specifier, shortCircuit: true };
    if (specifier.startsWith("@/")) {
      return next(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(scheme))
      return { format: "module", source: mocks[url.slice(scheme.length)], shortCircuit: true };
    return next(url, context);
  },
});
const {
  getStaffJobPeople,
  getStaffApplicant,
  inviteStaffToJob,
  applyToStaffJob,
  answerStaffJobInvite,
} = await import("../src/lib/server/staff-jobs.ts");
const resume = (await import("../src/routes/api/staff-resume.ts")).Route.server.handlers.GET;

const person = {
  user_id: "staff-a",
  ref: "sp_fixture_a",
  first_name: "Maya",
  last_name: "Testperson",
  province: "MB",
  city: "Winnipeg",
  cert_level: "mb_ece2",
  cert_expires_on: "2030-01-01",
  first_aid_expires_on: "2030-01-01",
  postal_code: "R3C 4T3",
  lat: 49.9,
  lng: -97.1,
  radius_km: 10,
  years_experience: 4,
  care_groups: "toddler",
  days: "mon,tue",
  shifts: "morning",
  work_types: "full_time",
  start_date: "2030-01-02",
  languages: "en,fr",
  highlights: "Private fixture note",
  phone: "204-555-0101",
  email: "staff@example.invalid",
  resume_ref: "staff-resumes/private-fixture.pdf",
  resume_mime: "application/pdf",
  resume_name: "fixture.pdf",
  visibility: "open",
  hide_from_employer: 1,
};
const applicant = {
  id: "app-a",
  job_id: "job-a",
  daycare_id: "centre-a",
  user_id: person.user_id,
  stage: "interview",
};
const job = (id, daycare_id, status) => ({
  id,
  daycare_id,
  status,
  role: "Toddler role",
  name: "Synthetic centre",
  slug: daycare_id,
  province: "MB",
  d_province: "MB",
  city: "Winnipeg",
  cert_needed: "mb_ece2",
  days: "mon",
  shifts: "morning",
});
const fixture = () => globalThis[key];
beforeEach(() => {
  const state = {
    userId: "owner-a",
    enabled: true,
    factor: true,
    factorCalls: [],
    storageReads: [],
    queries: [],
    roles: {
      "owner-a": { "centre-a": "owner" },
      "manager-b": { "centre-b": "manager" },
      "viewer-b": { "centre-b": "staff" },
    },
    apps: [applicant],
    invites: [
      {
        id: "invite-b",
        job_id: "job-b",
        daycare_id: "centre-b",
        staff_user_id: person.user_id,
        status: "sent",
      },
    ],
    memberships: [],
    jobs: [job("job-a", "centre-a", "open"), job("job-b", "centre-b", "open")],
  };
  const query = async (source, values = []) => {
    const sql = source.replace(/\s+/g, " ").trim().toLowerCase();
    state.queries.push(sql);
    const [first, second] = values;
    if (sql.startsWith("select j.id") && sql.includes("where j.id"))
      return state.jobs.filter((row) => row.id === first);
    if (sql.startsWith("select a.id as application_id"))
      return state.apps
        .filter((row) => row.job_id === first)
        .map((row) => ({ ...person, application_id: row.id, stage: row.stage }));
    if (sql.startsWith("select stage from job_applications"))
      return state.apps.filter((row) => row.user_id === first && row.daycare_id === second);
    if (sql.startsWith("select id, job_id, daycare_id, user_id, stage"))
      return state.apps.filter((row) => row.id === first);
    if (sql.includes("p.visibility = 'open'")) return [person];
    if (sql.includes("where p.user_id =")) return first === person.user_id ? [person] : [];
    if (sql.startsWith("select id, daycare_id from centre_job_posts"))
      return state.jobs.filter((row) => row.id === first && row.status === "open");
    if (sql.startsWith("insert into job_applications")) {
      const [id, job_id, daycare_id, user_id] = values;
      state.apps.push({ id, job_id, daycare_id, user_id, stage: "applied" });
      return [];
    }
    if (sql.startsWith("select id, job_id from staff_job_invites")) {
      return state.invites.filter(
        (x) => x.id === first && x.staff_user_id === second && x.status === "sent",
      );
    }
    if (sql.startsWith("update staff_job_invites")) {
      state.invites.find((x) => x.id === second).status = first;
      return [];
    }
    if (sql.startsWith("select user_id, resume_ref")) {
      if (first === "sp_fixture_no_file") return [{ ...person, resume_ref: null }];
      return first === person.ref ? [person] : [];
    }
    if (sql.includes("count(*)") && sql.includes("from staff_job_invites")) {
      return [
        {
          n: state.invites.filter(
            (x) => x.staff_user_id === first && x.daycare_id === second && x.status === "accepted",
          ).length,
        },
      ];
    }
    if (sql.startsWith("select staff_user_id from staff_job_invites"))
      return state.invites.filter((x) => x.job_id === first);
    if (sql.includes("count(*)") && sql.includes("from centre_members"))
      return [{ n: Number(first === person.user_id && state.memberships.includes(second)) }];
    if (sql.startsWith("select user_id from centre_members"))
      return state.memberships.includes(first) ? [{ user_id: person.user_id }] : [];
    if (sql.includes("from staff_vetting_checks") || sql.includes("from background_check_records"))
      return [];
    assert.fail(`Unexpected SQL in staff-job fixture: ${sql}`);
  };
  state.sql = Object.assign((parts, ...values) => query(parts.join("?"), values), { query });
  globalThis[key] = state;
});
after(() => {
  hooks.deregister();
  delete globalThis[key];
});
const people = (jobId) => getStaffJobPeople({ data: { jobId } });
const details = () => getStaffApplicant({ data: { applicationId: applicant.id } });
const openResume = (ref = person.ref) =>
  resume({ request: new Request(`http://localhost/api/staff-resume?ref=${ref}`) });

test("the exact same staff profile is full for its applicant's centre and minimized for another centre", async () => {
  const {
    applicants: [card],
  } = await people("job-a");
  assert.equal(card.profile.email, person.email);
  assert.equal(card.profile.hasResume, true);
  assert.equal((await details()).profile.lastName, person.last_name);
  fixture().userId = "manager-b";
  const { applicants, suggested } = await people("job-b");
  assert.deepEqual(applicants, []);
  assert.equal(suggested.length, 1);
  assert.deepEqual(suggested[0], {
    profile: {
      view: "limited",
      ref: person.ref,
      firstName: "Maya",
      certLevel: "mb_ece2",
      area: "Winnipeg, MB",
      availability: { days: ["mon", "tue"], shifts: ["morning"], workTypes: ["full_time"] },
    },
    invited: true,
  });
  await assert.rejects(details(), /not on this account/);
  fixture().userId = "viewer-b";
  await assert.rejects(people("job-b"), /not on this account/);
});

test("closed jobs keep their applicants, do not discover other staff, and reject new invites", async () => {
  fixture().jobs[0].status = "closed";
  const data = await people("job-a");
  assert.equal(data.applicants[0].profile.view, "full");
  assert.deepEqual(data.suggested, []);
  assert.ok(!fixture().queries.some((sql) => sql.includes("p.visibility = 'open'")));
  await assert.rejects(inviteStaffToJob({ data: { jobId: "job-a", ref: person.ref } }), /closed/);
});

test("the real resume handler is scoped to self or a connected hiring centre with 2FA", async () => {
  fixture().userId = "manager-b";
  const unrelated = await openResume();
  const noFile = await openResume("sp_fixture_no_file");
  assert.equal(unrelated.status, 404);
  assert.equal(noFile.status, 404);
  assert.deepEqual(await unrelated.json(), await noFile.json());
  assert.deepEqual(fixture().storageReads, []);
  assert.deepEqual(fixture().factorCalls, []);

  fixture().memberships.push("centre-b");
  fixture().factor = false;
  assert.equal((await openResume()).status, 403);
  assert.deepEqual(fixture().storageReads, []);
  fixture().factor = true;
  assert.equal(await (await openResume()).text(), "synthetic resume");
  assert.deepEqual(fixture().factorCalls, [
    ["manager-b", "provider"],
    ["manager-b", "provider"],
  ]);

  fixture().memberships = [];
  fixture().userId = "owner-a";
  assert.equal((await openResume()).status, 200);

  fixture().userId = person.user_id;
  const priorFactorCalls = fixture().factorCalls.length;
  assert.equal((await openResume()).status, 200);
  assert.equal(fixture().factorCalls.length, priorFactorCalls);

  fixture().enabled = false;
  const priorQueries = fixture().queries.length;
  assert.equal((await openResume()).status, 404);
  assert.equal(fixture().queries.length, priorQueries);
});

test("Apply grants only the receiving hiring centre access to the complete profile and resume", async () => {
  fixture().apps = [];
  fixture().userId = person.user_id;
  assert.equal((await applyToStaffJob({ data: { jobId: "job-b" } })).ok, true);
  fixture().userId = "manager-b";
  assert.equal((await people("job-b")).applicants[0].profile.postalCode, person.postal_code);
  assert.equal((await openResume()).status, 200);
  fixture().userId = "owner-a";
  assert.equal((await openResume()).status, 404);
});

test("accepting an invite grants access to its hiring centre, not a different centre or a staff role", async () => {
  fixture().apps = [];
  fixture().userId = "other-staff";
  await assert.rejects(
    answerStaffJobInvite({ data: { inviteId: "invite-b", accept: true } }),
    /not here/,
  );
  fixture().userId = person.user_id;
  assert.equal(
    (await answerStaffJobInvite({ data: { inviteId: "invite-b", accept: true } })).ok,
    true,
  );
  assert.equal(fixture().invites[0].status, "accepted");
  fixture().userId = "manager-b";
  assert.equal((await people("job-b")).applicants[0].profile.postalCode, person.postal_code);
  assert.equal((await openResume()).status, 200);
  fixture().userId = "viewer-b";
  assert.equal((await openResume()).status, 404);
  fixture().userId = "owner-a";
  assert.equal((await openResume()).status, 404);
});

test("a declined invite by itself never shares the full profile", async () => {
  fixture().apps = [];
  fixture().userId = person.user_id;
  assert.equal(
    (await answerStaffJobInvite({ data: { inviteId: "invite-b", accept: false } })).ok,
    true,
  );
  assert.equal(fixture().invites[0].status, "declined");
  fixture().userId = "manager-b";
  assert.equal((await people("job-b")).suggested[0].profile.view, "limited");
  assert.equal((await openResume()).status, 404);
});
