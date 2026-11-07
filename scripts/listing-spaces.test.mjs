import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  deleteListingSpace,
  listListingSpacesForCentre,
  saveListingSpace,
  setListingSpacePhotos,
  writeListingPhotoList,
} from "../src/lib/listing-spaces-store.ts";

const PHOTOS = Array.from(
  { length: 10 },
  (_, index) => `https://media.kidease.ca/fixtures/daycare-${String(index + 1).padStart(2, "0")}.webp`,
);

function sqlFor(pg) {
  const sql = async (strings, ...values) => {
    let text = "";
    strings.forEach((part, index) => {
      text += part;
      if (index < values.length) text += `$${index + 1}`;
    });
    const result = await pg.query(text, values);
    return result.rows;
  };
  sql.query = async (text, params = []) => (await pg.query(text, params)).rows;
  return sql;
}

async function database() {
  const pg = new PGlite();
  await pg.exec(`
    create table daycares (
      id text primary key,
      photos text not null,
      last_photo_updated_at timestamptz
    );
    create table provider_daycares (
      user_id text not null,
      daycare_id text not null references daycares(id),
      primary key (user_id, daycare_id)
    );
    create table centre_members (
      id text primary key,
      daycare_id text not null,
      user_id text not null,
      role text not null,
      status text not null
    );
  `);
  await pg.exec(readFileSync(new URL("../migrations/0178_listing_spaces.sql", import.meta.url), "utf8"));
  await pg.query("insert into daycares (id, photos) values ($1, $2)", ["qa", PHOTOS.join(",")]);
  await pg.query("insert into provider_daycares (user_id, daycare_id) values ('owner', 'qa')");
  await pg.query(
    "insert into centre_members (id, daycare_id, user_id, role, status) values ('m1', 'qa', 'manager', 'manager', 'active'), ('m2', 'qa', 'staff', 'staff', 'active')",
  );
  return sqlFor(pg);
}

test("rooms persist photos, rename, reassignment, and a confirmed delete keeps the cover", async () => {
  const sql = await database();
  await assert.rejects(() => saveListingSpace(sql, "other", { daycareId: "qa", name: "Play", spaceType: "play" }), /Not your listing/);
  await assert.rejects(() => saveListingSpace(sql, "staff", { daycareId: "qa", name: "Play", spaceType: "play" }), /Not your listing/);

  let group = await saveListingSpace(sql, "owner", { daycareId: "qa", name: "Play room", spaceType: "play", amenities: ["books"], accessibility: ["quiet-space"] });
  const play = group.spaces.find((row) => row.name === "Play room");
  assert.ok(play);
  assert.deepEqual(play.amenities, ["books"]);
  assert.deepEqual(play.accessibility, ["quiet-space"]);
  group = await setListingSpacePhotos(sql, "manager", { daycareId: "qa", spaceId: play.id, photoSrcs: PHOTOS.slice(1, 5) });
  group = await saveListingSpace(sql, "owner", { daycareId: "qa", name: "Nap room", spaceType: "nap" });
  const nap = group.spaces.find((row) => row.name === "Nap room");
  group = await setListingSpacePhotos(sql, "owner", { daycareId: "qa", spaceId: nap.id, photoSrcs: [PHOTOS[4], PHOTOS[5]] });
  const reloaded = await listListingSpacesForCentre(sql, "owner", "qa");
  assert.equal(reloaded.photos.length, 10);
  assert.equal(reloaded.cover, PHOTOS[0]);
  assert.deepEqual(reloaded.spaces.find((row) => row.id === play.id).photos, PHOTOS.slice(1, 4));
  assert.deepEqual(reloaded.spaces.find((row) => row.id === nap.id).photos, [PHOTOS[4], PHOTOS[5]]);

  const renamed = await saveListingSpace(sql, "owner", { daycareId: "qa", id: play.id, name: "Art room", spaceType: "play", amenities: ["books", "art-materials"], accessibility: [] });
  assert.equal(renamed.spaces.find((row) => row.id === play.id).name, "Art room");
  assert.deepEqual(renamed.spaces.find((row) => row.id === play.id).photos, PHOTOS.slice(1, 4));

  await assert.rejects(() => deleteListingSpace(sql, "owner", { daycareId: "qa", spaceId: nap.id, confirm: false }), /Confirm room deletion/);
  const still = await listListingSpacesForCentre(sql, "owner", "qa");
  assert.equal(still.spaces.length, 2);

  const after = await deleteListingSpace(sql, "owner", { daycareId: "qa", spaceId: nap.id, confirm: true });
  assert.equal(after.spaces.some((row) => row.id === nap.id), false);
  assert.equal(after.photos.length, 10);
  assert.equal(after.cover, PHOTOS[0]);
  assert.equal(after.unassigned.includes(PHOTOS[4]), true);
  assert.equal(after.unassigned.includes(PHOTOS[5]), true);

  await assert.rejects(
    () => writeListingPhotoList(sql, "owner", { daycareId: "qa", photos: PHOTOS.slice(0, 9) }),
    /Confirm photo removal/,
  );
  const kept = await listListingSpacesForCentre(sql, "owner", "qa");
  assert.equal(kept.photos.length, 10);
});
