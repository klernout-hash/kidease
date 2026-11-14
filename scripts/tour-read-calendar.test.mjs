import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import * as calendar from "../src/lib/tour-calendar.ts";
import * as holds from "../src/lib/tour-hold.ts";
import * as threads from "../src/lib/threads.ts";

const source = readFileSync(new URL("../src/lib/server/tour-calendar.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function fixture() {
  // Isolated synthetic database: never import the application's DB or environment.
  const pg = new PGlite();
  await pg.exec(`
    create table daycares (
      id text primary key, name text, slug text, timezone text,
      address text, city text, province text, contact_email text
    );
    create table tour_windows (
      id text primary key, daycare_id text, window_date date,
      start_time text, end_time text, capacity int, timezone text, start_at timestamptz
    );
    create table tour_requests (
      id text primary key, conversation_id text, user_id text, daycare_id text,
      child_id text, child_name text, preferred_times text, parent_note text,
      status text, window_id text, parent_first_name text, parent_last_name text,
      parent_phone text, contact_email text, hold_expires_at timestamptz,
      created_at timestamptz default now()
    );
    create table conversations (id text primary key, user_id text, daycare_id text, last_at timestamptz);
    create table messages (id text, conversation_id text, sender text, body text, kind text);
    create table alert_outbox (id text primary key, state text);
    begin;
    insert into daycares (id, name, slug, timezone) values
      ('a', 'Centre A', 'centre-a', 'America/Winnipeg'),
      ('b', 'Centre B', 'centre-b', 'America/Winnipeg');
    insert into tour_windows values
      ('a-open', 'a', (now() + interval '7 days')::date, '10:00', '10:30', 3, 'America/Winnipeg', now() + interval '7 days'),
      ('a-full', 'a', (now() + interval '7 days')::date, '11:00', '11:30', 2, 'America/Winnipeg', now() + interval '7 days 1 hour'),
      ('b-open', 'b', (now() + interval '7 days')::date, '10:00', '10:30', 1, 'America/Winnipeg', now() + interval '7 days');
    insert into conversations values ('cv-guest', 'guest:parent@example.test', 'a', now());
    insert into alert_outbox values ('unrelated-outbox', 'pending');
    insert into tour_requests (id, user_id, daycare_id, window_id, status, created_at, hold_expires_at) values
      ('explicit-boundary', 'guest:parent@example.test', 'a', 'a-open', 'pending', now(), now()),
      ('fallback-boundary', 'other', 'a', 'a-open', 'pending', now() - interval '48 hours', null),
      ('fallback-past', 'other', 'a', 'a-open', 'pending', now() - interval '49 hours', null),
      ('fallback-current', 'other', 'a', 'a-open', 'pending', now() - interval '47 hours', null),
      ('accepted-old-deadline', 'other', 'a', 'a-open', 'accepted', now() - interval '50 hours', now() - interval '1 hour'),
      ('declined', 'other', 'a', 'a-open', 'declined', now(), now() + interval '1 day'),
      ('full-pending', 'other', 'a', 'a-full', 'pending', now(), now() + interval '1 day'),
      ('full-accepted', 'other', 'a', 'a-full', 'accepted', now(), null),
      ('other-tenant-overdue', 'other', 'b', 'b-open', 'pending', now() - interval '49 hours', null);
  `);
  const effects = { writes: [], expiry: 0, email: 0, push: 0, outbox: 0 };
  let readOnly = true;
  const run = async (text, params = []) => {
    if (!/^\s*select\b/i.test(text)) {
      effects.writes.push(text);
      if (readOnly) throw new Error("Read attempted a database write");
    }
    return (await pg.query(text, params)).rows;
  };
  const sql = (strings, ...params) =>
    run(
      strings.reduce((text, part, index) => text + (index ? `$${index}` : "") + part, ""),
      params,
    );
  sql.query = run;
  let counter = 0;
  const modules = {
    "@tanstack/react-start": {
      createServerFn: () => {
        const chain = {
          middleware: () => chain,
          validator: () => chain,
          handler: (handler) => handler,
        };
        return chain;
      },
    },
    "@/lib/db": { getSql: async () => sql },
    "@/lib/auth/middleware": { authMiddleware: {} },
    "@/lib/features": { tourCalendarEnabled: () => true },
    "@/lib/utils": { nid: (prefix) => `${prefix}-test-${++counter}` },
    "@/lib/catalog": { catalogByIdGet: async () => null },
    "@/lib/listing-visibility": { isAdminOnlyListing: () => false },
    "@/lib/parent-listing": {
      guestInfoUserId: (email) => `guest:${email}`,
      normalizeInfoContact: (contact) => ({ ok: true, ...contact }),
    },
    "@/lib/server/public-listing": { callerMayUseAdminOnlyListing: async () => false },
    "@/lib/qa-tour-access": { isQaTourCentre: () => false, qaTourEmailAllowed: () => false },
    "@/lib/server/seed": {
      upsertDaycare: async () => {
        throw new Error("Unexpected seed");
      },
    },
    "@/lib/server/actor-user": { resolveActorUserId: async () => null },
    "@/lib/server/parent-notice": {
      saveParentInAppNotice: async () => {
        effects.push++;
      },
    },
    "@/lib/server/provider-entitlements": { centreCanAcceptInquiry: async () => ({ ok: true }) },
    "@/lib/server/notify": {
      lookupUser: async () => null,
      notifyPlatform: async () => {
        effects.email++;
      },
      notifyThreadParty: async () => {
        effects.email++;
      },
    },
    "@/lib/server/thread-access": {
      isCentreOwner: async (_sql, userId, daycareId) => userId === `owner-${daycareId}`,
      listCentreOwnerEmails: async () => [],
    },
    "@/lib/threads": threads,
    "@/lib/tour-hold": holds,
    "@/lib/tour-calendar": calendar,
    "@/lib/server/tour-holds": {
      expireDueTourHolds: async () => {
        effects.expiry++;
        effects.email++;
        effects.push++;
        effects.outbox++;
      },
    },
    "@/lib/server/lead-requests": { recordLeadRequest: async () => ({ id: "lead-test" }) },
    "@/lib/server/tour-reminders": {
      scheduleTourReminder: async () => {},
      sendTourBookedMail: async () => {
        effects.email++;
      },
    },
  };
  const api = {};
  new Function("require", "exports", compiled)((specifier) => {
    assert.ok(specifier in modules, `Unexpected import: ${specifier}`);
    return modules[specifier];
  }, api);
  return {
    pg,
    effects,
    api,
    allowWrites: () => {
      readOnly = false;
    },
  };
}

async function snapshot(pg) {
  const tables = ["tour_requests", "conversations", "messages", "alert_outbox"];
  return Promise.all(
    tables.map(async (table) => (await pg.query(`select * from ${table} order by id`)).rows),
  );
}

test("public and centre calendar reads project capacity without writes, notices, or global outbox drains", async () => {
  const { pg, effects, api } = await fixture();
  try {
    const before = await snapshot(pg);
    for (const tenant of ["a", "b"]) {
      const publicResult = await api.listPublicTourSlots({ data: { daycareId: tenant } });
      assert.equal(publicResult.slots.length, 1);
      assert.equal(publicResult.slots[0].id, `${tenant}-open`);
      const centreResult = await api.listCentreTourWindows({
        context: { userId: `owner-${tenant}` },
        data: { daycareId: tenant },
      });
      assert.ok(centreResult.slots.every((slot) => slot.daycareId === tenant));
      const open = centreResult.slots.find((slot) => slot.id === `${tenant}-open`);
      assert.deepEqual(
        [open.booked, open.pending, open.accepted, open.remaining, open.inventory],
        tenant === "a" ? [2, 1, 1, 1, "soft_hold"] : [0, 0, 0, 1, "open"],
      );
      if (tenant === "a") {
        const full = centreResult.slots.find((slot) => slot.id === "a-full");
        assert.deepEqual([full.booked, full.pending, full.accepted, full.remaining], [2, 1, 1, 0]);
      }
    }
    await assert.rejects(
      api.listCentreTourWindows({ context: { userId: "owner-a" }, data: { daycareId: "b" } }),
      /Not authorized/,
    );
    assert.deepEqual(effects, { writes: [], expiry: 0, email: 0, push: 0, outbox: 0 });
    assert.deepEqual(await snapshot(pg), before);
  } finally {
    await pg.close();
  }
});

const booking = {
  daycareId: "a",
  windowId: "a-open",
  firstName: "Synthetic",
  lastName: "Parent",
  phone: "2045550100",
  email: "parent@example.test",
};

test("booking reuses capacity from expired explicit/fallback holds without changing those tours", async () => {
  const { pg, effects, api, allowWrites } = await fixture();
  try {
    const before = (await pg.query("select * from tour_requests order by id")).rows;
    allowWrites();
    const result = await api.bookTourSlot({ data: booking });
    assert.equal(result.status, "pending");
    assert.equal(result.conversationId, "cv-guest");
    const unchanged = (
      await pg.query("select * from tour_requests where id <> $1 order by id", [result.id])
    ).rows;
    assert.deepEqual(unchanged, before);
    assert.equal(effects.expiry, 0);
    const slots = await api.listCentreTourWindows({
      context: { userId: "owner-a" },
      data: { daycareId: "a" },
    });
    assert.equal(slots.slots.find((slot) => slot.id === "a-open").remaining, 0);
  } finally {
    await pg.close();
  }
});

for (const status of ["pending", "accepted"]) {
  test(`booking rejects an existing current ${status} hold by the same parent`, async () => {
    const { pg, effects, api, allowWrites } = await fixture();
    try {
      await pg.query(
        "update tour_requests set user_id = $1, status = $2, hold_expires_at = now() + interval '1 day' where id = 'fallback-current'",
        ["guest:parent@example.test", status],
      );
      const before = await snapshot(pg);
      allowWrites();
      await assert.rejects(api.bookTourSlot({ data: booking }), /already asked/);
      assert.deepEqual(await snapshot(pg), before);
      assert.deepEqual(effects, { writes: [], expiry: 0, email: 0, push: 0, outbox: 0 });
    } finally {
      await pg.close();
    }
  });
}

test("an overdue legacy hold with no explicit deadline also permits the parent's new booking", async () => {
  const { pg, api, allowWrites } = await fixture();
  try {
    await pg.query("update tour_requests set user_id = 'other' where id = 'explicit-boundary'");
    await pg.query(
      "update tour_requests set user_id = 'guest:parent@example.test' where id = 'fallback-boundary'",
    );
    allowWrites();
    assert.equal((await api.bookTourSlot({ data: booking })).status, "pending");
    const previous = (
      await pg.query(
        "select status, hold_expires_at from tour_requests where id = 'fallback-boundary'",
      )
    ).rows[0];
    assert.equal(previous.status, "pending");
    assert.equal(previous.hold_expires_at, null);
  } finally {
    await pg.close();
  }
});

test("a window filled by current pending and accepted holds still rejects another booking", async () => {
  const { pg, effects, api, allowWrites } = await fixture();
  try {
    const before = await snapshot(pg);
    allowWrites();
    await assert.rejects(api.bookTourSlot({ data: { ...booking, windowId: "a-full" } }), /full/);
    assert.deepEqual(await snapshot(pg), before);
    assert.deepEqual(effects, { writes: [], expiry: 0, email: 0, push: 0, outbox: 0 });
  } finally {
    await pg.close();
  }
});
