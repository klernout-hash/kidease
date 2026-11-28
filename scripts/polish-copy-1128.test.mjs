import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { airbnbCopy } from "../src/lib/airbnb-ui-copy.ts";
import { govCopy } from "../src/lib/gov/copy.ts";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("N-26: one sign-out label (EN Sign out / FR Déconnexion)", () => {
  assert.equal(airbnbCopy("en").signOut, "Sign out");
  assert.equal(airbnbCopy("fr").signOut, "Déconnexion");
  assert.equal(govCopy("en").signOut, "Sign out");
  assert.equal(govCopy("fr").signOut, "Déconnexion");
  const fr = src("src/lib/copy-fr.ts");
  assert.match(fr, /signOut: "Déconnexion",/);
  assert.match(fr, /devicesSignOutOne: "Déconnexion",/);
  assert.match(fr, /devicesSignOutEverywhere: "Déconnexion partout",/);
  for (const file of ["src/lib/copy-en.ts", "src/lib/airbnb-ui-copy.ts", "src/lib/gov/copy.ts"]) {
    assert.doesNotMatch(src(file), /"Log out"/, file);
  }
  assert.doesNotMatch(src("src/lib/gov/copy.ts"), /Fermer la session/);
});

test("N-49: the Parent desk has no internal switch wording", () => {
  for (const file of ["src/components/parent-home-care.tsx", "src/components/parent-arrival-line.tsx"]) {
    const text = src(file);
    assert.doesNotMatch(text, /not turned on/i, file);
    assert.doesNotMatch(text, /n'est pas activé|ne sont pas activés|ne sont pas ouvertes/, file);
  }
  assert.match(src("src/components/parent-arrival-line.tsx"), /Arrival times are not available yet\./);
  assert.match(src("src/components/parent-arrival-line.tsx"), /Les heures d’arrivée ne sont pas encore offertes\./);
});

test("N-71: the skip link stays out of the native shells", () => {
  assert.match(src("src/routes/__root.tsx"), /<SkipLink enabled=\{a11yPass && !nativeShell\} \/>/);
  assert.match(src("src/components/skip-link.tsx"), /data-ke="skip-link"/);
  const css = src("src/styles.css");
  for (const runtime of ["ios", "android", "native"]) {
    assert.match(css, new RegExp(`html\\[data-runtime="${runtime}"\\] \\[data-ke="skip-link"\\]`));
  }
  assert.match(css, /\[data-ke="skip-link"\] \{\s*display: none !important;/);
});
