import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AI_FLAGS, aiFlagDefaultOn } from "../src/lib/ai/flags.ts";
import { aiFeatureVisible } from "../src/lib/ai/flag-gate.ts";
import { answerTourAssistant } from "../src/lib/ai/tour-assistant.ts";

const facts = {
  centre: "Elm",
  hours: "7:30 to 17:30",
  ages: "6-60 months",
  fees: "toddler 900",
  openings: null,
  slots: [{ id: "slot-1", label: "Tue 10:00", remaining: 1, date: "2026-11-20", time: "10:00" }],
};

test("the tour assistant stays off until the flag is on", () => {
  assert.equal(aiFlagDefaultOn(AI_FLAGS.tourAssistant, 0), false);
  assert.equal(
    aiFeatureVisible({ flag: AI_FLAGS.tourAssistant, bucket: 0, snapshot: { reached: false, flags: {} } }),
    false,
  );
  assert.equal(
    aiFeatureVisible({
      flag: AI_FLAGS.tourAssistant,
      bucket: 0,
      snapshot: { reached: true, flags: { "ai-tour-assistant": true } },
    }),
    true,
  );
});

test("answers use posted facts and hand off otherwise", () => {
  assert.equal(answerTourAssistant({ facts, question: "What are the hours?" }).text, "Posted hours: 7:30 to 17:30");
  assert.equal(answerTourAssistant({ facts, question: "What is the fee?" }).text, "Posted fees: toddler 900");
  const missing = answerTourAssistant({ facts: { ...facts, openings: null }, question: "Any openings?" });
  assert.equal(missing.kind, "handoff");
  const book = answerTourAssistant({ facts, question: "Book Tue 10:00" });
  assert.equal(book.kind, "book");
  if (book.kind === "book") assert.equal(book.slotId, "slot-1");
  const invented = answerTourAssistant({ facts, question: "Book Friday at 9" });
  assert.equal(invented.kind, "handoff");
  const pii = answerTourAssistant({ facts, question: "Hours for ada@example.com?" });
  assert.equal(pii.text.includes("ada@example.com"), false);
});

test("the listing shows the assistant behind the flag", () => {
  const page = readFileSync(new URL("../src/components/listing-tour-times.tsx", import.meta.url), "utf8");
  assert.match(page, /TourAssistant/);
  assert.match(readFileSync(new URL("../src/components/tour-assistant.tsx", import.meta.url), "utf8"), /useAiFeatureFlag\(AI_FLAGS\.tourAssistant\)/);
  assert.match(readFileSync(new URL("../src/components/tour-assistant.tsx", import.meta.url), "utf8"), /createTourRequest/);
});
