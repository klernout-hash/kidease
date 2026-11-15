import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { sendTransactionalMail, testListingRecipientsAllowed } from "../src/lib/transactional-mail.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

const qaInvite = {
  purpose: "invite",
  to: "klernout-qw5e42@mail.grokbot.com",
  subject: "You're invited to KidEase Test Daycare (QA) on KidEase",
  text: "Join KidEase Test Daycare (QA).",
  html: "<p>Join KidEase Test Daycare (QA).</p>",
};

test("a QA listing is suppressed unless every recipient is allowlisted", () => {
  assert.equal(testListingRecipientsAllowed("a@b.ca", ""), false);
  assert.equal(testListingRecipientsAllowed("a@b.ca", "other@b.ca"), false);
  assert.equal(testListingRecipientsAllowed("A@B.ca", "a@b.ca"), true);
  assert.equal(testListingRecipientsAllowed("a@b.ca, c@d.ca", "a@b.ca"), false);
  assert.equal(testListingRecipientsAllowed("a@b.ca, c@d.ca", "a@b.ca,c@d.ca"), true);
  assert.equal(testListingRecipientsAllowed("a@b.ca", "*"), true);
});

test("KidEase Test Daycare (QA) does not send and does not say not_configured", async () => {
  let called = 0;
  const logs = [];
  const result = await sendTransactionalMail(qaInvite, {
    env: { RESEND_API_KEY: "k", QA_SEND_ALLOWLIST: "kyle@kidease.ca" },
    log: (line) => logs.push(line),
    fetch: async () => {
      called += 1;
      return new Response("{}", { status: 200 });
    },
  });
  assert.equal(called, 0);
  assert.equal(result.status, "logged");
  assert.equal(result.reason, "test_listing_suppressed");
  assert.match(logs.join("\n"), /reason=test_listing_suppressed/);
  assert.doesNotMatch(logs.join("\n"), /reason=not_configured/);
});

test("an allowlisted QA invite is sent once and logged as qa_allowlist_sent", async () => {
  let called = 0;
  const logs = [];
  const result = await sendTransactionalMail(qaInvite, {
    env: {
      RESEND_API_KEY: "k",
      QA_SEND_ALLOWLIST: "kyle@kidease.ca, klernout-qw5e42@mail.grokbot.com",
    },
    log: (line) => logs.push(line),
    fetch: async () => {
      called += 1;
      return new Response("{}", { status: 200 });
    },
  });
  assert.equal(called, 1);
  assert.equal(result.status, "sent");
  assert.equal(result.reason, "qa_allowlist_sent");
  assert.match(logs.join("\n"), /reason=qa_allowlist_sent/);
});

test("a deliberate QA suppression is not tried a second time", () => {
  const members = src("src/lib/server/centre-members.ts");
  assert.match(members, /firstSend\.suppressed/);
  assert.doesNotMatch(members, /if \(!mailed\) mailed = \(await trySendEmployeeInviteEmail/);
  assert.match(src("src/lib/server/invite-mail.ts"), /test_listing_suppressed/);
});

test("each invite role shows what that person can open", () => {
  const page = src("src/components/centre-employees.tsx");
  assert.match(page, /employeeRoleStaffAccess/);
  assert.match(page, /employeeRoleManagerAccess/);
  assert.match(page, /employeeRoleReadOnlyAccess/);
  const copy = src("src/lib/copy-en.ts") + src("src/lib/copy-fr.ts");
  assert.match(copy, /employeeRoleStaffAccess: "Can update leads, messages, and open spots/);
  assert.match(copy, /employeeRoleReadOnlyAccess: "Peut voir ce centre/);
});
