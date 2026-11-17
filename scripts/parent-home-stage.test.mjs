import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { parentDeskPath } from "../src/lib/desk-nav.ts";
import { stripLocalePrefix } from "../src/lib/locale-path.ts";
import { withTimeout } from "../src/lib/timeout.ts";
import { parentHomeStage } from "../src/lib/parent-home-stage.ts";
import { renderParentHomeFixture } from "./fixtures/parent-home.mjs";

test("family stage waits for actual bookings and accepts only enrollment statuses", () => {
  assert.equal(parentHomeStage([{ status: "active" }], false), "pending");
  assert.equal(parentHomeStage([], true), "searching");
  for (const status of ["accepted", "active"])
    assert.equal(parentHomeStage([{ status }], true), "enrolled");
  for (const status of ["pending", "requested", "cancelled", "declined", "enrolled", "completed"])
    assert.equal(parentHomeStage([{ status }], true), "searching");
  assert.equal(parentHomeStage([{ status: "pending" }, { status: "active" }], true), "enrolled");
});

function ordered(html, markers) {
  const indexes = markers.map((marker) => html.indexOf(`data-ke="${marker}"`));
  indexes.forEach((index, i) =>
    assert.ok(
      index >= 0 && (i === 0 || index > indexes[i - 1]),
      `${markers[i]} follows ${markers[i - 1]}`,
    ),
  );
}

test("actual EN/FR home markup puts care and bills first for enrolled families, retaining sibling search", () => {
  for (const locale of ["en", "fr"]) {
    const html = renderParentHomeFixture({ locale });
    ordered(html, [
      "parent-home-care",
      "attention-list",
      "parent-home-bills",
      "parent-home-matches",
      "parent-home-waiting",
      "parent-home-saved",
      "parent-home-search",
    ]);
    assert.match(html, /Synthetic Avery/);
    assert.match(html, /\?tab=care/);
    assert.match(html, /\?tab=payments/);
    assert.match(html, new RegExp(`action="${locale === "fr" ? "/fr" : ""}/search"`));
    assert.equal((html.match(/bg-primary text-primary-fg/g) ?? []).length, 1);
    assert.doesNotMatch(html, /ECE|findDaycareJobs/);
  }
});

test("searching families see matches, applications and tours before attention and saved centres", () => {
  for (const locale of ["en", "fr"]) {
    const html = renderParentHomeFixture({ locale, stage: "searching" });
    ordered(html, [
      "parent-home-matches",
      "parent-home-waiting",
      "attention-list",
      "parent-home-saved",
    ]);
    assert.doesNotMatch(html, /data-ke="parent-home-care"/);
    assert.match(html, new RegExp(`href="${locale === "fr" ? "/fr" : ""}/search"`));
  }
});

test("pending, failed family and failed extras never claim empty requests or bills", () => {
  for (const locale of ["en", "fr"]) {
    for (const stage of ["pending", "error"]) {
      const html = renderParentHomeFixture({ locale, stage });
      assert.doesNotMatch(html, /data-ke="parent-home-(saved|waiting|bills|care)"/);
      assert.match(html, stage === "error" ? /role="alert"/ : /role="status"/);
      if (stage === "error") assert.match(html, /Try again|Réessayer/);
    }
    const failed = renderParentHomeFixture({ locale, extrasState: "error" });
    assert.match(failed, /Some requests or bills could not load|pas toutes été chargées/);
    assert.doesNotMatch(failed, /No open bills|Aucune facture ouverte/);
  }
});

test("actual parent route withholds another viewer's saved seed and keeps its 2FA gate", async () => {
  const source = readFileSync(new URL("../src/routes/parent.tsx", import.meta.url), "utf8");
  const require = createRequire(import.meta.url);
  const dependencies = Object.fromEntries(
    [...source.matchAll(/from "(@\/[^";]+)"/g)].map((match) => [match[1], {}]),
  );
  const gate = () => null;
  let viewer = "viewer-a";
  const seed = {
    viewerId: viewer,
    saved: [{ id: "private-saved-centre", callNote: "Synthetic private note" }],
    shortlistShared: true,
  };
  let readFamily = async () => seed;
  Object.assign(dependencies, {
    "@tanstack/react-router": {
      createFileRoute: () => (options) => options,
      useRouterState: ({ select }) => select({ location: { pathname: "/parent" } }),
    },
    "@/lib/use-copy": { useCopy: () => ({ locale: "en", t: (key) => key }) },
    "@/lib/auth/use-current-user": {
      useCurrentUserState: () => ({ user: { id: viewer }, isPending: false }),
      useLocallySignedOut: () => false,
    },
    "@/components/role-chrome": { useRoleChrome: () => ({ pending: false, signedIn: true }) },
    "@/components/desk-switcher": {
      useSessionDesks: () => ({ ready: true, session: { role: "parent" } }),
    },
    "@/lib/use-native-shell": { useNativeHidesAdmin: () => false },
    "@/lib/locale-path": { stripLocalePrefix },
    "@/lib/desk-nav": { parentDeskPath },
    "@/lib/auth/gates": { TwoFactorGate: gate },
    "@/lib/server/family": { getFamily: () => readFamily() },
    "@/lib/timeout": { LOADER_SETTLE_MS: 20, withTimeout },
  });
  const module = { exports: {} };
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new vm.Script(code).runInNewContext({
    module,
    exports: module.exports,
    require: (name) => dependencies[name] ?? require(name),
  });
  const { parentLoader, ParentDeskPage } = module.exports;
  const loaded = await parentLoader();
  const findDesk = (node) => {
    if (!node || typeof node !== "object") return null;
    if (node.props && Object.hasOwn(node.props, "initialSaved")) return node;
    return [node.props?.children].flat(Infinity).map(findDesk).find(Boolean);
  };
  const own = ParentDeskPage({ loaded, search: {} });
  assert.equal(own.type, gate);
  assert.equal(findDesk(own).props.initialSaved, seed.saved);
  viewer = "viewer-b";
  const switched = ParentDeskPage({ loaded, search: {} });
  assert.equal(switched.type, gate);
  assert.equal(findDesk(switched).key, viewer);
  assert.equal(findDesk(switched).props.initialSaved.length, 0);
  assert.equal(findDesk(switched).props.initialShared, false);
  readFamily = async () => {
    throw new Error("Synthetic family failure");
  };
  assert.equal((await parentLoader()).viewerId, null);
  readFamily = () => new Promise(() => {});
  assert.equal((await parentLoader()).saved.length, 0);
});
