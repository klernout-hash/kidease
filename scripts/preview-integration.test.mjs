import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { govPortalFooterEnabled } from "../src/lib/features.ts";
import { readPublicListingSpaces, saveListingSpace, setListingSpacePhotos } from "../src/lib/listing-spaces-store.ts";
import { mealOfferingsFromStored, normalizeMealOfferings, publicMealSummary } from "../src/lib/meal-offerings.ts";
import { cleanProfileAbout } from "../src/lib/profile-about.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function sqlFor(pg) {
  const run = async (text, params) => {
    const result = await pg.query(text, params);
    return result.rows;
  };
  const sql = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run(text, values);
  };
  sql.query = run;
  return sql;
}

test("government desk flag is closed by default and open only when that flag is on", () => {
  assert.equal(govPortalFooterEnabled({ FEATURE_GOV_PORTAL: "false" }), false);
  assert.equal(govPortalFooterEnabled({ FEATURE_GOV_PORTAL: "0" }), false);
  assert.equal(govPortalFooterEnabled({ FEATURE_GOV_PORTAL: "true" }), true);
  assert.match(read("src/lib/flags.ts"), /FEATURE_GOV_PORTAL: false/);
  assert.match(read("src/lib/flags.ts"), /FEATURE_SUPPORT_CHAT: false/);
  assert.match(read("src/routes/daycare.$slug.tsx"), /chrome\.role !== "government" && showPublicClaimPrompt/);
});

test("the opened listing keeps named rooms, saved meals, compact cards, and reduced motion", () => {
  const page = read("src/routes/daycare.$slug.tsx");
  const css = read("src/styles.css");
  const card = read("src/components/daycare-card.tsx");
  assert.match(page, /data-ke="public-room-photos"/);
  assert.match(page, /data-ke="named-room"/);
  assert.match(page, /Pièces et espaces/);
  assert.match(page, /Rooms and spaces/);
  assert.match(page, /function ListingOffers/);
  assert.doesNotMatch(page, /draft-policy-workflow|cancellation-policy/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /html\[data-resolved-theme="dark"\]/);
  assert.match(card, /data-ke="card-live-pill"/);
  assert.match(card, /ClaimListingCta/);
  const about = read("src/components/about-you-form.tsx");
  assert.match(about, /Only you can see this/);
  assert.match(about, /Vous seul pouvez voir ceci/);
});

test("isolated preview database reloads rooms, meals, draft policy, and private profile facts", async () => {
  const pg = new PGlite();
  const sql = sqlFor(pg);
  await pg.exec(`
    create table daycares (
      id text primary key,
      photos text
    );
    create table provider_daycares (
      user_id text not null,
      daycare_id text not null references daycares(id),
      primary key (user_id, daycare_id)
    );
    create table centre_members (
      user_id text not null,
      daycare_id text not null,
      status text,
      role text
    );
    create table profiles (
      user_id text primary key,
      role text not null
    );
  `);
  await pg.exec(read("migrations/0178_listing_spaces.sql"));
  await pg.exec(read("migrations/0179_meal_offerings.sql"));
  await pg.exec(read("migrations/0180_profile_about.sql"));
  await pg.exec(read("migrations/0181_draft_policy_workflow.sql"));

  const photo = "/photos/demo/daycare-02.webp";
  await pg.query("insert into daycares (id, photos) values ($1, $2)", ["centre-1", photo]);
  await pg.query("insert into provider_daycares (user_id, daycare_id) values ($1, $2)", ["owner-1", "centre-1"]);

  await assert.rejects(
    () => saveListingSpace(sql, "stranger", { daycareId: "centre-1", name: "Nap room", spaceType: "nap" }),
    /Not your listing/,
  );
  const saved = await saveListingSpace(sql, "owner-1", { daycareId: "centre-1", name: "Nap room", spaceType: "nap" });
  const spaceId = saved.spaces[0]?.id;
  assert.equal(saved.spaces[0]?.name, "Nap room");
  await setListingSpacePhotos(sql, "owner-1", { daycareId: "centre-1", spaceId, photoSrcs: [photo] });
  const reloaded = await readPublicListingSpaces(sql, "centre-1", photo);
  assert.equal(reloaded.spaces[0]?.name, "Nap room");
  assert.deepEqual(reloaded.spaces[0]?.photos, [photo]);

  const meals = normalizeMealOfferings({ slots: { lunch: true }, drinks: { water: true } });
  await pg.query("update daycares set meal_offerings = $1::jsonb where id = $2", [JSON.stringify(meals), "centre-1"]);
  const mealRows = await pg.query("select meal_offerings from daycares where id = $1", ["centre-1"]);
  const rawMeals = mealRows.rows[0].meal_offerings;
  const parsedMeals = typeof rawMeals === "string" ? JSON.parse(rawMeals) : rawMeals;
  const summary = publicMealSummary(mealOfferingsFromStored(parsedMeals), "en", false);
  const sommaire = publicMealSummary(mealOfferingsFromStored(parsedMeals), "fr", false);
  assert.equal(summary.lines.some((line) => line.id === "lunch"), true);
  assert.equal(summary.lines.some((line) => line.id === "breakfast"), false);
  assert.equal(sommaire.lines.some((line) => line.label === "Dîner"), true);

  const body = "Quebec draft words that must not change after a later edit.";
  await pg.query(
    `insert into draft_cancellation_policies
      (id, daycare_id, province, program, topic, body, status, in_force, version, created_by)
     values ($1, $2, 'QC', 'cwelcc', 'pre-start', $3, 'counsel-review', false, 1, $4)`,
    ["pol-1", "centre-1", body, "owner-1"],
  );
  await pg.query(
    `insert into draft_policy_acceptances
      (id, policy_id, policy_version, body_snapshot, user_id, place_status)
     values ('acc-1', 'pol-1', 1, $1, 'parent-1', 'draft')`,
    [body],
  );
  await pg.query("update draft_cancellation_policies set body = 'Edited later' where id = 'pol-1'");
  const snap = await pg.query("select body_snapshot, place_status from draft_policy_acceptances where id = 'acc-1'");
  assert.equal(snap.rows[0].body_snapshot, body);
  assert.equal(snap.rows[0].place_status, "draft");
  await assert.rejects(() => pg.query("update draft_cancellation_policies set in_force = true where id = 'pol-1'"));
  await assert.rejects(() =>
    pg.query(
      `insert into draft_policy_acceptances
        (id, policy_id, policy_version, body_snapshot, user_id, place_status)
       values ('acc-2', 'pol-1', 1, 'words', 'parent-2', 'confirmed')`,
    ),
  );
  await pg.query(
    `insert into draft_disputes (id, support_reference, user_id, status, evidence_note)
     values ('dsp-1', 'KE-ABCD-1234', 'parent-1', 'open', 'Photo of the notice')`,
  );
  await assert.rejects(() => pg.query("update draft_disputes set status = 'penalty' where id = 'dsp-1'"));
  await pg.query("update draft_disputes set status = 'human-review' where id = 'dsp-1'");
  await pg.query("update draft_disputes set status = 'closed' where id = 'dsp-1'");
  const dispute = await pg.query("select status from draft_disputes where id = 'dsp-1'");
  assert.equal(dispute.rows[0].status, "closed");
  await pg.query("insert into draft_shadow_ranks (id, daycare_id, rate, frozen) values ('sh-1', 'centre-1', 0.1, true)");
  await assert.rejects(() =>
    pg.query("insert into draft_shadow_ranks (id, daycare_id, rate, frozen) values ('sh-2', 'centre-1', 0.2, false)"),
  );

  await pg.query(
    `insert into profiles (user_id, role, about)
     values ('parent-1', 'parent', $1::jsonb)`,
    [JSON.stringify({ work: "Teacher", identityVerified: true, role: "admin" })],
  );
  const mine = await pg.query("select about from profiles where user_id = $1", ["parent-1"]);
  const aboutRaw = mine.rows[0].about;
  const about = cleanProfileAbout(typeof aboutRaw === "string" ? JSON.parse(aboutRaw) : aboutRaw);
  assert.equal(about.work, "Teacher");
  assert.equal("identityVerified" in about, false);
  assert.equal("role" in about, false);
  const other = await pg.query("select about from profiles where user_id = $1", ["parent-2"]);
  assert.equal(other.rows.length, 0);
  const daycareColumns = await pg.query(
    "select column_name from information_schema.columns where table_name = 'daycares'",
  );
  assert.equal(daycareColumns.rows.some((row) => row.column_name === "about"), false);
  await pg.close();
});
