import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { englishAliasPath, localeSwitchHref } from "../src/lib/locale-path.ts";

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("a language change clears a previous explicit query choice and keeps desk filters", () => {
  assert.equal(localeSwitchHref("/fr/parent", "?tab=family&lang=fr", "en"), "/parent?tab=family");
  assert.equal(localeSwitchHref("/parent", "?lang=ar&tab=family", "en"), "/parent?tab=family");
  assert.equal(localeSwitchHref("/fr/menu", "?screen=language", "ar"), "/menu?screen=language");
  assert.equal(localeSwitchHref("/menu", "?screen=language", "en"), null);
});

test("both language controls use the same preference update, and the picker uses a managed dialog", () => {
  const select = source("src/components/language-select.tsx");
  const screen = source("src/components/airbnb-screens.tsx");
  assert.match(select, /setLocale\(next, \{ lock: true \}\);\s+applyDocumentLocale\(next\)/);
  assert.match(select, /await saveMyLocale[\s\S]*window.location.assign\(dest\)/);
  assert.match(screen, /useLanguageChoice\(\)/);
  assert.match(screen, /locale = appliedLocale \?\? activeLocale/);
  assert.match(select, /value=\{appliedLocale \?\? locale\}/);
  assert.match(screen, /<Dialog.Trigger[\s\S]*<Dialog.Content[\s\S]*<Dialog.Title[\s\S]*<Dialog.Close/);
  assert.match(screen, /lang.code === "ar" \? beta/);
});

test("English aliases strip only the leading English prefix", () => {
  assert.equal(englishAliasPath("/en"), "/");
  assert.equal(englishAliasPath("/en/"), "/");
  assert.equal(englishAliasPath("/en//search"), "/search");
  assert.equal(englishAliasPath("/en/daycare/example"), "/daycare/example");
  assert.equal(englishAliasPath("/enrolment"), null);
  assert.equal(englishAliasPath("/fr/en"), null);
  assert.match(source("src/server.ts"), /englishAliasRedirect\(request\) \?\? signinRedirect\(request\)/);
});

test("store download panel is hidden in every native runtime", () => {
  const css = source("src/styles.css");
  for (const runtime of ["ios", "android", "native"]) {
    assert.ok(css.includes(`html[data-runtime="${runtime}"] [data-ke="app-store-status"]`));
  }
});
