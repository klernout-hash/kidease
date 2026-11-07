import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { canAccessSupport } from "../src/lib/support.ts";
import {
  allowThreadReferenceLookup,
  conversationIdFromReference,
  resetThreadReferenceLookups,
  threadReferenceCard,
  threadReferenceFromId,
} from "../src/lib/thread-reference.ts";

const root = new URL("../", import.meta.url);

test("a message number is stable, unique, and not a spot confirmation", () => {
  const first = "cv_odsrbbm8afzd";
  const second = "cv_odsrbbm8afze";
  assert.equal(threadReferenceFromId(first), "KE-ODSR-BBM8-AFZD");
  assert.equal(threadReferenceFromId(first), threadReferenceFromId(first));
  assert.notEqual(threadReferenceFromId(first), threadReferenceFromId(second));
  assert.equal(conversationIdFromReference("ke-odsr-bbm8-afzd"), first);
  assert.equal(conversationIdFromReference("nope"), null);
  assert.equal(conversationIdFromReference("KE-123"), null);
  const card = threadReferenceCard({
    reference: "KE-ODSR-BBM8-AFZD",
    status: "requested",
    daycareName: "E2E Centre",
    city: "Winnipeg",
    parentName: "E2E Parent",
    ownerName: "E2E Daycare",
    when: "2026-10",
  });
  assert.equal(card.relationship, "inboxStatusRequestPending");
  assert.equal("email" in card, false);
  assert.equal("address" in card, false);
  assert.equal("childName" in card, false);
});

test("lookup is limited and only the existing support desk may use it", () => {
  resetThreadReferenceLookups();
  for (let i = 0; i < 12; i += 1) assert.equal(allowThreadReferenceLookup("staff-1", 1_000 + i), true);
  assert.equal(allowThreadReferenceLookup("staff-1", 1_020), false);
  assert.equal(allowThreadReferenceLookup("staff-2", 1_020), true);
  assert.equal(canAccessSupport("support"), true);
  assert.equal(canAccessSupport("support_lead"), true);
  assert.equal(canAccessSupport("admin"), true);
  assert.equal(canAccessSupport("parent"), false);
  assert.equal(canAccessSupport("provider"), false);
  assert.equal(canAccessSupport("government"), false);
  const server = readFileSync(new URL("src/lib/server/thread-reference.ts", root), "utf8");
  assert.match(server, /requireSupport/);
  assert.doesNotMatch(server, /select[\s\S]*email|address|birthdate|monthly_amount|child_id/i);
});
