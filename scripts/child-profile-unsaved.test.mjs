import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { emptyChild } from "../src/lib/child-profile.ts";
import { childProfileHasChanges, completedChildProfileSearch, confirmChildProfileDiscard } from "../src/lib/child-profile-unsaved.ts";

const src = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("child editor guards reload and internal desk exits without persisting health fields", () => {
  const form = src("src/components/child-profile-form.tsx");
  const desk = src("src/components/parent-desk.tsx");
  assert.ok(/onDirtyChange/.test(form), "form reports current dirty state");
  assert.ok(/useBlocker/.test(desk), "router navigation is guarded");
  assert.ok(/enableBeforeUnload/.test(desk), "native reload is guarded");
  assert.ok(/confirmChildProfileDiscard/.test(desk), "internal child exits ask before discarding");
  assert.ok(/data-ke="child-share-centre"[^\n]*min-h-\[44px\]/.test(desk), "full saved-centre label is at least44px");
  assert.doesNotMatch(form, /localStorage|sessionStorage|indexedDB/);
});


const snapshot = () => ({
  draft: { ...emptyChild(), name: "Synthetic Rowan", birthdate: "2023-05-14" },
  contacts: [{ name: "Synthetic Guardian", phone: "2045550100", relationship: "Parent", note: "", restricted: false }],
});

test("unchanged clones and reordered fields are clean; edits and reverts follow saved values", () => {
  const initial = snapshot();
  assert.equal(childProfileHasChanges(initial, structuredClone(initial)), false);
  assert.equal(childProfileHasChanges(initial, {
    draft: Object.fromEntries(Object.entries(initial.draft).reverse()),
    contacts: structuredClone(initial.contacts),
  }), false);
  for (const [field, changed] of [["name", "Synthetic Edit"], ["allergies", "Synthetic note"], ["photoOk", true], ["immunizationStatus", "current"]]) {
    const current = structuredClone(initial);
    current.draft[field] = changed;
    assert.equal(childProfileHasChanges(initial, current), true, field);
    current.draft[field] = initial.draft[field];
    assert.equal(childProfileHasChanges(initial, current), false, `${field} reverted`);
  }
});

test("pickup additions, restrictions, notes and removal also protect unsaved care information", () => {
  const initial = snapshot();
  for (const mutate of [
    (current) => current.contacts.push({ name: "Synthetic Other", phone: "", relationship: "", note: "", restricted: false }),
    (current) => { current.contacts[0].restricted = true; },
    (current) => { current.contacts[0].note = "Synthetic restriction"; },
    (current) => current.contacts.pop(),
  ]) {
    const current = structuredClone(initial);
    mutate(current);
    assert.equal(childProfileHasChanges(initial, current), true);
  }
});

test("clean exits need no prompt; dirty exits require the explicit discard choice in EN/FR", () => {
  assert.equal(confirmChildProfileDiscard(false, false, () => { throw new Error("Clean form must not prompt"); }), true);
  const messages = [];
  assert.equal(confirmChildProfileDiscard(true, false, (message) => { messages.push(message); return false; }), false);
  assert.equal(confirmChildProfileDiscard(true, true, (message) => { messages.push(message); return true; }), true);
  assert.match(messages[0], /without saving.*lost/);
  assert.match(messages[1], /sans enregistrer.*perdus/);
});


test("completed child editor clears only its entry intent and preserves other search state", () => {
  const previous = Object.freeze({ tab: "children", child: "new", focus: "name", preview: "support", custom: "preserve-me" });
  const next = completedChildProfileSearch(previous);
  assert.deepEqual(next, { tab: "children", preview: "support", custom: "preserve-me" });
  assert.equal(previous.child, "new", "search updater must not mutate router state");
  assert.deepEqual(completedChildProfileSearch({ tab: "children" }), { tab: "children" });
});

test("saved child selects its authoritative id and does not reapply completed editor intent on family refresh", () => {
  const form = src("src/components/child-profile-form.tsx");
  const desk = src("src/components/parent-desk.tsx");
  assert.ok(/onSaved\(child\.id\)/.test(form), "actual saved child id reaches its parent");
  assert.ok(/appliedChildIntent\.current === locationHref/.test(desk), "same-location family refresh cannot reopen a consumed form");
  assert.ok(/setChildFocus\(childId \?\? null\)/.test(desk), "saved child is selected for the next step");
  assert.ok(/search: \(current\) => completedChildProfileSearch\(current\),\s*replace: true/.test(desk), "completed child/focus intent is replaced without adding a back entry");
  assert.ok(/ChildHealthLog key=\{`\$\{user.id\}:\$\{childHealthVersion\}`\}/.test(desk), "independent saved-health read refreshes after profile mutation");
  assert.ok(/onDeleted=\{\(\) => \{ void finishChildEdit\(\); \}\}/.test(desk), "card deletion also refreshes saved family and health facts without selecting a deleted child");
});
