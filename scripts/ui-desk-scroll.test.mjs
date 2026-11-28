import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("standard desk sidebar scrolls inside the available viewport below the header", () => {
  const shell = readFileSync(new URL("../src/components/desk-shell.tsx", import.meta.url), "utf8");
  const aside = shell.match(/<aside className=\{cn\(([^\n]*)/)?.[1];
  assert.match(aside, /md:overflow-y-auto/);
  assert.match(aside, /md:sticky/);
  assert.match(aside, /100dvh-var\(--ke-header-h,3\.5rem\)-var\(--ke-view-as-h,0px\)-var\(--ke-safe-bottom,0px\)-var\(--ke-desk-bottom,0px\)/);
  assert.match(aside, /--ke-desk-bottom:4\.75rem/);
});

test("parent menus expose Family home and one Payments destination across layouts", () => {
  const wide = readFileSync(new URL("../src/components/app-menu-screen.tsx", import.meta.url), "utf8");
  const phone = readFileSync(new URL("../src/components/phone-category-menu.tsx", import.meta.url), "utf8");
  assert.match(wide, /!parentMenu \? \(\s*<MenuRow[^\n]*screen: "payments"/);
  assert.match(wide, /parentMenu \? <MenuRow[^\n]*tab: "payments"/);
  assert.match(wide, /parentDeskPath\(pathname\)[^\n]*marker="family-home"/);
  assert.match(phone, /"Family home", fr: "Accueil de la famille"[^\n]*to: parent/);
  assert.match(phone, /"Payments", fr: "Paiements"[^\n]*tab: "payments"/);
});

test("listing photo stack stays inside its frame and the editor tabs stay on one line", () => {
  const desk = readFileSync(new URL("../src/components/host-listing-desk.tsx", import.meta.url), "utf8");
  assert.match(desk, /h-48 overflow-hidden[^\n]*data-ke="photo-tour-stack"/);
  assert.match(desk, /absolute bottom-0[^\n]*top:/);
  assert.match(desk, /h-full w-full rounded-2xl object-cover/);
  assert.match(desk, /role="tablist"[^\n]*overflow-x-auto/);
  assert.match(desk, /role="tab"[\s\S]*whitespace-nowrap/);
});

test("the phone menu gives guests and signed-in users the existing appearance selector", () => {
  const phone = readFileSync(new URL("../src/components/phone-category-menu.tsx", import.meta.url), "utf8");
  assert.match(phone, /\)\)\}\s*<div[^\n]*data-ke="phone-appearance"[\s\S]*<AppearanceControl variant="select"\s*\/>/);
});

test("family documents read on mount and use a bilingual button for file selection", () => {
  const vault = readFileSync(new URL("../src/components/family-vault.tsx", import.meta.url), "utf8");
  const load = vault.slice(vault.indexOf("const load = useCallback"), vault.indexOf("async function onUpload"));
  assert.match(load, /fetch\("\/api\/family-documents", \{ credentials: "same-origin", cache: "no-store" \}\)/);
  assert.doesNotMatch(load, /POST|familyDocsFailed|toast\.error/);
  assert.match(vault, /fileInput.current\?\.click\(\)/);
  assert.match(vault, /"Choisir un fichier" : "Choose a file"/);
  assert.match(vault, /loadFailed \? \([\s\S]*role="alert"[\s\S]*onClick=\{\(\) => void load\(\)\}/);
});
