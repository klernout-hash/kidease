import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { placeChecklistSlot } from "../src/lib/checklist-slot.ts";

function fixture() {
  const el = { parentElement: null, isConnected: false, remove() { this.parentElement = null; this.isConnected = false; } };
  const reserve = { appendChild(node) { node.parentElement = this; node.isConnected = true; } };
  const page = { reserve: null, firstChild: null, querySelector() { return this.reserve; }, insertBefore(node) { node.parentElement = this; node.isConnected = true; } };
  return { el, reserve, page };
}
test("provider card waits for the desk slot instead of escaping above the column", () => {
  const { el, reserve, page } = fixture();
  placeChecklistSlot(page, el, true);
  assert.equal(el.isConnected, false);
  page.reserve = reserve;
  placeChecklistSlot(page, el, true);
  assert.equal(el.parentElement, reserve);
  placeChecklistSlot(page, el, true);
  assert.equal(el.parentElement, reserve);
  page.reserve = null;
  placeChecklistSlot(page, el, true);
  assert.equal(el.isConnected, false);
  page.reserve = reserve;
  placeChecklistSlot(page, el, true);
  assert.equal(el.parentElement, reserve);
});
test("parent setup keeps its existing page placement", () => {
  const { el, reserve, page } = fixture();
  page.reserve = reserve;
  placeChecklistSlot(page, el, false);
  assert.equal(el.parentElement, page);
});
test("portal observes late desk content and disconnects on cleanup", () => {
  const source = readFileSync(new URL("../src/components/first-run.tsx", import.meta.url), "utf8");
  assert.match(source, /new MutationObserver\(place\)/);
  assert.match(source, /observer.disconnect\(\)/);
  assert.match(source, /\[page, provider\]/);
});
