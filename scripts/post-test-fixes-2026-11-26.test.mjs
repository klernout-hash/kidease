import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reportFormErrors } from "../src/lib/report-form.ts";
import { signInThemePlan } from "../src/lib/theme.ts";
import { formatStatusCheckedAt } from "../src/lib/status-public.ts";
import { prepareGuideTurn } from "../src/lib/ai/site-guide.ts";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("F4: /report validates in code with localized messages", () => {
  assert.deepEqual(reportFormErrors({ name: " ", email: "nope", body: "" }), {
    name: "reportNameRequired",
    email: "reportEmailInvalid",
    body: "reportMessageRequired",
  });
  assert.deepEqual(reportFormErrors({ name: "Ana", email: "ana@example.ca", body: "Wrong hours" }), {});
  assert.match(src("src/routes/report.tsx"), /noValidate/);
  for (const f of ["copy-en", "copy-fr"]) assert.match(src(`src/lib/${f}.ts`), /reportEmailInvalid:/);
});

test("T1: guest Light/Dark carries into a System or unset account", () => {
  assert.deepEqual(signInThemePlan(null, "dark"), { theme: "dark", save: true });
  assert.deepEqual(signInThemePlan("system", "light"), { theme: "light", save: true });
  assert.deepEqual(signInThemePlan("light", "dark"), { theme: "light", save: false });
  assert.deepEqual(signInThemePlan("system", null), { theme: "system", save: false });
  assert.deepEqual(signInThemePlan("system", "system"), { theme: "system", save: false });
  // Light default: an account that never chose and no device choice lands on Light.
  assert.deepEqual(signInThemePlan(null, null), { theme: "light", save: false });
  assert.deepEqual(signInThemePlan("dark", null), { theme: "dark", save: false });
});

test("G5: status time has no daylight-time abbreviation", () => {
  const en = formatStatusCheckedAt("2026-11-26T09:17:00.000Z", "en");
  const fr = formatStatusCheckedAt("2026-11-26T09:17:00.000Z", "fr");
  assert.match(en, /Central time$/);
  assert.match(fr, /heure du Centre$/);
  assert.doesNotMatch(en + fr, /CDT|HAC|CST|HNC/);
});

test("G3/G4: help chat answers open spots and how to join a waitlist", () => {
  const spots = prepareGuideTurn({ question: "how do I update my open spots", locale: "en", audience: "provider" });
  assert.equal(spots.direct?.path, "/provider");
  assert.match(spots.direct.answer, /Listings/);
  const spotsFr = prepareGuideTurn({ question: "Comment mettre à jour mes places libres?", locale: "fr", audience: "provider" });
  assert.equal(spotsFr.direct?.path, "/fr/provider");
  const wait = prepareGuideTurn({ question: "how do I join a waitlist", locale: "en", audience: "parent" });
  assert.match(wait.direct?.answer ?? "", /^To join a waitlist/);
  const waitFr = prepareGuideTurn({ question: "Comment joindre une liste d'attente?", locale: "fr", audience: "parent" });
  assert.match(waitFr.direct?.answer ?? "", /^Pour joindre une liste d'attente/);
  assert.equal(prepareGuideTurn({ question: "how do I find open spots", locale: "en", audience: "guest" }).direct, null);
});

test("A2/A3/D1/G1/S-N5 wiring", () => {
  assert.match(src("src/styles.css"), /A2:[\s\S]*min-width: min-content/);
  assert.match(src("src/routes/__root.tsx"), /locale === "en" \? "en-CA"/);
  assert.match(src("src/components/delete-account-panel.tsx"), /delete-account-cancel/);
  assert.match(src("src/routes/tour-checklist.tsx"), /type="checkbox"/);
  assert.doesNotMatch(src("src/lib/search-coverage.ts"), /Some results may be missing/);
  assert.match(src("src/routes/search.tsx"), /coverage\.evidence\.retryable/);
});
