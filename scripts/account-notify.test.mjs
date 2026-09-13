import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  accountNotifyText,
  accountNotifyTitle,
  accountRoleLabel,
  accountSmsBody,
  activityAccountHeadline,
  activityEmailFailed,
  activityEmailStatusLabel,
  activityPeopleHref,
  activityPeopleSearch,
  activityRoleBadge,
  activitySignupMeta,
  activityWhoLine,
  adminAccountDeepLink,
  adminDeskHref,
  adminPeoplePath,
  adminPersonEligible,
  ellipsisEmail,
  formatPlace,
  parseAdminActivityKind,
  resolveAdminTab,
  serializeAccountEventDetail,
  parseAccountEventDetail,
  summarizeAuthMethods,
} from "../src/lib/account-notify.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("SMS for a new daycare includes name, email, place, and role — not a title-only ping", () => {
  const at = new Date("2026-09-13T18:04:00Z");
  const body = accountSmsBody(
    {
      role: "provider",
      name: "Jane Doe",
      email: "jane@example.com",
      city: "Winnipeg",
      province: "MB",
    },
    at,
  );
  assert.match(body, /^KidEase new daycare:/);
  assert.match(body, /Jane Doe/);
  assert.match(body, /jane@…/);
  assert.match(body, /Winnipeg MB/);
  assert.doesNotMatch(body, /New daycare provider account/);
  assert.ok(body.length <= 160);
});

test("SMS for a new parent includes name, email, and role", () => {
  const body = accountSmsBody({
    role: "parent",
    name: "Sam Parent",
    email: "sam@family.ca",
  });
  assert.match(body, /^KidEase new parent:/);
  assert.match(body, /Sam Parent/);
  assert.match(body, /sam@…/);
  assert.doesNotMatch(body, /New parent account/);
});

test("SMS stays useful when name is missing", () => {
  const body = accountSmsBody({
    role: "provider",
    name: null,
    email: "centre@example.com",
  });
  assert.match(body, /—/);
  assert.match(body, /centre@…/);
  assert.match(body, /new daycare/);
});

test("email body includes role, name, email, phone, place, auth, and Admin deep link", () => {
  const text = accountNotifyText(
    {
      role: "provider",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "204-555-0100",
      city: "Winnipeg",
      province: "MB",
      authMethod: "Google",
    },
    "Saturday, September 12, 2026 at 1:04 p.m.",
    "https://kidease.ca/admin?tab=people&role=provider",
  );
  assert.match(text, /New daycare provider account/);
  assert.match(text, /Role: Daycare provider/);
  assert.match(text, /Name: Jane Doe/);
  assert.match(text, /Email: jane@example.com/);
  assert.match(text, /Phone: 204-555-0100/);
  assert.match(text, /City \/ province: Winnipeg MB/);
  assert.match(text, /Signed in with: Google/);
  assert.match(text, /Winnipeg/);
  assert.match(text, /Open Admin: https:\/\/kidease\.ca\/admin\?tab=people&role=provider/);
});

test("parent email names the Parent role and people deep link", () => {
  const text = accountNotifyText(
    {
      role: "parent",
      name: "Sam Parent",
      email: "sam@family.ca",
      authMethod: "email/password",
    },
    "Saturday, September 12, 2026 at 1:04 p.m.",
    "https://kidease.ca/admin?tab=people&role=parent",
  );
  assert.match(text, /New parent account/);
  assert.match(text, /Role: Parent/);
  assert.match(text, /Name: Sam Parent/);
  assert.match(text, /Email: sam@family.ca/);
  assert.match(text, /Signed in with: email\/password/);
  assert.match(text, /tab=people&role=parent/);
});

test("auth method labels never leak tokens and map known providers", () => {
  assert.equal(summarizeAuthMethods(["credential"]), "email/password");
  assert.equal(summarizeAuthMethods(["google", "grok-google"]), "Google");
  assert.equal(summarizeAuthMethods(["apple", "facebook"]), "Apple, Facebook");
  assert.equal(summarizeAuthMethods(["credential", "google"]), "email/password, Google");
  assert.equal(summarizeAuthMethods([null, "", "unknown-secret"]), "");
});

test("activity never shows a blank New account who line", () => {
  assert.equal(
    activityAccountHeadline({
      kind: "account",
      daycare_name: null,
      provider_name: "Sam Parent",
      provider_email: "sam@family.ca",
    }),
    "Sam Parent · sam@family.ca",
  );
  assert.equal(
    activityAccountHeadline({
      kind: "signup",
      daycare_name: null,
      provider_name: null,
      provider_email: "jane@example.com",
    }),
    "— · jane@example.com",
  );
  assert.equal(
    activityAccountHeadline({
      kind: "signup",
      daycare_name: null,
      provider_name: null,
      provider_email: null,
    }),
    "—",
  );
  assert.notEqual(
    activityAccountHeadline({
      kind: "account",
      daycare_name: null,
      provider_name: null,
      provider_email: null,
    }),
    "New account",
  );
  assert.equal(activityWhoLine({ provider_name: "", provider_email: "" }), "—");
  assert.equal(activityRoleBadge("account"), "Parent");
  assert.equal(activityRoleBadge("signup"), "Daycare provider");
});

test("deep links land Admin on People or filtered Activity", () => {
  assert.equal(adminPeoplePath("provider"), "/admin?tab=people&role=provider");
  assert.equal(adminPeoplePath("parent"), "/admin?tab=people&role=parent");
  assert.equal(adminAccountDeepLink("https://kidease.ca", "provider"), "https://kidease.ca/admin?tab=people&role=provider");
  assert.equal(adminDeskHref({ tab: "people", role: "provider" }), "/admin?tab=people&role=provider");
  assert.equal(parseAdminActivityKind("parents"), "account");
  assert.equal(parseAdminActivityKind("daycare providers"), "signup");
  assert.equal(parseAdminActivityKind("providers"), "signup");
  assert.equal(parseAdminActivityKind("claims"), "claim");
  assert.equal(resolveAdminTab({ role: "provider" }), "people");
  assert.equal(resolveAdminTab({ kind: "signup" }), "activity");
  assert.equal(resolveAdminTab({}), "queue");
});

test("event detail JSON stores phone and auth without secrets", () => {
  const raw = serializeAccountEventDetail({
    role: "provider",
    phone: "204-555-0100",
    authMethod: "Google",
  });
  assert.deepEqual(parseAccountEventDetail(raw), {
    role: "provider",
    phone: "204-555-0100",
    authMethod: "Google",
  });
  assert.equal(parseAccountEventDetail("not-json").role, undefined);
  assert.equal(ellipsisEmail("jane@example.com"), "jane@…");
  assert.equal(formatPlace("Winnipeg", "MB"), "Winnipeg MB");
  assert.equal(accountRoleLabel("provider"), "Daycare provider");
  assert.equal(accountNotifyTitle("parent"), "New parent account");
});

test("failed Admin email still yields a visible Activity row and People eligibility", () => {
  const joan = {
    kind: "signup",
    daycare_name: "",
    provider_name: "Joan Mbabazi",
    provider_email: "kidsworlddaycare2025@gmail.com",
    city: "",
    province: "",
    email_status: "failed",
    created_at: "2026-09-13T14:33:00.000Z",
  };
  assert.equal(activityEmailFailed("failed"), true);
  assert.equal(activityEmailFailed("sent"), false);
  assert.equal(activityEmailStatusLabel("failed"), "Email failed");
  assert.equal(activityAccountHeadline(joan), "Joan Mbabazi · kidsworlddaycare2025@gmail.com");
  const meta = activitySignupMeta(joan);
  assert.equal(meta.who, "Joan Mbabazi · kidsworlddaycare2025@gmail.com");
  assert.equal(meta.role, "Daycare provider");
  assert.equal(meta.emailFailed, true);
  assert.equal(meta.city, "—");
  assert.match(meta.time, /2026/);
  assert.equal(activityPeopleHref(joan), "/admin?tab=people&role=provider&q=kidsworlddaycare2025%40gmail.com");
  assert.deepEqual(activityPeopleSearch(joan), {
    tab: "people",
    role: "provider",
    q: "kidsworlddaycare2025@gmail.com",
  });
  assert.equal(
    adminPersonEligible({
      role: "provider",
      name: "Joan Mbabazi",
      email: "kidsworlddaycare2025@gmail.com",
      phone: null,
      city: null,
    }),
    true,
  );
  assert.equal(adminPersonEligible({ role: "parent", name: null, email: "sam@family.ca" }), true);
  assert.equal(adminPersonEligible({ role: "admin", name: "Kyle", email: "kyle@kidease.ca" }), false);
  const listing = {
    kind: "listing",
    daycare_name: "",
    provider_name: "Joan Mbabazi",
    provider_email: "kidsworlddaycare2025@gmail.com",
    email_status: "failed",
  };
  assert.match(activityAccountHeadline(listing), /Joan Mbabazi/);
  assert.equal(activityRoleBadge("listing"), "Daycare provider");
});

test("signup hook and notify persist filled actor fields", () => {
  const family = src("src/lib/server/family.ts");
  const notify = src("src/lib/server/notify.ts");
  assert.match(family, /notifyNewAccountFromUser/);
  assert.match(family, /afterNewAccountUserMail/);
  assert.doesNotMatch(family, /notifyProviderJoined\(\{\s*kind: "signup"/);
  assert.match(notify, /notifyNewAccountFromUser/);
  assert.match(notify, /summarizeAuthMethods/);
  assert.match(notify, /accountSmsBody/);
  assert.match(notify, /provider_name, provider_email, listing_url, email_to, email_status, email_error, detail/);
  assert.match(notify, /select "providerId" from "account"/);
  assert.match(src("src/lib/server/admin-people.ts"), /adminPersonEligible/);
  assert.match(src("src/lib/server/admin-people.ts"), /p.role in \('parent', 'provider'\)/);
});
