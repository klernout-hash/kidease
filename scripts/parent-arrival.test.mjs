import assert from "node:assert/strict";
import test from "node:test";
import { centreClockLabel, parentArrivalSentences, winnipegZoneName } from "../src/lib/parent-arrival.ts";

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
  assert.match(lines[0], /a\.m\.|p\.m\./);
  assert.match(lines[0], /\bCST\b/);
  assert.doesNotMatch(lines[0], /CDT/);
  const fr = parentArrivalSentences(
    [{ childName: "Ada", daycareName: "Oaks", action: "check_in", at: "2026-11-09T14:12:00.000Z", timeZone: "America/Winnipeg" }],
    now,
    "fr",
  );
  assert.match(fr[0], /Arrivée à \d{2}:\d{2}/);
  assert.doesNotMatch(fr[0], /a\.m\.|p\.m\./);
  assert.match(fr[0], /\bCST\b/);
});

test("Winnipeg is CDT in July and CST in November", () => {
  const july = new Date("2026-07-15T18:00:00.000Z");
  const november = new Date("2026-11-09T14:12:00.000Z");
  assert.equal(winnipegZoneName(july), "CDT");
  assert.equal(winnipegZoneName(november), "CST");
  assert.match(centreClockLabel(july.toISOString(), "en", "America/Winnipeg"), /\bCDT\b/);
  assert.match(centreClockLabel(november.toISOString(), "en", "America/Winnipeg"), /8:12 a\.m\. CST/);
  assert.doesNotMatch(centreClockLabel(november.toISOString(), "en", "America/Winnipeg"), /CDT/);
});
