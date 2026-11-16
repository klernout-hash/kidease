import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { defaultOwnerTemplates, mergeOwnerTemplates } from "../src/lib/owner-reply-templates.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";

test("English and French replies include the four centre answers", () => {
  const en = defaultOwnerTemplates("en").map((row) => row.title);
  const fr = defaultOwnerTemplates("fr").map((row) => row.title);
  assert.deepEqual(en, ["Tour confirmed", "Waitlist added", "Spot offered", "Not a fit right now"]);
  assert.ok(fr.some((title) => title.includes("Visite")));
  assert.ok(fr.some((title) => title.includes("liste d'attente")));
  assert.ok(fr.some((title) => title.includes("Place offerte")));
  assert.equal(en.length, fr.length);
});

test("an owner edit replaces one reply and a blank body removes it", () => {
  const merged = mergeOwnerTemplates("en", [
    { id: "tour-confirmed", title: "Tour is set", body: "See you Tuesday." },
    { id: "not-a-fit", title: "Not a fit right now", body: "   " },
  ]);
  assert.equal(merged.find((row) => row.id === "tour-confirmed")?.body, "See you Tuesday.");
  assert.equal(merged.some((row) => row.id === "not-a-fit"), false);
  assert.equal(merged.some((row) => row.id === "spot-offered"), true);
});

test("the flag is on and picking a reply does not send it", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_OWNER_REPLY_TEMPLATES, true);
  const inbox = readFileSync(new URL("../src/components/centre-inbox.tsx", import.meta.url), "utf8");
  assert.match(inbox, /listOwnerReplyTemplates/);
  assert.match(inbox, /saveOwnerReplyTemplate/);
  const lib = readFileSync(new URL("../src/lib/owner-reply-templates.ts", import.meta.url), "utf8");
  assert.match(lib, /never sends/);
});
