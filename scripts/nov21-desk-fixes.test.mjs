import assert from "node:assert/strict";
import test from "node:test";
import { tourStatusToLead } from "../src/lib/lead-requests.ts";
import { alertTextForReader } from "../src/lib/unified-alerts.ts";
import { govDeskSearch } from "../src/lib/gov/search.ts";
import { govLegacyHref } from "../src/lib/gov/legacy.ts";
import { guardPrivatePath } from "../src/lib/role-access.ts";

test("confirmed and accepted tours are the same confirmed count", () => {
  assert.equal(tourStatusToLead("confirmed"), "confirmed");
  assert.equal(tourStatusToLead("accepted"), "confirmed");
});

test("French readers see the French alert, not the stored English sentence", () => {
  const text = alertTextForReader("parent_new_message", "fr", {
    title: "New message",
    body: "You have a new message about Maple House.",
  });
  assert.equal(text.title, "Nouveau message");
  assert.match(text.body, /Maple House/);
  assert.doesNotMatch(text.body, /New message/);
});

test("government desk search drops empty filters", () => {
  assert.deepEqual(govDeskSearch({ province: "", region: "", city: "" }), {});
  assert.deepEqual(govDeskSearch({ province: "MB", city: " Winnipeg " }), { province: "MB", city: "Winnipeg" });
});

test("unknown government paths return to the desk", () => {
  assert.equal(govLegacyHref("en", "centres"), "/gov#gov-centres");
  assert.equal(govLegacyHref("fr", "map"), "/fr/gov#gov-map-title");
  assert.equal(govLegacyHref("fr", "settings"), "/fr/gov/data");
  assert.equal(govLegacyHref("en", "vacancies"), "/gov#gov-wait-title");
  assert.equal(govLegacyHref("en", "no-such-page"), "/gov");
});

test("signed-out invoices go to sign-in", () => {
  const decision = guardPrivatePath({ pathname: "/invoices", signedIn: false });
  assert.equal(decision.kind, "signin");
});
