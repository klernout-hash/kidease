import assert from "node:assert/strict";
import test from "node:test";
import {
  agentReplyText,
  liveAgentSmsDecision,
  liveChatSmsBody,
  ticketCodeFromSms,
} from "../src/lib/support-chat.ts";
import { isHiddenTestListing } from "../src/lib/listing-visibility.ts";

test("only the configured support phone can enter a live help thread", () => {
  const agent = "+12045550199";
  assert.equal(liveAgentSmsDecision("+12045550100", "#KE-1042 On my way", agent).route, false);
  const routed = liveAgentSmsDecision("+1 (204) 555-0199", "Reply #KE-1042 We can help today", agent);
  assert.equal(routed.route, true);
  assert.equal(routed.code, "KE-1042");
  assert.equal(liveAgentSmsDecision(agent, "Just reply", agent).code, null);
  assert.equal(ticketCodeFromSms("see #ke-88"), null);
  assert.equal(agentReplyText("#KE-1042 We can help today"), "We can help today");
  assert.match(liveChatSmsBody({ code: "KE-1042", name: "Guest", page: "/parent", message: "Hello" }), /#KE-1042/);
});

test("QA TEST listings stay off the parent saved list", () => {
  assert.equal(isHiddenTestListing({ name: "QA TEST Daycare Listing", slug: "qa-test-daycare-listing" }), true);
  assert.equal(isHiddenTestListing({ name: "Riverdale Community Child Care", slug: "riverdale" }), false);
});
