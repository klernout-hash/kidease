import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decodeLicensingProgress,
  LICENSING_GUIDES,
  LICENSING_REVIEW_DATE,
  LICENSING_STEPS,
  LICENSING_STORAGE_PREFIX,
} from "../src/lib/daycare-licensing-checklist.ts";

test("the 13 sourced jurisdiction guides provide bilingual core steps", () => {
  assert.deepEqual(Object.keys(LICENSING_GUIDES).sort(), [
    "AB",
    "BC",
    "MB",
    "NB",
    "NL",
    "NS",
    "NT",
    "NU",
    "ON",
    "PE",
    "QC",
    "SK",
    "YT",
  ]);
  for (const [code, guide] of Object.entries(LICENSING_GUIDES)) {
    for (const line of [guide.pathway, guide.application, guide.costs, guide.timing].filter(
      Boolean,
    )) {
      assert.equal(line.length, 2, code);
      assert.ok(
        line.every((value) => value.trim().length > 35),
        code,
      );
    }
    for (const link of [guide.source, guide.sourceFr].filter(Boolean)) {
      assert.equal(new URL(link).protocol, "https:", code);
      assert.match(
        new URL(link).hostname,
        /gov\.|gouv\.|alberta\.ca|gnb\.ca|quebec\.ca|childcarenovascotia\.ca|yukon\.ca$/,
        code,
      );
    }
  }
  assert.match(LICENSING_REVIEW_DATE, /^\d{4}-\d{2}-\d{2}$/);
});

test("browser progress accepts just the known step IDs; no free-form or person data", () => {
  assert.equal(LICENSING_STEPS.length, 6);
  assert.match(LICENSING_STORAGE_PREFIX, /^kidease\.daycare-licensing\.v\d\.$/);
  for (const malformed of [null, "bad json", "null", "{}", '["other",22,{"a":true}]']) {
    assert.deepEqual(decodeLicensingProgress(malformed), []);
  }
  assert.deepEqual(decodeLicensingProgress('["renewal","space","space","wrong"]'), [
    "space",
    "renewal",
  ]);
});

test("the common English/French route renders interactive progress without account or data writes", () => {
  const read = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
  const route = read("../src/routes/start-a-daycare.tsx");
  const component = read("../src/components/daycare-licensing-checklist.tsx");
  assert.match(route, /<DaycareLicensingChecklist key=\{pt\.code\}/);
  assert.match(component, /type="checkbox"/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /localStorage\.setItem/);
  assert.doesNotMatch(component, /\bfetch\(|createServerFn|signIn/);
});
