import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  FACEBOOK_PROFILE_URL,
  INSTAGRAM_PROFILE_URL,
  SOCIAL_PROFILES,
} from "../src/lib/social.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("public profile URLs are Kyle-confirmed Instagram and Facebook Page", () => {
  assert.equal(INSTAGRAM_PROFILE_URL, "https://www.instagram.com/kideasecanada/");
  assert.equal(FACEBOOK_PROFILE_URL, "https://www.facebook.com/KidEaseApp/");
  assert.doesNotMatch(FACEBOOK_PROFILE_URL, /facebook\.com\/Kidease\/?$/i);
  assert.doesNotMatch(FACEBOOK_PROFILE_URL, /107540987354875/);
  assert.equal(SOCIAL_PROFILES.length, 2);
  assert.equal(SOCIAL_PROFILES[0].href, INSTAGRAM_PROFILE_URL);
  assert.equal(SOCIAL_PROFILES[1].href, FACEBOOK_PROFILE_URL);
  assert.equal(SOCIAL_PROFILES[1].network, "facebook");
});

test("header Facebook button href is the Kyle-confirmed Page URL", () => {
  const header = src("src/components/header-social.tsx");
  const social = src("src/lib/social.ts");
  assert.match(header, /href=\{profile\.href\}/);
  assert.match(header, /SOCIAL_PROFILES/);
  assert.match(social, /FACEBOOK_PROFILE_URL = "https:\/\/www\.facebook\.com\/KidEaseApp\/"/);
  assert.doesNotMatch(social, /facebook\.com\/Kidease/);
  assert.doesNotMatch(social, /107540987354875/);
});

test("header wires website-only Facebook and Instagram buttons with a11y labels", () => {
  const header = src("src/components/header-social.tsx");
  const shell = src("src/components/shell.tsx");
  const copy = src("src/lib/copy.ts");
  const login = src("src/routes/login.tsx");
  assert.match(shell, /HeaderSocial/);
  assert.match(header, /SOCIAL_PROFILES/);
  assert.match(header, /target="_blank"/);
  assert.match(header, /rel="noopener noreferrer"/);
  assert.match(header, /t\(profile\.labelKey\)/);
  assert.match(header, /\[\[data-channel=website\]_&\]:flex/);
  assert.match(copy, /socialInstagram: "KidEase on Instagram"/);
  assert.match(copy, /socialFacebook: "KidEase on Facebook"/);
  assert.match(copy, /socialInstagram: "KidEase sur Instagram"/);
  assert.match(copy, /socialFacebook: "KidEase sur Facebook"/);
  assert.doesNotMatch(header, /signIn\.social|continueFacebook|FACEBOOK_APP_ID/);
  assert.match(login, /continueFacebook/);
});
