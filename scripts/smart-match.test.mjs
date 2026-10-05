import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyNoteFilters,
  filtersAfterModel,
  noteForModel,
  parseNoteFilters,
  parseSmartMatchQuiz,
  pickSmartMatchResults,
  quizToFilters,
  resolveMatchPlaces,
  smartMatchEventProps,
  smartMatchModelUser,
  whyParts,
} from "../src/lib/ai/smart-match.ts";
import { tx } from "../src/lib/copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const quiz = {
  age: "any",
  budget: "any",
  french: false,
  fullTime: false,
  partTime: false,
  extraSupport: false,
  note: "",
};

test("a bad note falls back to the quiz and cannot name a listing", () => {
  const base = quizToFilters({ ...quiz, age: "infant", french: true });
  const failed = filtersAfterModel(base, { ok: false });
  assert.equal(failed.source, "quiz");
  assert.deepEqual(failed.filters, base);

  assert.equal(parseNoteFilters({ age: "toddler", listingId: "abc", name: "Sunny Days", price: 10 }), null);
  assert.equal(parseNoteFilters({ rank: 1, daycare: "Sunny Days" }), null);

  const tighter = filtersAfterModel(base, {
    ok: true,
    data: { budget: "ten", schedule: "full", extraSupport: true },
  });
  assert.equal(tighter.source, "note");
  assert.equal(tighter.filters.age, "infant");
  assert.equal(tighter.filters.french, true);
  assert.equal(tighter.filters.budget, "ten");
  assert.deepEqual(tighter.filters.schedules, ["full"]);
  assert.equal(tighter.filters.extraSupport, true);
  assert.equal("listingId" in tighter.filters, false);
});

test("the note cannot wipe a quiz must-have or invent a pin", () => {
  const base = quizToFilters({ ...quiz, age: "toddler", budget: "ten", french: true });
  const next = applyNoteFilters(base, { age: "preschool", budget: "any", french: false });
  assert.equal(next.age, "toddler");
  assert.equal(next.budget, "ten");
  assert.equal(next.french, true);

  const places = resolveMatchPlaces("Nopeville", "Also nope", () => null);
  assert.equal(places, null);
  const winnipeg = resolveMatchPlaces("Home", "Work", (query) =>
    query === "Home" ? { lat: 49.9, lng: -97.1, label: "Winnipeg, MB" } : { lat: 49.8, lng: -97.2, label: "Winnipeg, MB" },
  );
  assert.equal(winnipeg?.label, "Winnipeg, MB");
  assert.equal(winnipeg?.lat2, 49.8);
});

test("the model only sees the scrubbed note", () => {
  const raw = "Need French care. Email parent@example.com. Child name: Sam. Born 2019-04-13.";
  const seen = smartMatchModelUser(raw);
  assert.equal(seen.includes("parent@example.com"), false);
  assert.equal(seen.includes("Sam"), false);
  assert.equal(seen.includes("2019-04-13"), false);
  assert.equal(noteForModel(raw), seen);
  const parsed = parseSmartMatchQuiz({
    age: "preschool",
    home: "123 Main St",
    work: "456 Office Rd",
    startDate: "2026-11-01",
    childName: "Sam",
    email: "parent@example.com",
    note: raw,
  });
  assert.equal("home" in parsed, false);
  assert.equal(parsed.note.includes("Sam"), false);
  assert.equal(parsed.age, "preschool");
});

test("why lines and results use listing fields only", () => {
  const parts = whyParts([
    { code: "close_home" },
    { code: "made_up_sentence", text: "Parents love the meals" },
    { code: "spots_fresh", days: 2, age: "infant" },
  ]);
  assert.deepEqual(parts, [
    { key: "whyCloseHome" },
    { key: "whySpotsDays", who: "whySpotsWhoInfant", n: "2" },
  ]);
  const ranked = [
    { id: "a", amenities: "french", languages: "" },
    { id: "b", amenities: "outdoor", languages: "English" },
    { id: "c", amenities: "", languages: "French" },
  ];
  const picked = pickSmartMatchResults(ranked, quizToFilters({ ...quiz, french: true }), 10);
  assert.deepEqual(
    picked.map((item) => item.id),
    ["a", "c"],
  );
  const support = pickSmartMatchResults(
    [
      { id: "yes", amenities: "inclusive", languages: "" },
      { id: "no", amenities: "french", languages: "" },
    ],
    quizToFilters({ ...quiz, extraSupport: true }),
    10,
  );
  assert.deepEqual(
    support.map((item) => item.id),
    ["yes"],
  );
});

test("events drop notes, addresses, and contact", () => {
  const props = smartMatchEventProps({
    age_group: "infant",
    budget: "ten",
    result_count: 3,
    listing_id: "dy_1",
    position: 1,
    note: "my child Sam",
    home: "123 Main",
    email: "parent@example.com",
    phone: "204-555-0199",
  });
  assert.deepEqual(props, {
    age_group: "infant",
    budget: "ten",
    result_count: 3,
    listing_id: "dy_1",
    position: 1,
  });
});

test("smart match stays behind its flag and does not send places to the model", () => {
  const server = read("src/lib/server/smart-match.ts");
  const ui = read("src/components/smart-match.tsx");
  const home = read("src/routes/index.tsx");
  const search = read("src/routes/search.tsx");
  assert.match(server, /feature: "smart-match"/);
  assert.match(server, /smartMatchModelUser\(data\.note\)/);
  assert.match(server, /TODO: waitlist tracker/);
  assert.doesNotMatch(server, /data\.home|data\.work|startDate/);
  assert.match(ui, /AI_FLAGS\.smartMatch/);
  assert.match(ui, /smart_match_started/);
  assert.match(ui, /smart_match_completed/);
  assert.match(ui, /smart_match_result_clicked/);
  assert.match(ui, /smart_match_applied/);
  assert.match(ui, /sort: "best"/);
  assert.doesNotMatch(ui, /callAi|XAI_API_KEY/);
  assert.match(home, /<SmartMatchEntry/);
  assert.match(search, /<SmartMatchEntry/);
  assert.match(ui, /if \(!on\) return null/);
  assert.match(ui, /mt-3 flex justify-center/);
  assert.equal(tx("en", "smartMatchCta"), "Find my match with AI");
  assert.equal(tx("fr", "smartMatchCta"), "Trouver mon match avec l'IA");
  assert.match(home, /text-center text-\[clamp\(1\.6rem,4\.2vw,2\.75rem\)\]/);
  assert.match(read("src/routes/fr.index.tsx"), /<HomePage/);
  const claim = read("src/components/claim-listing-cta.tsx");
  assert.match(claim, /source === "card"/);
  assert.match(claim, /rounded-full/);
  assert.match(claim, /min-h-8/);
  assert.match(claim, /max-w-full/);
  assert.doesNotMatch(tx("en", "smartMatchCta"), /—/);
  assert.doesNotMatch(tx("fr", "smartMatchCta"), /—/);
});
