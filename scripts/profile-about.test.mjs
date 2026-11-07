import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { cleanProfileAbout } from "../src/lib/profile-about.ts";

test("about you keeps only short text the person typed", () => {
  const about = cleanProfileAbout({
    work: "  Teacher  ",
    education: "x".repeat(200),
    pets: "One dog",
    languages: "English, French",
    interests: "Music",
    region: "Winnipeg",
    identityVerified: true,
    role: "admin",
  });
  assert.equal(about.work, "Teacher");
  assert.equal(about.education.length, 80);
  assert.equal("identityVerified" in about, false);
  assert.equal("role" in about, false);
  assert.deepEqual(cleanProfileAbout(null), {
    work: "",
    education: "",
    pets: "",
    languages: "",
    interests: "",
    region: "",
  });
});

test("about you is private account UI and does not grant a verified badge", () => {
  const form = readFileSync(new URL("../src/components/about-you-form.tsx", import.meta.url), "utf8");
  const server = readFileSync(new URL("../src/lib/server/profile-about.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../migrations/0180_profile_about.sql", import.meta.url), "utf8");
  assert.match(form, /data-ke="about-you"/);
  assert.match(form, /does not add a verified badge/);
  assert.match(server, /authMiddleware/);
  assert.match(server, /identityVerified: false/);
  assert.match(server, /select d.slug, d.name, d.city, d.province/);
  assert.doesNotMatch(server, /date_of_birth|child_profiles|address/);
  assert.match(form, /data-ke="about-you-cancel"/);
  assert.match(form, /data-ke="about-centre-card"/);
  assert.match(form, /ProfileAvatar/);
  assert.doesNotMatch(server, /set role =/);
  assert.match(migration, /about jsonb/);
  assert.doesNotMatch(readFileSync(new URL("../src/routes/daycare.$slug.tsx", import.meta.url), "utf8"), /AboutYouForm/);
});
