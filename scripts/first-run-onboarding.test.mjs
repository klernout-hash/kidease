import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { firstRunOnboardingEnabled } from "../src/lib/features.ts";
import {
  CHECKLIST_PARENT,
  CHECKLIST_PROVIDER,
  EMPTY_ONBOARDING,
  WELCOME_PARENT,
  WELCOME_PROVIDER,
  canDismissChecklist,
  checklistOpen,
  dismissChecklist,
  markSeen,
  mergeOnboarding,
  onboardingPlace,
  parentQuickStart,
  parseOnboardingState,
  providerSetup,
  readinessLabel,
  readinessPercent,
  reopenChecklist,
  searchGuide,
  serializeOnboardingState,
  shouldAutoShow,
  welcomeSlides,
  blocksAutoTour,
  boxesOverlap,
  placeCoachBubble,
  presentCoachSteps,
} from "../src/lib/first-run.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const blankCentre = {
  hasCentre: true,
  photos: "",
  infantMonthly: null,
  toddlerMonthly: null,
  preschoolMonthly: null,
  partTimeMonthly: null,
  ageMinMonths: 6,
  ageMaxMonths: 72,
  agesConfirmed: false,
  licensedCapacity: null,
  spotsInfant: 0,
  spotsToddler: 0,
  spotsPreschool: 0,
  openingsKnown: false,
  tourTimes: false,
  chargesEnabled: false,
  staffInvited: false,
};

test("the first-run flag stays off unless the env turns it on", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_FIRST_RUN_ONBOARDING, false);
  assert.equal(firstRunOnboardingEnabled({}), false);
  assert.equal(firstRunOnboardingEnabled({ FEATURE_FIRST_RUN_ONBOARDING: "0" }), false);
  assert.equal(firstRunOnboardingEnabled({ FEATURE_FIRST_RUN_ONBOARDING: "1" }), true);
  assert.match(read(".env.example"), /^FEATURE_FIRST_RUN_ONBOARDING=0$/m);
  assert.match(read("docs/flags.md"), /FEATURE_FIRST_RUN_ONBOARDING/);
  const server = read("src/lib/server/first-run.ts");
  assert.doesNotMatch(server, /sendMail|twilio|sendSms|sendPush|stripe\.charges/);
});

test("a seen welcome never auto-shows again, and replay does not clear it", () => {
  assert.equal(shouldAutoShow(EMPTY_ONBOARDING, WELCOME_PARENT), true);
  const seen = markSeen(EMPTY_ONBOARDING, WELCOME_PARENT);
  assert.equal(shouldAutoShow(seen, WELCOME_PARENT), false);
  assert.equal(shouldAutoShow(seen, WELCOME_PROVIDER), true);
  const again = markSeen(seen, WELCOME_PARENT);
  assert.equal(again, seen);
  const reopened = reopenChecklist(seen, CHECKLIST_PARENT);
  assert.equal(shouldAutoShow(reopened, WELCOME_PARENT), false);
  assert.deepEqual(parseOnboardingState(serializeOnboardingState(seen)).seen, [WELCOME_PARENT]);
  assert.deepEqual(parseOnboardingState("not-json"), EMPTY_ONBOARDING);
  assert.deepEqual(parseOnboardingState(JSON.stringify({ seen: ["nope", WELCOME_PARENT] })).seen, [WELCOME_PARENT]);
});

test("server and this-device memory stay seen once either side has seen it", () => {
  const phone = markSeen(EMPTY_ONBOARDING, WELCOME_PARENT);
  const account = markSeen(markSeen(EMPTY_ONBOARDING, WELCOME_PROVIDER), "tour:parent:search");
  const merged = mergeOnboarding(phone, account);
  assert.deepEqual(merged.seen.sort(), [WELCOME_PARENT, WELCOME_PROVIDER, "tour:parent:search"].sort());
  assert.equal(shouldAutoShow(merged, WELCOME_PARENT), false);
  assert.equal(shouldAutoShow(merged, WELCOME_PROVIDER), false);
  assert.equal(shouldAutoShow(merged, "tour:parent:search"), false);
});

test("the provider checklist ticks a step only from real facts", () => {
  const before = providerSetup(blankCentre);
  assert.equal(before.complete, false);
  assert.equal(before.steps.find((step) => step.id === "fees")?.done, false);
  assert.equal(before.steps.find((step) => step.id === "photos")?.done, false);
  assert.equal(before.steps.find((step) => step.id === "ages")?.done, false);
  assert.equal(before.steps.find((step) => step.id === "payouts")?.done, false);
  const after = providerSetup({ ...blankCentre, infantMonthly: 900 });
  assert.equal(after.steps.find((step) => step.id === "fees")?.done, true);
  assert.equal(after.steps.find((step) => step.id === "photos")?.done, false);
  assert.equal(after.percent, readinessPercent(1, before.total));
  assert.equal(readinessLabel("en", after.percent).includes(`${after.percent}%`), true);
  assert.match(readinessLabel("fr", after.percent), /prêt à/);
  const ready = providerSetup({
    ...blankCentre,
    photos: "https://cdn.example/room.jpg",
    infantMonthly: 900,
    licensedCapacity: 16,
    openingsKnown: true,
    tourTimes: true,
    chargesEnabled: true,
    staffInvited: true,
  });
  assert.equal(ready.complete, true);
  assert.equal(ready.percent, 100);
  assert.equal(providerSetup({ ...blankCentre, hasCentre: false, infantMonthly: 900 }).steps.every((step) => !step.done), true);
  assert.equal(providerSetup({ ...blankCentre, photos: "/photos/placeholder.svg" }).steps.find((step) => step.id === "photos")?.done, false);
});

test("a provider list can be hidden only at 100 percent, and a parent list is lighter", () => {
  assert.equal(canDismissChecklist(CHECKLIST_PROVIDER, false), false);
  assert.equal(canDismissChecklist(CHECKLIST_PROVIDER, true), true);
  assert.equal(dismissChecklist(EMPTY_ONBOARDING, CHECKLIST_PROVIDER, false), EMPTY_ONBOARDING);
  const hidden = dismissChecklist(EMPTY_ONBOARDING, CHECKLIST_PROVIDER, true);
  assert.equal(checklistOpen(hidden, CHECKLIST_PROVIDER), false);
  assert.equal(shouldAutoShow(hidden, CHECKLIST_PROVIDER), false);
  const back = reopenChecklist(hidden, CHECKLIST_PROVIDER);
  assert.equal(checklistOpen(back, CHECKLIST_PROVIDER), true);
  assert.equal(shouldAutoShow(back, CHECKLIST_PROVIDER), false);
  const parent = dismissChecklist(EMPTY_ONBOARDING, CHECKLIST_PARENT, false);
  assert.equal(checklistOpen(parent, CHECKLIST_PARENT), false);
});

test("parent steps tick from profile, child, save, and tour facts", () => {
  const start = parentQuickStart({ profileReady: false, hasChild: false, hasSaved: false, hasTourRequest: false });
  assert.equal(start.done, 0);
  assert.equal(start.total, 4);
  const next = parentQuickStart({ profileReady: true, hasChild: true, hasSaved: true, hasTourRequest: false });
  assert.deepEqual(
    next.steps.map((step) => step.done),
    [true, true, true, false],
  );
  assert.equal(next.steps.find((step) => step.id === "tour")?.href, "/search");
});

test("each main screen has one tour, and quiet desks stay quiet", () => {
  assert.equal(onboardingPlace({ pathname: "/" }).welcome, WELCOME_PARENT);
  assert.equal(onboardingPlace({ pathname: "/fr" }).welcome, WELCOME_PARENT);
  assert.equal(onboardingPlace({ pathname: "/search" }).tour, "tour:parent:search");
  assert.equal(onboardingPlace({ pathname: "/fr/search" }).tour, "tour:parent:search");
  assert.equal(onboardingPlace({ pathname: "/parent", tab: "saved" }).tour, "tour:parent:saved");
  assert.equal(onboardingPlace({ pathname: "/parent", tab: "payments" }).checklist, CHECKLIST_PARENT);
  assert.equal(onboardingPlace({ pathname: "/provider", desk: "requests" }).tour, "tour:provider:requests");
  assert.equal(onboardingPlace({ pathname: "/fr/provider", desk: "money" }).tour, "tour:provider:money");
  assert.equal(onboardingPlace({ pathname: "/provider" }).welcome, WELCOME_PROVIDER);
  assert.equal(onboardingPlace({ pathname: "/inbox", view: "centre" }).tour, "tour:provider:messages");
  assert.equal(onboardingPlace({ pathname: "/login" }).welcome, null);
  assert.equal(onboardingPlace({ pathname: "/admin" }).tour, null);
  assert.equal(onboardingPlace({ pathname: "/admin-chat" }).welcome, null);
  assert.equal(onboardingPlace({ pathname: "/gov/reports" }).welcome, null);
  assert.equal(blocksAutoTour("admin"), true);
  assert.equal(blocksAutoTour("government"), true);
  assert.equal(blocksAutoTour("parent"), false);
  assert.equal(welcomeSlides(WELCOME_PARENT).length >= 4, true);
  assert.equal(welcomeSlides(WELCOME_PROVIDER).length >= 4, true);
  for (const slide of [...welcomeSlides(WELCOME_PARENT), ...welcomeSlides(WELCOME_PROVIDER)]) {
    assert.ok(slide.anchors.length > 0);
    assert.ok(slide.body.en.length < 90);
    assert.ok(slide.title.fr.length > 3);
    assert.notEqual(slide.title.fr, slide.title.en);
  }
});

test("a missing target is skipped and the bubble stays off the target", () => {
  const slides = welcomeSlides(WELCOME_PARENT);
  const visible = presentCoachSteps(slides, (selector) => selector.includes("help-button"));
  assert.equal(visible.length, 1);
  assert.equal(visible[0]?.title.en, "Help stays here");
  const target = { top: 20, left: 16, width: 280, height: 56 };
  const placed = placeCoachBubble(target, { width: 260, height: 150 }, { width: 390, height: 844 });
  assert.equal(boxesOverlap(target, { ...placed, height: 150 }, 8), false);
  const low = { top: 700, left: 40, width: 80, height: 64 };
  const above = placeCoachBubble(low, { width: 260, height: 150 }, { width: 390, height: 844 });
  assert.equal(above.arrow, "down");
  assert.equal(boxesOverlap(low, { ...above, height: 150 }, 8), false);
});

test("help search finds French and English articles", () => {
  assert.equal(searchGuide("").length > 5, true);
  assert.equal(searchGuide("visite", "parent").some((article) => article.id === "request-tour"), true);
  assert.equal(searchGuide("payout", "provider").some((article) => article.id === "provider-payouts"), true);
  assert.equal(searchGuide("zzzz-nope").length, 0);
  const help = read("src/routes/help.tsx");
  assert.match(help, /HelpGuide/);
  const logic = read("src/lib/first-run.ts");
  assert.match(logic, /calendly\.com\/kidease\/kidease-demo/);
  assert.match(logic, /Want a hand/);
});
