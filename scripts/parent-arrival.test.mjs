import assert from "node:assert/strict";
import test from "node:test";
import { parentArrivalSentences } from "../src/lib/parent-arrival.ts";

const now = new Date("2026-11-09T20:00:00.000Z");

test("a parent sees only today's saved arrival and departure", () => {
  const lines = parentArrivalSentences(
    [
      { childName: "Ada", daycareName: "Oaks", action: "check_in", at: "2026-11-09T14:12:00.000Z" },
      { childName: "Ada", daycareName: "Oaks", action: "check_out", at: "2026-11-09T22:05:00.000Z" },
      { childName: "Ada", daycareName: "Oaks", action: "check_in", at: "2026-11-08T14:00:00.000Z" },
    ],
    now,
    "en",
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Ada at Oaks/);
  assert.match(lines[0], /Arrived at/);
  assert.match(lines[0], /Left at/);
  assert.equal(
    parentArrivalSentences([{ childName: "Ada", daycareName: "Oaks", action: "check_in", at: "not-a-time" }], now, "en").length,
    0,
  );
  const fr = parentArrivalSentences(
    [{ childName: "Ada", daycareName: "Oaks", action: "check_in", at: "2026-11-09T14:12:00.000Z" }],
    now,
    "fr",
  );
  assert.match(fr[0], /Arrivée à/);
});
