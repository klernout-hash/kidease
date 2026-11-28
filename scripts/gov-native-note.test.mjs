import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { govCopy, govNativeNoteLinks } from "../src/lib/gov/copy.ts";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("N-31 / P0-6: the app note uses Government wording in EN and FR, not Admin", () => {
  const en = govCopy("en");
  const fr = govCopy("fr");
  assert.equal(en.nativeTitle, "The Government desk is on the website");
  assert.equal(fr.nativeTitle, "Le bureau gouvernemental est sur le site web");
  assert.equal(en.nativeOpenWebsite, "Open kidease.ca");
  assert.equal(fr.nativeOpenWebsite, "Ouvrir kidease.ca");
  for (const copy of [en, fr]) {
    assert.doesNotMatch(copy.nativeTitle + copy.nativeBody, /admin/i);
  }
});

test("N-08: the note copy is device-neutral (no 'phone app' on tablets)", () => {
  for (const copy of [govCopy("en"), govCopy("fr")]) {
    assert.doesNotMatch(copy.nativeBody, /phone|téléphone/i);
    assert.doesNotMatch(copy.nativeTitle, /phone|téléphone/i);
  }
});

test("N-31: Open kidease.ca goes to the real desk; Sign out lands on the main sign-in page", () => {
  assert.deepEqual(govNativeNoteLinks("en"), {
    websiteUrl: "https://www.kidease.ca/gov",
    signOutTo: "/login",
  });
  assert.deepEqual(govNativeNoteLinks("fr"), {
    websiteUrl: "https://www.kidease.ca/fr/gov",
    signOutTo: "/fr/login",
  });
});

test("N-31 / N-62: the note opens the website outside the WebView and has one primary action", () => {
  const view = src("src/components/gov/gov-login.tsx");
  const note = view.slice(
    view.indexOf("export function GovNativeNote"),
    view.indexOf("export function GovClosedNote"),
  );
  assert.match(view, /await Browser\.open\(\{ url \}\)/);
  assert.match(note, /onClick=\{\(\) => void openGovWebsite\(links\.websiteUrl\)\}/);
  assert.match(note, /onClick=\{\(\) => void signOut\(links\.signOutTo\)\}/);
  assert.match(note, /data-ke="gov-native-sign-out"/);
  // Exactly one primary button: Sign out is the secondary variant.
  assert.equal((note.match(/<Button\b/g) || []).length, 2);
  assert.equal((note.match(/variant="secondary"/g) || []).length, 1);
  // No parent or daycare home link while signed in.
  assert.doesNotMatch(note, /<Link to="\/"/);
  assert.match(note, /env\(safe-area-inset-top\)/);
  assert.match(note, /min-h-dvh/);
});

test("N-31: every Gov route in the shell still shows this one note", () => {
  assert.match(
    src("src/components/gov/gov-desk-route.tsx"),
    /gate\.nativeOnly \|\| !data\) return <GovNativeNote/,
  );
  assert.match(
    src("src/routes/gov.tsx"),
    /if \(gate\.nativeOnly \|\| !data\) return <GovNativeNote locale="en" \/>/,
  );
  assert.match(
    src("src/routes/gov_.login.tsx"),
    /if \(native\) return <GovNativeNote locale="en" \/>/,
  );
});
