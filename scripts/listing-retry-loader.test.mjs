import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/routes/daycare.$slug.tsx", import.meta.url), "utf8");
const start = source.indexOf("export function ListingRetryPage(");
const end = source.indexOf("export function Listing()", start);
assert.ok(start > 0 && end > start);
const compiled = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

test("listing Retry reloads route data instead of only resetting a React boundary", () => {
  let reloads = 0;
  const module = { exports: {} };
  const router = { invalidate: () => { reloads++; return Promise.resolve(); } };
  const Shell = () => null;
  const EmptyState = () => null;
  new Function("require", "module", "exports", "useCopy", "useRouter", "Shell", "EmptyState", compiled)(
    require, module, module.exports, () => ({ t: (key) => key }), () => router, Shell, EmptyState,
  );
  const tree = module.exports.ListingRetryPage();
  const state = tree.props.children.props.children;
  assert.equal(state.type, EmptyState);
  assert.equal(state.props.action, "tryAgain");
  assert.equal(state.props.secondaryTo, "/search", "The existing search escape remains available");
  state.props.onAction();
  state.props.onAction();
  assert.equal(reloads, 2, "Each explicit attempt asks the router to reload its loader");
});
