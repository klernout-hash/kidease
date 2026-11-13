import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import { Heart, Share2, Check } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function component(path, name, dependencies) {
  const source = ts.createSourceFile(path, readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, "Execute the actual component body");
  const javascript = ts.transpileModule(`${declaration.getText(source)}\nglobalThis.Component = ${name};`, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = vm.createContext({ exports: {}, require: (specifier) => {
    assert.equal(specifier, "react/jsx-runtime"); return jsxRuntime;
  }, cn: (...args) => twMerge(clsx(args)), useCopy: () => ({ t: (key) => key, locale: "en" }), ...dependencies });
  new vm.Script(javascript, { filename: path }).runInContext(context);
  return context.Component;
}
function classes(markup, tag) {
  return markup.match(new RegExp(`<${tag}[^>]*class="([^"]*)"`))?.[1] ?? "";
}
function includesClass(value, name) { return value.split(/\s+/).includes(name); }

function share({ foreground, feedback = null } = {}) {
  const ShareControl = component("src/components/share-button.tsx", "ShareControl", {
    useState: () => [feedback, () => {}], Check, Share2,
  });
  return renderToStaticMarkup(createElement(ShareControl, {
    payload: {}, label: "Share", ariaLabel: "Share listing", appearance: "photo", className: foreground,
  }));
}
function save({ signedIn = false, saved = false, framed = false, foreground } = {}) {
  let stateIndex = 0;
  const SaveListingButton = component("src/components/save-listing-button.tsx", "SaveListingButton", {
    useState: () => [stateIndex++ === 0 ? saved : false, () => {}], useEffect: () => {},
    useNavigate: () => () => { throw new Error("No navigation or data actions during render"); },
    useCurrentUserState: () => ({ user: signedIn ? { id: "local-reader" } : null, isPending: false }),
    useRouterState: ({ select }) => select({ location: { pathname: "/daycare/local-fixture", searchStr: "" } }),
    guestSaveHref: () => "/login?intent=save", Heart, HEART_SAVED: "#FF385C",
  });
  return renderToStaticMarkup(createElement(SaveListingButton, { daycareId: "local-fixture", appearance: "photo", framed, className: foreground }));
}

test("photo Share and success feedback inherit an overridden token foreground", () => {
  for (const feedback of [null, "Link copied"]) {
    const markup = share({ foreground: "bg-surface/95 text-fg", feedback });
    assert.equal(includesClass(classes(markup, "button"), "text-fg"), true);
    assert.equal(includesClass(classes(markup, "button"), "text-white"), false);
    assert.equal(includesClass(classes(markup, "svg"), "text-current"), true);
    assert.equal(includesClass(classes(markup, "svg"), "text-white"), false);
    assert.match(markup, /aria-label="(?:Share listing|Link copied)"/);
  }
  assert.equal(includesClass(classes(share(), "button"), "text-white"), true, "Default photo overlays retain their white foreground");
});

test("guest and signed-in unsaved photo hearts inherit caller foreground with framed and plain controls", () => {
  for (const signedIn of [false, true]) {
    for (const framed of [false, true]) {
      const markup = save({ signedIn, framed, foreground: "bg-surface/95 text-fg" });
      assert.equal(includesClass(classes(markup, signedIn ? "button" : "a"), "text-fg"), true);
      assert.equal(includesClass(classes(markup, "svg"), "text-current"), true);
      assert.equal(includesClass(classes(markup, "svg"), "text-white"), false);
      assert.match(markup, /aria-label="save"/);
      if (signedIn) assert.match(markup, /aria-pressed="false"/);
      else assert.match(markup, /href="\/login\?intent=save"/);
    }
  }
});

test("default photo wrappers and saved heart state retain their existing distinct behavior", () => {
  for (const signedIn of [false, true]) {
    assert.equal(includesClass(classes(save({ signedIn }), signedIn ? "button" : "a"), "text-white"), true);
    const framed = save({ signedIn, framed: true });
    assert.equal(includesClass(classes(framed, signedIn ? "button" : "a"), "bg-surface"), true);
    assert.equal(includesClass(classes(framed, signedIn ? "button" : "a"), "text-fg"), true);
  }
  for (const framed of [false, true]) {
    const markup = save({ signedIn: true, saved: true, framed, foreground: "bg-surface/95 text-fg" });
    assert.match(markup, /aria-pressed="true"/);
    assert.match(markup, /aria-label="unsave"/);
    assert.match(markup, /fill="#FF385C"/);
    assert.equal(includesClass(classes(markup, "svg"), "text-[#FF385C]"), true);
  }
});
