import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  calendarCentreId,
  claimAccountSearch,
  parentEnrolLogin,
  guestSaveHref,
  saveLoginTo,
  saveReturnPath,
  topRatedPage,
} from "../src/lib/qa-fixes.ts";
import { planRecipientOnly } from "../src/lib/recipient-only-notify.ts";

const base = {
  channel: "email",
  recipient: "qa.parent@example.com",
  allowlist: ["qa.parent@example.com"],
  createdAtMs: 200,
  notBeforeMs: 100,
  dedupeKey: "thread-1:email",
  seenKeys: [],
  role: "parent",
  locale: "fr",
};

test("save keeps the French search, including the query", () => {
  assert.equal(
    saveReturnPath("/fr/search", "?where=Montreal&ages=toddler", "/fr/search"),
    "/fr/search?where=Montreal&ages=toddler",
  );
  assert.equal(saveReturnPath("/fr/daycare/maple", "", "/fr/daycare/maple"), "/fr/daycare/maple");
  assert.equal(saveLoginTo("fr"), "/fr/login");
  assert.equal(saveLoginTo("en"), "/login");
  const href = guestSaveHref("/search", "?q=Winnipeg%2C%20MB", "en");
  assert.match(href, /^\/login\?/);
  assert.match(href, /why=save/);
  assert.match(href, /next=/);
  assert.doesNotMatch(href, /password/);
});

test("parent enrol opens a parent account, not the contact form", () => {
  const fr = parentEnrolLogin("fr");
  assert.equal(fr.to, "/fr/login");
  assert.equal(fr.search.intent, "up");
  assert.equal(fr.search.role, "parent");
  assert.equal(fr.search.next, "/fr/parent");
  assert.equal(parentEnrolLogin("en").to, "/login");
});

test("a claim account is a daycare role and returns to the claim", () => {
  const search = claimAccountSearch("/fr/claim?id=centre-1");
  assert.equal(search.intent, "up");
  assert.equal(search.role, "provider");
  assert.equal(search.desk, "provider");
  assert.equal(search.next, "/fr/claim?id=centre-1");
});

test("calendar keeps the centre from the URL when that listing is theirs", () => {
  assert.equal(calendarCentreId("centre-b", ["centre-a", "centre-b"]), "centre-b");
  assert.equal(calendarCentreId(undefined, ["centre-a"]), "centre-a");
  assert.equal(calendarCentreId("other", ["centre-a"]), "centre-a");
  assert.equal(calendarCentreId(undefined, []), "");
});

test("top rated is a page when the mark is off, and the rules when it is on", () => {
  assert.equal(topRatedPage(false), "soon");
  assert.equal(topRatedPage(true), "rules");
});

test("recipient-only stays off, skips customers, and does not replay or repeat", () => {
  assert.equal(planRecipientOnly(base).reason, "gate_off");
  assert.equal(planRecipientOnly({ ...base, allowSend: true, recipient: "family@example.com" }).reason, "customer_suppressed");
  assert.equal(planRecipientOnly({ ...base, allowSend: true, allowlist: [] }).reason, "customer_suppressed");
  assert.equal(planRecipientOnly({ ...base, allowSend: true, createdAtMs: 50 }).reason, "replay");
  assert.equal(planRecipientOnly({ ...base, allowSend: true, seenKeys: ["thread-1:email"] }).reason, "duplicate");
  assert.equal(planRecipientOnly({ ...base, allowSend: true, role: "guest" }).reason, "role");
  assert.equal(planRecipientOnly({ ...base, allowSend: true, locale: "es" }).reason, "locale");
  const sms = planRecipientOnly({ ...base, allowSend: true, channel: "sms", locale: "en", role: "provider" });
  assert.equal(sms.deliver, true);
  if (sms.deliver) assert.equal(sms.channel, "sms");
  const again = planRecipientOnly({
    ...base,
    allowSend: true,
    seenKeys: [sms.deliver ? sms.dedupeKey : ""],
  });
  assert.equal(again.reason, "duplicate");
});

test("live senders are not wired to the recipient-only planner", () => {
  const sms = readFileSync(new URL("../src/lib/server/sms.ts", import.meta.url), "utf8");
  const notify = readFileSync(new URL("../src/lib/server/notify.ts", import.meta.url), "utf8");
  const push = readFileSync(new URL("../src/lib/server/push-send.ts", import.meta.url), "utf8");
  for (const source of [sms, notify, push]) {
    assert.equal(source.includes("planRecipientOnly"), false);
    assert.equal(source.includes("recipient-only-notify"), false);
  }
});
