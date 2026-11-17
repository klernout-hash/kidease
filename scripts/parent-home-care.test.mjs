import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { attendanceCopy } from "../src/lib/attendance-handoff.ts";
import { isEnrolledBookingStatus } from "../src/lib/daily-care.ts";
import { parentDeskPath } from "../src/lib/desk-nav.ts";
import { centreClockLabel } from "../src/lib/parent-arrival.ts";
import { parentHomeCareRows } from "../src/lib/parent-home-care.ts";
import { withTimeout } from "../src/lib/timeout.ts";
import { en } from "../src/lib/copy-en.ts";
import { fr } from "../src/lib/copy-fr.ts";

const require = createRequire(import.meta.url);
const booking = {
  id: "booking-a",
  status: "accepted",
  daycareId: "centre-a",
  daycareName: "Synthetic Centre",
  childName: "Synthetic Avery",
};
const attendance = {
  bookingId: booking.id,
  childName: booking.childName,
  daycareName: booking.daycareName,
  localDay: "2026-11-16",
  timeZone: "America/Winnipeg",
  status: "here",
  events: [{ id: "event-a", action: "check_in", at: "2026-11-16T14:00:00Z" }],
  lastUpdated: null,
};
const journal = {
  id: "note-a",
  bookingId: booking.id,
  daycareId: booking.daycareId,
  day: attendance.localDay,
  body: "A saved synthetic note.",
  createdAt: "2026-11-16T16:00:00Z",
};
const snapshot = (overrides = {}) => ({
  attendanceEnabled: true,
  journalsEnabled: true,
  attendance: [attendance],
  journals: [journal],
  ...overrides,
});

function component(locale = "en", overrides = {}) {
  const dependencies = {
    "@/components/ui/button": {
      Button: ({ children, variant: _variant, ...props }) =>
        createElement("button", props, children),
    },
    "@/lib/attendance-handoff": { attendanceCopy },
    "@/lib/daily-care": { isEnrolledBookingStatus },
    "@/lib/desk-nav": { parentDeskPath },
    "@/lib/parent-arrival": { centreClockLabel },
    "@/lib/parent-home-care": { parentHomeCareRows },
    "@/lib/server/child-checkin": {
      listMyChildAttendance: async () => ({ enabled: true, children: [attendance] }),
    },
    "@/lib/server/daily-care": { listDailyJournals: async () => ({ items: [journal] }) },
    "@/lib/server/desk-features": { loadDeskFeatureFlags: async () => ({ dailyLogs: true }) },
    "@/lib/timeout": { LOADER_SETTLE_MS: 10, withTimeout },
    "@/lib/use-copy": { useCopy: () => ({ locale, t: (key) => (locale === "fr" ? fr : en)[key] }) },
    "@tanstack/react-router": {
      useRouterState: ({ select }) =>
        select({ location: { pathname: locale === "fr" ? "/fr/parent" : "/parent" } }),
      Link: ({ to, search, children, ...props }) =>
        createElement("a", { ...props, href: `${to}?${new URLSearchParams(search)}` }, children),
    },
    ...overrides,
  };
  const module = { exports: {} };
  const javascript = ts.transpileModule(
    readFileSync(new URL("../src/components/parent-home-care.tsx", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  new vm.Script(javascript).runInNewContext({
    module,
    exports: module.exports,
    require: (name) => dependencies[name] ?? require(name),
  });
  return module.exports;
}

test("care snapshot joins only enrolled booking IDs, centres and centre-local days", () => {
  const rows = parentHomeCareRows(
    [booking, { ...booking, id: "requested", status: "requested" }],
    snapshot({
      journals: [
        journal,
        { ...journal, id: "newest", body: "Latest saved note", createdAt: "2026-11-16T17:00:00Z" },
        {
          ...journal,
          id: "wrong-booking",
          bookingId: "foreign",
          createdAt: "2026-11-16T18:00:00Z",
        },
        {
          ...journal,
          id: "name-only",
          bookingId: null,
          childName: booking.childName,
          createdAt: "2026-11-16T18:00:00Z",
        },
        { ...journal, id: "wrong-centre", daycareId: "foreign", createdAt: "2026-11-16T18:00:00Z" },
        { ...journal, id: "utc-day", day: "2026-11-17", createdAt: "2026-11-17T01:00:00Z" },
        { ...journal, id: "invalid-date", createdAt: "invalid" },
        { ...journal, id: "empty", body: "  ", createdAt: "2026-11-16T18:00:00Z" },
      ],
    }),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].journal.id, "newest");
  assert.equal(
    parentHomeCareRows([booking], snapshot({ journalsEnabled: false }))[0].journal,
    undefined,
  );
  assert.equal(parentHomeCareRows([booking], snapshot({ attendance: [] }))[0].journal, undefined);
});

for (const locale of ["en", "fr"]) {
  test(`${locale} care content distinguishes confirmation, disabled features, missing scope, error and pending`, () => {
    const { ParentHomeCareContent } = component(locale);
    const render = (state) =>
      renderToStaticMarkup(
        createElement(ParentHomeCareContent, { bookings: [booking], state, onRetry: () => {} }),
      );
    const ready = render({ kind: "ready", snapshot: snapshot() });
    assert.ok(ready.includes(attendanceCopy(locale).here));
    assert.ok(ready.includes(journal.body));
    assert.match(ready, /<time dateTime="2026-11-16">/);
    assert.match(ready, new RegExp(`href="${locale === "fr" ? "/fr" : ""}/parent\\?tab=care"`));
    const unconfirmed = render({
      kind: "ready",
      snapshot: snapshot({ attendance: [{ ...attendance, events: [], status: "expected" }] }),
    });
    assert.ok(unconfirmed.includes((locale === "fr" ? fr : en).careNoArrivalConfirmed));
    assert.ok(!unconfirmed.includes(`>${attendanceCopy(locale).expected}<`));
    const disabled = render({
      kind: "ready",
      snapshot: snapshot({ attendanceEnabled: false, journalsEnabled: false }),
    });
    assert.ok(!disabled.includes(`>${attendanceCopy(locale).here}<`));
    assert.ok(!disabled.includes(journal.body));
    const missing = render({ kind: "ready", snapshot: snapshot({ attendance: [] }) });
    assert.ok(missing.includes(locale === "fr" ? "sur ce compte" : "on this account"));
    assert.ok(!missing.includes(journal.body));
    assert.ok(!missing.includes(`>${attendanceCopy(locale).here}<`));
    assert.match(render({ kind: "error" }), /role="alert"[\s\S]*<button/);
    assert.match(render({ kind: "loading" }), /aria-busy="true"[\s\S]*role="status"/);
    const sibling = { ...booking, id: "booking-b", childName: "Synthetic Quinn" };
    const waiting = renderToStaticMarkup(
      createElement(ParentHomeCareContent, {
        bookings: [booking, sibling],
        state: { kind: "loading" },
        onRetry: () => {},
      }),
    );
    assert.equal((waiting.match(/data-ke="parent-home-care-child"/g) ?? []).length, 2);
    assert.ok(waiting.includes(booking.childName) && waiting.includes(sibling.childName));
    const longBody = "Synthetic full journal note. ".repeat(50);
    const excerpt = render({
      kind: "ready",
      snapshot: snapshot({ journals: [{ ...journal, body: longBody }] }),
    });
    assert.ok(
      excerpt.includes(longBody),
      "The visual excerpt keeps the full note available to assistive technology",
    );
    assert.ok(excerpt.includes(locale === "fr" ? "aperçu" : "preview"));
  });
}

function effectsHarness(overrides = {}) {
  const effects = [];
  const updates = [];
  const { ParentHomeCare } = component("en", {
    react: {
      ...React,
      useMemo: (fn) => fn(),
      useEffect: (fn) => effects.push(fn),
      useState: (initial) => [initial, (value) => updates.push(value)],
    },
    ...overrides,
  });
  ParentHomeCare({ bookings: [booking], userId: "synthetic-parent" });
  return { run: () => effects[0](), updates };
}

test("home uses each accessible child's local day and restricts journal requests to enrolled bookings", async () => {
  const calls = [];
  const harness = effectsHarness({
    "@/lib/server/child-checkin": {
      listMyChildAttendance: async () => ({
        enabled: true,
        children: [attendance, { ...attendance, bookingId: "foreign" }],
      }),
    },
    "@/lib/server/daily-care": {
      listDailyJournals: async (input) => {
        calls.push(input);
        return { items: [journal] };
      },
    },
  });
  harness.run();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].data.bookingId, booking.id);
  assert.equal(calls[0].data.daycareId, booking.daycareId);
  assert.equal(calls[0].data.day, attendance.localDay);
  assert.equal(harness.updates.at(-1).state.kind, "ready");
});

test("home care stops waiting on failure or timeout and ignores a result after unmount", async () => {
  const failed = effectsHarness({
    "@/lib/server/child-checkin": {
      listMyChildAttendance: async () => {
        throw new Error("synthetic failure");
      },
    },
  });
  failed.run();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(failed.updates.at(-1).state.kind, "error");
  const stuck = effectsHarness({
    "@/lib/server/child-checkin": { listMyChildAttendance: () => new Promise(() => {}) },
  });
  stuck.run();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(stuck.updates.at(-1).state.kind, "error");
  let finish;
  const late = effectsHarness({
    "@/lib/server/child-checkin": {
      listMyChildAttendance: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
  });
  const cleanup = late.run();
  cleanup();
  finish({ enabled: true, children: [attendance] });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(late.updates.length, 1);
});
