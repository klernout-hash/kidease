import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { curriculumPackEnabled, curriculumPackLive, storyCornerEnabled } from "../src/lib/features.ts";
import { visibleDeskNav } from "../src/lib/desk-nav.ts";
import {
  ACTIVITY_LIBRARY,
  FRAMEWORK_LIBRARY,
  GOAL_LIBRARY,
  PROVINCE_CODES,
  acceptStoryPhoto,
  anonymiseCoverage,
  buildStatement,
  coverageReport,
  curriculumMode,
  docsFor,
  goalsFor,
  homeIdeas,
  normalizeProvince,
  parentMaySeeStory,
  photoView,
  planLanguage,
  reviewReminder,
  weekPlan,
} from "../src/lib/curriculum/pack.ts";
import { flattenCurriculumLocale, curriculumActivity, curriculumLocaleList, contentLocales } from "../src/lib/curriculum/text.ts";
import { GOAL_THEMES } from "../src/lib/curriculum/pack.ts";
import {
  bookDashCredit,
  pickStoryBooks,
  classifyLicence,
  creditVisible,
  emptyCreators,
  parseBookDashCreators,
  parseBookDashIndex,
  planGdlBook,
  readerFileAllowed,
  sha256Hex,
  shaMatches,
  storyweaverItemAllowed,
  storyweaverStatus,
  uniteForLiteracy,
} from "../src/lib/story-corner/open-books.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("curriculum flags default off and the nav stays hidden", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_CURRICULUM_PACK, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_CURRICULUM_PACK_LIVE, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_STORY_CORNER, false);
  assert.equal(curriculumPackEnabled({}), false);
  assert.equal(curriculumPackLive({}), false);
  assert.equal(storyCornerEnabled({}), false);
  assert.equal(curriculumMode(false, false), "off");
  assert.equal(curriculumMode(true, false), "draft");
  assert.equal(curriculumMode(true, true), "live");
  const hidden = visibleDeskNav("daycare", { centreOwner: true, subscriptionsEnabled: true });
  assert.equal(hidden.some((item) => item.id === "learning"), false);
  const shown = visibleDeskNav("daycare", { centreOwner: true, subscriptionsEnabled: true, curriculumPack: true });
  assert.equal(shown.some((item) => item.id === "learning"), true);
  assert.match(src(".env.example"), /^FEATURE_CURRICULUM_PACK=0$/m);
  assert.match(src(".env.example"), /^FEATURE_CURRICULUM_PACK_LIVE=0$/m);
  assert.match(src(".env.example"), /^FEATURE_STORY_CORNER=0$/m);
});

test("every province has its own goals, plan, activities, and a help button", () => {
  assert.equal(FRAMEWORK_LIBRARY.length, 13);
  assert.equal(GOAL_LIBRARY.length, 13 * 5);
  assert.ok(ACTIVITY_LIBRARY.length >= 60);
  for (const province of PROVINCE_CODES) {
    const goals = goalsFor(province);
    assert.equal(goals.length, 5);
    assert.ok(activitiesForSafe(province).length >= 4);
    const week = weekPlan(province, "2026-11-02");
    assert.equal(week.days.length, 5);
    assert.ok(docsFor(province).length >= 1);
    for (const goal of goals) {
      assert.ok(goal.en.length < 160);
      assert.ok(goal.fr.length > 0);
      assert.equal(goal.sourceUrl.startsWith("http"), true);
      assert.doesNotMatch(goal.en, /ASQ|How Does Learning Happen/);
    }
  }
  assert.equal(planLanguage("QC", "en"), "fr");
  assert.equal(planLanguage("NB", "en"), "both");
  assert.equal(normalizeProvince("PEI"), "PE");
  assert.equal(normalizeProvince("NWT"), "NT");
  const ui = src("src/components/curriculum-pack.tsx");
  for (const section of ["off", "goals", "story", "plans", "activities", "coverage", "books", "parent-stories", "gov-learning"]) {
    assert.match(ui, new RegExp(`data-section="${section}"`));
  }
  assert.match(ui, /data-ke="curriculum-help"/);
  assert.doesNotMatch(ui, /maps\.google|googleapis/);
});

function activitiesForSafe(province) {
  return ACTIVITY_LIBRARY.filter((row) => row.province === province);
}

test("Manitoba statement is confirmed and the yearly reminder is log-only", () => {
  const mb = docsFor("MB")[0];
  const on = docsFor("ON")[0];
  assert.equal(mb.confirmation, "confirmed");
  assert.match(mb.citation, /62\/86/);
  assert.equal(mb.reviewStatus, "placeholder");
  assert.equal(on.confirmation, "confirmed");
  assert.equal(on.reviewStatus, "confirmed");
  const reminder = reviewReminder(mb, "2026-11-01");
  assert.equal(reminder.dueOn, "2027-11-01");
  assert.equal(reminder.logOnly, true);
  assert.equal(reminder.sendsMail, false);
  assert.equal(reminder.sendsSms, false);
  const statement = buildStatement({
    doc: on,
    centreName: "River Room",
    answers: ["Children greet a friend."],
    goalLabels: ["The child feels they belong here"],
  });
  assert.match(statement.text, /River Room/);
  assert.match(statement.text, /ontario\.ca|Queen's Printer/);
  assert.doesNotMatch(statement.text, /pedagogical document/);
  const yt = FRAMEWORK_LIBRARY.find((row) => row.province === "YT");
  assert.equal(yt.requirementStatus, "placeholder");
});

test("coverage names stay on the centre report and drop out of the government totals", () => {
  const report = coverageReport({
    province: "ON",
    children: [{ id: "ch_1", name: "Secret Child", room: "Bluebirds" }],
    stories: [{ childId: "ch_1", goalIds: ["ON-belong"], status: "published" }],
  });
  assert.equal(report.perChild[0].childName, "Secret Child");
  assert.equal(report.perRoom[0].room, "Bluebirds");
  const totals = anonymiseCoverage({
    province: "ON",
    childCount: report.perChild.length,
    coveredCounts: [{ goalId: "ON-belong", children: 1 }],
  });
  const dumped = JSON.stringify(totals);
  assert.doesNotMatch(dumped, /Secret Child|Bluebirds/);
  assert.equal(totals.childCount, null);
  assert.equal(parentMaySeeStory({ mode: "draft", status: "published", enrolled: true, ownsChild: true }), false);
  assert.equal(parentMaySeeStory({ mode: "live", status: "published", enrolled: true, ownsChild: true }), true);
  assert.equal(homeIdeas("QC", ["QC-play"], "infant").length > 0, true);
});

test("a child photo needs consent and a signed private link", () => {
  assert.equal(acceptStoryPhoto({ consentAt: null, enrolled: true, key: "family-docs/curriculum/c/ch/a.jpg" }).ok, false);
  assert.equal(acceptStoryPhoto({ consentAt: "2026-11-01T00:00:00.000Z", enrolled: true, key: "https://cdn.example/child.jpg" }).ok, false);
  assert.equal(acceptStoryPhoto({ consentAt: "2026-11-01T00:00:00.000Z", enrolled: true, key: "family-docs/curriculum/sample-face.jpg" }).ok, false);
  const ok = acceptStoryPhoto({
    consentAt: "2026-11-01T00:00:00.000Z",
    enrolled: true,
    key: "family-docs/curriculum/centre/child/photo.jpg",
  });
  assert.equal(ok.ok, true);
  const blocked = photoView({
    key: "family-docs/curriculum/centre/child/photo.jpg",
    consentAt: "2026-11-01T00:00:00.000Z",
    enrolled: true,
    signedUrl: "https://files.example/photo.jpg",
  });
  assert.equal("blocked" in blocked, true);
  const open = photoView({
    key: "family-docs/curriculum/centre/child/photo.jpg",
    consentAt: "2026-11-01T00:00:00.000Z",
    enrolled: true,
    signedUrl: "https://files.example/photo.jpg?X-Amz-Signature=abc",
  });
  assert.equal("url" in open, true);
  const migration = src("migrations/0132_curriculum_pack.sql");
  assert.match(migration, /create table if not exists curriculum_story_meta/);
  assert.match(migration, /create unique index if not exists curriculum_plans_once/);
  assert.doesNotMatch(src("migrations/0120_learning_stories.sql"), /\bphoto\b/);
  assert.match(src("src/lib/server/learning-stories.ts"), /do not take photos/);
});

test("every curriculum string exists in all 10 menu languages", () => {
  const locales = curriculumLocaleList();
  assert.deepEqual([...locales], ["en", "fr", "zh", "yue", "pa", "es", "ar", "tl", "it", "de"]);
  const english = flattenCurriculumLocale("en");
  const keys = Object.keys(english);
  assert.ok(keys.length > 200);
  for (const locale of locales) {
    const pack = flattenCurriculumLocale(locale);
    for (const key of keys) {
      assert.equal(typeof pack[key], "string", `${locale} ${key}`);
      assert.ok(String(pack[key]).trim(), `${locale} ${key} empty`);
      assert.equal(pack[key].includes("{place}"), english[key].includes("{place}"), `${locale} ${key} place`);
      assert.equal(pack[key].includes("{prop}"), english[key].includes("{prop}"), `${locale} ${key} prop`);
      assert.equal(pack[key].includes("{goal}"), english[key].includes("{goal}"), `${locale} ${key} goal`);
      assert.equal(pack[key].includes("{n}"), english[key].includes("{n}"), `${locale} ${key} n`);
      if (locale !== "en" && english[key].length > 24) {
        assert.notEqual(pack[key], english[key], `${locale} ${key} still English`);
      }
    }
  }
  for (const province of ["MB", "ON", "QC", "NB"]) {
    for (const theme of GOAL_THEMES) {
      for (const locale of locales) {
        const view = curriculumActivity(locale, province, theme);
        assert.ok(view.title.trim());
        assert.equal(view.steps.length, 3);
        if (locale !== "en") assert.notEqual(view.title, curriculumActivity("en", province, theme).title);
      }
    }
  }
  assert.deepEqual(contentLocales("QC", "zh"), ["fr", "zh"]);
  assert.deepEqual(contentLocales("NB", "en"), ["en", "fr"]);
  assert.deepEqual(contentLocales("ON", "de"), ["de"]);
  const shelf = pickStoryBooks(
    [
      { language: "en", title: "Rain" },
      { language: "fr", title: "Pluie" },
    ],
    "zh",
  );
  assert.equal(shelf.fallback, "official-languages");
  assert.equal(shelf.books.length, 2);
  const french = pickStoryBooks([{ language: "en", title: "Rain" }], "fr");
  assert.equal(french.fallback, "other-language");
  assert.equal(french.books[0].title, "Rain");
  const matched = pickStoryBooks([{ language: "fr", title: "Pluie" }], "fr");
  assert.equal(matched.fallback, "none");
});

test("story corner keeps CC BY, skips NC and ND, and credits Book Dash", () => {
  assert.equal(classifyLicence("CC-BY-4.0"), "by");
  assert.equal(classifyLicence("cc-by-sa-4-0"), "by-sa");
  assert.equal(classifyLicence("CC BY-NC 4.0"), "skip");
  assert.equal(classifyLicence("CC-BY-ND"), "skip");
  assert.equal(classifyLicence("CC-BY-NC-ND"), "skip");
  assert.equal(storyweaverItemAllowed({ title: "Read Along: Cats", licence: "CC-BY-4.0" }), false);
  assert.equal(storyweaverItemAllowed({ title: "A small boat", kind: "read-along video", licence: "CC-BY-4.0" }), false);
  assert.equal(storyweaverStatus({}).enabled, false);
  assert.equal(storyweaverStatus({ STORYWEAVER_API_TOKEN: "secret-token" }).reason.includes("secret-token"), false);
  const unite = uniteForLiteracy();
  assert.equal(unite.embed, false);
  assert.equal(unite.href, "https://www.uniteforliteracy.com/");
  const creators = emptyCreators();
  creators.author = "Ada Writer";
  creators.illustrator = "Bea Draw";
  creators.designer = "Cam Page";
  creators.editor = "Dee Edit";
  const credit = bookDashCredit({ ...creators, changeNote: "" });
  assert.match(credit, /Ada Writer/);
  assert.match(credit, /Bea Draw/);
  assert.match(credit, /Cam Page/);
  assert.match(credit, /Dee Edit/);
  assert.match(credit, /www\.bookdash\.org/);
  assert.match(credit, /CC BY 4\.0/);
  const changed = bookDashCredit({ ...creators, changeNote: "Translated into French by KidEase." });
  assert.match(changed, /Translated into French/);
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const hash = sha256Hex(bytes);
  assert.equal(shaMatches(bytes, hash), true);
  assert.equal(shaMatches(bytes, "ab"), false);
  assert.equal(readerFileAllowed("https://bookdash.org/file.pdf"), false);
  assert.equal(readerFileAllowed("data/story-corner/files/book/page.pdf"), true);
  const skipped = planGdlBook({ title: "NC book", license: [{ slug: "cc-by-nc-4-0" }], h5pUrl: "https://content.digitallibrary.io/x.h5p", language: [{ slug: "en" }] });
  assert.equal(skipped.keep, false);
  const kept = planGdlBook({
    postId: 7,
    title: "Rain walk",
    publisher: "StoryWeaver",
    license: [{ slug: "cc-by-4-0" }],
    language: [{ slug: "fr" }],
    h5pUrl: "https://content.digitallibrary.io/book.h5p",
  });
  assert.equal(kept.keep, true);
  if (kept.keep) {
    assert.equal(kept.plan.language, "fr");
    assert.equal(kept.plan.unmodified, true);
    assert.equal(kept.plan.licenceClass, "by");
    assert.equal(Object.hasOwn(kept.plan, "localPath"), false);
  }
  const index = parseBookDashIndex(
    '<a href="?book=a-beautiful-day"><span class="display-ib display-mid">A Beautiful Day</span></a>',
  );
  assert.equal(index[0].slug, "a-beautiful-day");
  const parsed = parseBookDashCreators("Created by Raeesah Vawda (Designer) Lindy Pelzl (Illustrator) Elana Bregin (Writer) Sign up");
  assert.equal(parsed.author, "Elana Bregin");
  assert.equal(parsed.illustrator, "Lindy Pelzl");
  assert.equal(parsed.designer, "Raeesah Vawda");
  assert.match(parsed.editor, /Not named/);
  const card = {
    credit,
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    source: "bookdash",
    logoPath: "/story-corner/book-dash-logo.jpg",
    creators,
  };
  assert.equal(creditVisible(card), true);
  assert.match(src("src/components/curriculum-pack.tsx"), /target="_blank"/);
  assert.doesNotMatch(src("src/components/curriculum-pack.tsx"), /<iframe/);
  assert.match(src("public/story-corner/book-dash-logo.jpg").length > 100 ? "logo" : "", /logo/);
});
