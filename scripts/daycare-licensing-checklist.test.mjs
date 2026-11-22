import { test } from "node:test";
import assert from "node:assert/strict";
import { startDaycarePt } from "../src/lib/start-daycare-hub.ts";
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

test("Manitoba directs centre and home applicants to distinct bilingual orientation before applying", () => {
  const { pathway, orientationLinks } = LICENSING_GUIDES.MB;
  assert.match(pathway[0], /Before applying.*required information session/);
  assert.match(pathway[1], /Avant de faire une demande.*séance d’information obligatoire/);
  assert.equal(orientationLinks.length, 2);
  assert.match(orientationLinks[0].label[0], /Centre/);
  assert.match(orientationLinks[0].label[1], /centre/);
  assert.match(orientationLinks[1].label[0], /Home-based/);
  assert.match(orientationLinks[1].label[1], /familiale/);
  for (const link of orientationLinks) {
    assert.equal(link.url.length, 2);
    assert.notEqual(link.url[0], link.url[1]);
    for (const url of link.url)
      assert.ok(
        ["www.manitoba.ca", "manitoba.ca", "www.gov.mb.ca"].includes(new URL(url).hostname),
      );
    assert.match(link.url[1], /orientation_session\.fr\.html$/);
  }
  assert.ok(orientationLinks[0].url.every((url) => url.includes("centrebased_childcare")));
  assert.ok(orientationLinks[1].url.every((url) => url.includes("homebased_childcare")));
  const manitoba = startDaycarePt("MB");
  assert.match(manitoba.licensingUrl, /centres_homeproviders\/index\.html$/);
  assert.match(manitoba.licensingUrlFr, /centres_homeproviders\/index\.fr\.html$/);
});
