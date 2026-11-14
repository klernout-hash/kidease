import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const file = ts.createSourceFile("shell.tsx", readFileSync(new URL("../src/components/shell.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let trigger;
function visit(node) {
  if (ts.isJsxOpeningElement(node) && node.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(file) === "aria-controls" && attribute.initializer?.text === "ke-nav-drawer")) trigger = node;
  ts.forEachChild(node, visit);
}
visit(file);
const attribute = (name) => trigger.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText(file) === name);

test("desktop Menu has a native locale-aware link fallback, with link keyboard semantics", () => {
  assert.ok(trigger);
  assert.equal(trigger.tagName.getText(file), "a");
  const href = attribute("href").initializer.expression;
  assert.equal(href.expression.getText(file), "localePath");
  assert.equal(href.arguments[0].text, "/menu");
  assert.equal(href.arguments[1].getText(file), "locale");
  assert.equal(attribute("role"), undefined);
  assert.equal(attribute("onKeyDown"), undefined);
  assert.equal(attribute("data-ke").initializer.text, "menu-trigger");
});

function clickEvent(overrides = {}) {
  const result = { prevented: 0, stopped: 0, opened: [] };
  const event = {
    button: 0, defaultPrevented: false, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
    preventDefault() { result.prevented++; }, stopPropagation() { result.stopped++; }, ...overrides,
  };
  const handlerSource = attribute("onClick").initializer.expression.getText(file);
  const handler = new Function("setOpen", `return (${handlerSource});`)((open) => result.opened.push(open));
  handler(event);
  return result;
}

test("hydrated primary click opens the drawer and prevents native navigation", () => {
  assert.deepEqual(clickEvent(), { prevented: 1, stopped: 1, opened: [true] });
});

test("modified, non-primary and already handled clicks retain native anchor behavior", () => {
  for (const overrides of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { button: 2 }, { defaultPrevented: true }]) {
    assert.deepEqual(clickEvent(overrides), { prevented: 0, stopped: 0, opened: [] }, JSON.stringify(overrides));
  }
});
