import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { staffJobBoardEnabled } from "../src/lib/features.ts";
import { FEATURE_FLAG_CATALOG, FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { productFlagRows } from "../src/lib/admin-feature-registry.ts";
import {
  APPLICATION_STAGES,
  CERT_LEVELS,
  JOB_MATCH_FIELDS,
  PROVINCE_CODES,
  STAFF_MATCH_FIELDS,
  canSetStage,
  expiryState,
  jobStepErrors,
  mayReadStaffResume,
  profileFlags,
  profileStepErrors,
  providerProfileView,
  scoreMatch,
  toJobMatchInput,
  toStaffMatchInput,
  vettingChecklist,
  visibleToCentre,
} from "../src/lib/staff-jobs.ts";
import { STAFF_JOBS_COPY, explainMatch, reasonWords, sj } from "../src/lib/staff-jobs-copy.ts";
import { FOOTER_COLUMNS, guestDrawerMenuGroupsForShell, footerMenuGroupsForShell, withStaffJobLinks } from "../src/lib/site-footer-nav.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const TODAY = "2026-11-22";

const NO_ACCESS = { applied: false, acceptedInvite: false, hired: false };

function profile(extra = {}) {
  return {
    ref: "sp_test",
    firstName: "Maya",
    lastName: "Tremblay",
    email: "maya@example.com",
    phone: "204-555-0101",
    province: "MB",
    city: "Winnipeg",
    postalCode: "R3C 4T3",
    radiusKm: 15,
    certLevel: "mb_ece2",
    certExpiresOn: "2027-06-30",
    firstAidExpiresOn: "2027-03-01",
    yearsExperience: 4,
    careGroups: ["toddler"],
    days: ["mon", "tue", "wed", "thu", "fri"],
    shifts: ["morning", "full_day"],
    workTypes: ["full_time"],
    startDate: "2026-12-01",
    languages: ["en", "fr"],
    highlights: "Calm with toddlers.",
    hasResume: true,
    visibility: "open",
    hideFromEmployer: true,
    ...extra,
  };
}

const JOB = toJobMatchInput({
  province: "MB",
  certNeeded: "mb_ece2",
  careGroups: ["toddler"],
  days: ["mon", "tue", "wed", "thu", "fri"],
  shifts: ["morning"],
  workType: "full_time",
  startDate: "2027-01-05",
});

function staffInput(extra = {}) {
  return toStaffMatchInput({ ...profile(extra), distanceKm: 4.2 });
}

test("staff job board flag defaults off and is wired like other flags", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_STAFF_JOB_BOARD, false);
  assert.equal(staffJobBoardEnabled({}), false);
  assert.equal(staffJobBoardEnabled({ FEATURE_STAFF_JOB_BOARD: "1" }), true);
  assert.equal(staffJobBoardEnabled({ FEATURE_STAFF_JOB_BOARD: "0" }), false);
  assert.equal(FEATURE_FLAG_CATALOG.find((row) => row.key === "FEATURE_STAFF_JOB_BOARD")?.defaultOn, false);
  assert.equal(productFlagRows().find((row) => row.key === "FEATURE_STAFF_JOB_BOARD")?.category, "daycare");
  assert.match(read(".env.example"), /^FEATURE_STAFF_JOB_BOARD=0$/m);
  assert.match(read("docs/flags.md"), /`FEATURE_STAFF_JOB_BOARD` is off/);
});

test("providers see only a limited profile until the person applies, accepts an invite, or is hired", () => {
  const limited = providerProfileView(profile(), NO_ACCESS, TODAY);
  assert.equal(limited.view, "limited");
  assert.deepEqual(Object.keys(limited).sort(), ["area", "availability", "certLevel", "firstName", "ref", "view"]);
  assert.equal(limited.firstName, "Maya");
  assert.equal(limited.area, "Winnipeg, MB");
  assert.equal(limited.certLevel, "mb_ece2");
  const unverified = providerProfileView(profile({ city: "123 Example Street", firstName: "maya@example.com" }), NO_ACCESS, TODAY);
  assert.equal(unverified.area, "MB");
  assert.equal(unverified.firstName, "");
  assert.deepEqual(Object.keys(limited.availability).sort(), ["days", "shifts", "workTypes"]);
  assert.equal(providerProfileView(profile({ certLevel: "unpublished" }), NO_ACCESS, TODAY).certLevel, "");
  const text = JSON.stringify(limited);
  for (const secret of ["Tremblay", "maya@example.com", "204-555-0101", "R3C", "resume", "fr\"", "yearsExperience", "Calm with toddlers", "2026-12-01", "flags"]) {
    assert.equal(text.includes(secret), false, `limited profile leaks ${secret}`);
  }
  for (const access of [
    { ...NO_ACCESS, applied: true },
    { ...NO_ACCESS, acceptedInvite: true },
    { ...NO_ACCESS, hired: true },
  ]) {
    const full = providerProfileView(profile(), access, TODAY);
    assert.equal(full.view, "full");
    assert.equal(full.lastName, "Tremblay");
    assert.equal(full.email, "maya@example.com");
    assert.equal(full.postalCode, "R3C 4T3");
    assert.equal(full.hasResume, true);
    assert.equal(full.availability.startDate, "2026-12-01");
    assert.equal(full.highlights, "Calm with toddlers.");
  }
});

test("resume access stays scoped to a connected hiring centre", () => {
  const unrelated = NO_ACCESS;
  const applicant = { ...NO_ACCESS, applied: true };
  const accepted = { ...NO_ACCESS, acceptedInvite: true };
  const activeMember = { ...NO_ACCESS, hired: true };
  assert.equal(mayReadStaffResume(true, []), true);
  assert.equal(mayReadStaffResume(false, []), false);
  assert.equal(mayReadStaffResume(false, [unrelated]), false);
  for (const access of [applicant, accepted, activeMember]) {
    assert.equal(mayReadStaffResume(false, [unrelated, access]), true);
  }
  const server = read("src/lib/server/staff-jobs.ts");
  const gate = server.slice(server.indexOf("export async function authorizeStaffResume"), server.indexOf("export async function saveStaffResume"));
  assert.match(gate, /hiringCentreIds\(sql, input.userId\)/);
  assert.match(gate, /centreAccess\(sql, row.user_id, id\)/);
  assert.match(gate, /mayReadStaffResume\(false, \[access\]\)/);
  assert.match(gate, /throw new Error\("File not found"\);\s*}$/m);
  assert.doesNotMatch(gate, /"Not authorized"/);
  const api = read("src/routes/api/staff-resume.ts");
  assert.ok(api.indexOf("await authorizeStaffResume") < api.indexOf("await assertSensitiveFileAccess"));
  assert.ok(api.indexOf("await assertSensitiveFileAccess") < api.indexOf("await loadPrivateDoc"));
});

test("closed jobs retain applicants but skip discovery and invites", () => {
  const server = read("src/lib/server/staff-jobs.ts");
  const people = server.slice(server.indexOf("export const getStaffJobPeople"), server.indexOf("export const inviteStaffToJob"));
  assert.ok(people.indexOf("applicants.push") < people.indexOf("if (!toJob(job).open)"));
  assert.ok(people.indexOf("if (!toJob(job).open)") < people.indexOf("const [pool, invited, employees]"));
  const shortCards = people.slice(people.indexOf("const suggested: SuggestedCard[]"));
  assert.doesNotMatch(shortCards, /matchFor|profileFlags|scoreMatch/);
  const invite = server.slice(server.indexOf("export const inviteStaffToJob"), server.indexOf("insert into staff_job_invites"));
  assert.match(invite, /if \(!toJob\(job\).open\)/);
});

test("staff choose who can find them, and can hide from their current employer", () => {
  const base = { visibility: "open", hideFromEmployer: true, isCurrentEmployer: false, access: NO_ACCESS };
  assert.equal(visibleToCentre(base), true);
  assert.equal(visibleToCentre({ ...base, isCurrentEmployer: true }), false);
  assert.equal(visibleToCentre({ ...base, isCurrentEmployer: true, hideFromEmployer: false }), true);
  assert.equal(visibleToCentre({ ...base, visibility: "paused" }), false);
  assert.equal(visibleToCentre({ ...base, visibility: "applied_only" }), false);
  // Applying is the person's own choice, so it always shows them to that centre.
  assert.equal(visibleToCentre({ ...base, visibility: "paused", isCurrentEmployer: true, access: { ...NO_ACCESS, applied: true } }), true);
});

test("the score explains itself in plain words, in English and French", () => {
  const result = scoreMatch(staffInput(), JOB, TODAY);
  const en = explainMatch("en", result);
  const fr = explainMatch("fr", result);
  assert.match(en.good, /^ECE II · 4 km away · available weekdays · works with toddlers/);
  assert.match(fr.good, /^EPE II · 4 km · disponible en semaine · travaille avec les trottineurs/);
  assert.ok(result.score >= 90 && result.score <= 100, String(result.score));
  assert.deepEqual(scoreMatch(staffInput(), JOB, TODAY), result, "same input, same output");
  const weaker = scoreMatch(staffInput({ certLevel: "mb_cca", days: ["mon", "tue"] }), JOB, TODAY);
  assert.ok(weaker.score < result.score);
  assert.match(explainMatch("en", weaker).check, /Child Care Assistant \(job asks for ECE II\)/);
  assert.match(explainMatch("en", weaker).check, /available 2 of 5 days/);
  // A low score never hides anyone: there is no cut-off and no "reject" output.
  assert.equal("reject" in weaker, false);
});

test("the scorer never uses or infers a protected ground", () => {
  const protectedTerms = [
    "age", "birth", "born", "dob", "gender", "sex", "pregnant", "pregnancy", "marital", "married", "family",
    "spouse", "kids", "religion", "religious", "creed", "faith", "ethnic", "ethnicity", "race", "colour", "color",
    "ancestry", "origin", "national", "nationality", "citizenship", "disability", "disabled", "health", "handicap",
    "orientation", "identity", "expression", "pardon", "conviction", "political", "language", "languages",
    "name", "photo", "email", "phone", "postal", "address",
  ];
  const tokens = (field) => field.replace(/([A-Z])/g, " $1").toLowerCase().split(/[^a-z]+/).filter(Boolean);
  for (const field of [...STAFF_MATCH_FIELDS, ...JOB_MATCH_FIELDS]) {
    for (const token of tokens(field)) assert.equal(protectedTerms.includes(token), false, `${field} looks like a protected ground`);
  }
  // The input types themselves: read the declarations from the source.
  const source = read("src/lib/staff-jobs.ts");
  for (const typeName of ["StaffMatchInput", "JobMatchInput"]) {
    const start = source.indexOf(`export type ${typeName} = {`);
    assert.ok(start > 0, typeName);
    const body = source.slice(start, source.indexOf("};", start));
    const keys = [...body.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);
    assert.ok(keys.length >= 7, typeName);
    for (const key of keys) {
      for (const token of tokens(key)) assert.equal(protectedTerms.includes(token), false, `${typeName}.${key}`);
    }
    const listName = typeName === "StaffMatchInput" ? STAFF_MATCH_FIELDS : JOB_MATCH_FIELDS;
    assert.deepEqual([...keys].sort(), [...listName].sort(), `${typeName} keys match the allow-list`);
  }
  // Extra fields on the record are dropped before scoring and cannot move the score.
  const loaded = {
    ...profile(),
    distanceKm: 4.2,
    age: 61,
    birthDate: "1965-01-01",
    gender: "female",
    familyStatus: "single parent",
    religion: "x",
    ethnicity: "x",
    disability: "x",
    languages: ["fr"],
    firstName: "Someone else",
  };
  const picked = toStaffMatchInput(loaded);
  assert.deepEqual(Object.keys(picked).sort(), [...STAFF_MATCH_FIELDS].sort());
  assert.deepEqual(scoreMatch(loaded, JOB, TODAY), scoreMatch(staffInput(), JOB, TODAY));
  // Languages are shown on the full profile but are not scored.
  assert.deepEqual(scoreMatch(staffInput({ languages: [] }), JOB, TODAY), scoreMatch(staffInput({ languages: ["fr", "pa"] }), JOB, TODAY));
  assert.match(sj("en", "automatedBody"), /never uses age, gender, family, religion, background, health, language/);
  assert.match(sj("fr", "automatedBody"), /jamais l’âge, le genre, la famille, la religion, l’origine, la santé, la langue/);
});

test("expired papers are flagged only on an authorized full profile", () => {
  const expired = profile({ certExpiresOn: "2026-10-01", firstAidExpiresOn: "2026-01-01" });
  const result = scoreMatch(toStaffMatchInput({ ...expired, distanceKm: 4 }), JOB, TODAY);
  assert.deepEqual(result.flags.sort(), ["cert_expired", "first_aid_expired"]);
  assert.match(explainMatch("en", result).check, /ECE II expired/);
  assert.ok(result.score < scoreMatch(staffInput(), JOB, TODAY).score);
  const limited = providerProfileView(expired, NO_ACCESS, TODAY);
  const full = providerProfileView(expired, { ...NO_ACCESS, applied: true }, TODAY);
  assert.equal("flags" in limited, false);
  assert.deepEqual([...full.flags].sort(), ["cert_expired", "first_aid_expired"]);
  assert.deepEqual(profileFlags(profile(), TODAY), []);
  assert.equal(expiryState("2026-11-21", TODAY), "expired");
  assert.equal(expiryState("2026-12-15", TODAY), "soon");
  assert.equal(expiryState("", TODAY), "missing");
  assert.equal(sj("en", "flag_cert_expired"), "Certificate expired");
  assert.equal(sj("fr", "flag_cert_expired"), "Certificat expiré");
});

test("the provider decides every step and keeps their own checklist", () => {
  assert.equal(canSetStage({ to: "not_selected", actor: "system", fullAccess: true }), false);
  assert.equal(canSetStage({ to: "hired", actor: "system", fullAccess: true }), false);
  assert.equal(canSetStage({ to: "viewed", actor: "system", fullAccess: true }), true);
  assert.equal(canSetStage({ to: "hired", actor: "provider", fullAccess: false }), false);
  assert.equal(canSetStage({ to: "hired", actor: "provider", fullAccess: true }), true);
  assert.deepEqual([...APPLICATION_STAGES], ["applied", "viewed", "interview", "offer", "hired", "not_selected"]);
  const rows = vettingChecklist({
    certLevel: "mb_ece2",
    certExpiresOn: "2026-10-01",
    firstAidExpiresOn: null,
    backgroundCheck: null,
    saved: { references: { state: "checked", note: "Two calls" } },
    today: TODAY,
  });
  assert.deepEqual(rows.map((r) => [r.item, r.hint, r.state]), [
    ["certificate", "expired", "to_do"],
    ["first_aid", "missing", "to_do"],
    ["background_check", "records_off", "to_do"],
    ["references", "ask", "checked"],
  ]);
  const linked = vettingChecklist({ certLevel: "", certExpiresOn: null, firstAidExpiresOn: null, backgroundCheck: { found: true, expiresOn: "2028-01-01" }, saved: {}, today: TODAY });
  assert.equal(linked.find((r) => r.item === "background_check")?.hint, "record_found");
  const server = read("src/lib/server/staff-jobs.ts");
  assert.match(server, /background_check_records/);
  assert.match(server, /return null;/, "missing background-check table falls back");
});

test("forms check each step; a job post needs a pay range", () => {
  const job = { daycareId: "d1", title: "Toddler ECE", certNeeded: "", careGroups: [], days: ["mon"], shifts: [], workType: "full_time", startDate: "", payMin: "", payMax: "", about: "A warm team of eight." };
  assert.deepEqual(jobStepErrors("role", job), []);
  assert.deepEqual(jobStepErrors("schedule", job), ["pay"]);
  assert.deepEqual(jobStepErrors("schedule", { ...job, payMin: "28", payMax: "22" }), ["pay_order"]);
  assert.deepEqual(jobStepErrors("schedule", { ...job, payMin: "22", payMax: "28" }), []);
  assert.deepEqual(jobStepErrors("centre", { ...job, about: "hi" }), ["about"]);
  const draft = { firstName: "", lastName: "T", province: "MB", certLevel: "mb_ece2", certExpiresOn: "", firstAidExpiresOn: "", yearsExperience: "2", careGroups: [], days: [], shifts: [], workTypes: [], startDate: "", city: "", postalCode: "nope", radiusKm: 15, languages: [], highlights: "", phone: "", visibility: "open", hideFromEmployer: true };
  assert.deepEqual(profileStepErrors("name", draft), ["first_name"]);
  assert.deepEqual(profileStepErrors("papers", draft), ["cert_date"]);
  assert.deepEqual(profileStepErrors("work", draft), ["days", "work_type"]);
  assert.deepEqual(profileStepErrors("where", draft), ["city", "postal_code"]);
});

test("English and French have the same words, and every reason reads in both", () => {
  const en = Object.keys(STAFF_JOBS_COPY.en).sort();
  const fr = Object.keys(STAFF_JOBS_COPY.fr).sort();
  assert.deepEqual(fr, en);
  for (const key of en) {
    const a = STAFF_JOBS_COPY.en[key];
    const b = STAFF_JOBS_COPY.fr[key];
    assert.ok(a.trim() && b.trim(), key);
    assert.deepEqual((b.match(/\{\w+\}/g) || []).sort(), (a.match(/\{\w+\}/g) || []).sort(), `placeholders differ: ${key}`);
  }
  const same = en.filter((key) => STAFF_JOBS_COPY.en[key] === STAFF_JOBS_COPY.fr[key]);
  assert.deepEqual(same.sort(), ["km", "province"].sort(), "untranslated French strings");
  for (const code of PROVINCE_CODES) {
    for (const level of CERT_LEVELS[code]) assert.ok(level.en && level.fr, level.id);
  }
  const reasons = [
    { code: "cert_meets", level: "on_rece" },
    { code: "cert_other_province", level: "bc_ece5", province: "BC" },
    { code: "cert_below", level: "ab_l1", needed: "ab_l3" },
    { code: "cert_missing", needed: "qc_q" },
    { code: "cert_not_needed" },
    { code: "cert_expired", level: "sk_l2" },
    { code: "distance", km: 3 },
    { code: "distance_far", km: 40 },
    { code: "days_all", weekdays: false, days: ["sat", "sun"] },
    { code: "days_some", have: 2, need: 5 },
    { code: "days_none" },
    { code: "shifts", shifts: ["evening"] },
    { code: "shifts_none" },
    { code: "care_groups", groups: ["infant", "preschool"] },
    { code: "care_groups_none" },
    { code: "work_type", workType: "part_time" },
    { code: "work_type_other", workType: "casual" },
    { code: "experience", years: 1 },
    { code: "start_late", date: "2027-02-01" },
    { code: "first_aid_expired" },
    { code: "first_aid_missing" },
  ];
  for (const reason of reasons) {
    const a = reasonWords("en", reason);
    const b = reasonWords("fr", reason);
    assert.ok(a && b, reason.code);
    assert.notEqual(a, b, reason.code);
  }
  assert.equal(sj("en", "pay", { min: 22, max: 28 }), "$22 to $28 an hour");
  assert.equal(sj("fr", "pay", { min: 22, max: 28 }), "22 $ à 28 $ de l’heure");
});

test("flag off leaves /jobs, /jobs/post and the menus as they were", () => {
  const jobs = read("src/routes/jobs.tsx");
  const post = read("src/routes/jobs_.post.tsx");
  assert.match(jobs, /if \(board\.enabled\) return \{ enabled: false, jobs: \[\], staffBoard: true/);
  assert.match(jobs, /if \(staffBoard\) \{/);
  assert.match(jobs, /<EceJobBoard initialEnabled initialJobs=\{jobs\} \/>/);
  assert.match(jobs, /<JobsInterestForm variant="caregiver" \/>/);
  assert.match(post, /if \(staffBoard\) \{/);
  assert.match(post, /<JobsInterestForm variant="centre" \/>/);
  assert.match(post, /data-commerce=\{nativeShell \? "hidden" : "web"\}/);
  const server = read("src/lib/server/staff-jobs.ts");
  assert.match(server, /if \(!staffJobBoardEnabled\(\)\) return \{ enabled: false as const, jobs: \[\] as StaffJob\[\] \}/);
  // Every server function is behind the flag.
  const fns = [...server.matchAll(/export const (\w+) = createServerFn/g)].map((m) => m[1]);
  assert.ok(fns.length >= 12);
  for (const name of fns) {
    const start = server.indexOf(`export const ${name} =`);
    const next = server.indexOf("export ", start + 10);
    const body = server.slice(start, next < 0 ? undefined : next);
    assert.match(body, /staffJobBoardEnabled\(\)/, `${name} is not behind the flag`);
  }
  // Footer: off is identical; on swaps in footer-only links.
  const off = withStaffJobLinks({ daycares: FOOTER_COLUMNS.daycares, support: FOOTER_COLUMNS.support }, false);
  assert.deepEqual(off.daycares, FOOTER_COLUMNS.daycares);
  assert.deepEqual(off.support, FOOTER_COLUMNS.support);
  const on = withStaffJobLinks({ daycares: FOOTER_COLUMNS.daycares, support: FOOTER_COLUMNS.support }, true);
  assert.ok(on.daycares.some((link) => link.to === "/jobs/post" && link.labelEn === "Hire staff" && link.labelFr === "Embaucher du personnel"));
  assert.ok(on.support.some((link) => link.to === "/jobs"));
  // Header menu, drawer and app menu do not get the hiring link.
  for (const groups of [guestDrawerMenuGroupsForShell({ native: false, plansOn: false }), footerMenuGroupsForShell({ native: false, plansOn: false })]) {
    assert.equal(groups.some((g) => g.links.some((link) => link.to === "/jobs/post")), false);
  }
  assert.doesNotMatch(read("src/components/nav-drawer.tsx") + read("src/lib/app-menu.ts"), /withStaffJobLinks|staffJobsLink/);
  assert.match(read("src/components/site-footer.tsx"), /withStaffJobLinks\(/);
});

test("nothing is sent and nothing is charged; hiring reuses the staff invite", () => {
  const server = read("src/lib/server/staff-jobs.ts");
  assert.doesNotMatch(server, /stripe|checkout|sendEmail|sendSms|twilio|trySend|fetch\(/i);
  assert.match(server, /createCentreEmployeeInvite\(/);
  assert.match(server, /\{ send: false \}/);
  const members = read("src/lib/server/centre-members.ts");
  assert.match(members, /export async function createCentreEmployeeInvite/);
  assert.match(members, /if \(!options\.send\) \{/);
  assert.match(members, /createCentreEmployeeInvite\(context\.userId, data, \{ send: true \}\)/);
});

test("migrations 0220-0224 are additive and each has a down file", () => {
  for (const name of ["0220_staff_profiles", "0221_staff_job_posts", "0222_job_application_stages", "0223_staff_vetting", "0224_staff_match_reviews"]) {
    const up = read(`migrations/${name}.sql`);
    assert.ok(existsSync(join(root, `migrations/down/${name}.sql`)), name);
    assert.doesNotMatch(up.replace(/^--.*$/gm, ""), /\bdrop\b|\btruncate\b|\bdelete\b|alter column/i, name);
  }
  assert.match(read("migrations/0222_job_application_stages.sql"), /'applied', 'viewed', 'interview', 'offer', 'hired', 'not_selected'/);
  assert.match(read("src/lib/private-docs.ts"), /R2_STAFF_RESUME_PREFIX = "staff-resumes"/);
  const api = read("src/routes/api/staff-resume.ts");
  assert.match(api, /authorizeStaffResume/);
  assert.match(api, /assertSensitiveFileAccess/);
  assert.match(read("src/routeTree.gen.ts"), /id: '\/api\/staff-resume'/);
});

test("the bilingual sharing notice precedes Apply and Accept and describes each button", () => {
  const view = read("src/components/staff-job-board.tsx");
  for (const [start, end, copy, action] of [
    ["MatchCard", "InviteCard", "applyPrivacy", "applyToStaffJob"],
    ["InviteCard", "ApplicationsList", "invitePrivacy", "answer(true)"],
  ]) {
    const block = view.slice(view.indexOf(`function ${start}`), view.indexOf(`function ${end}`));
    const notice = `sj(l, "${copy}")`;
    assert.ok(block.indexOf(notice) >= 0);
    assert.ok(block.indexOf(notice) < block.indexOf('aria-describedby={privacyNotice}'));
    assert.ok(block.indexOf('aria-describedby={privacyNotice}') < block.indexOf(action));
  }
  for (const [locale, details, share, hired, highlights] of [
    ["en", /full name.*contact details.*postal code.*resume/, /authorized hiring staff at this daycare/i, /accepted an invite.*were hired.*already work/, /highlights/i],
    ["fr", /nom complet.*coordonnées.*code postal.*CV/, /recrutement autorisés de cette garderie/i, /accepté une invitation.*été embauché.*travaillez déjà/, /points forts/i],
  ]) {
    for (const label of ["applyPrivacy", "invitePrivacy"]) {
      assert.match(sj(locale, label), details);
      assert.match(sj(locale, label), share);
    }
    for (const label of ["postalHint", "resumeHint"]) assert.match(sj(locale, label), hired);
    assert.doesNotMatch(sj(locale, "privacyLead"), highlights);
  }
});
