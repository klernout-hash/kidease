import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { dirname, join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";

// Exercise the real server handlers and their SQL against synthetic, in-memory
// Postgres only. No app database, migrations, photos, or external transports open.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stateKey = "__curriculumPhotoAuthorizationTest";
const prefix = "curriculum-photo-fixture:";
// centre-access's unrelated imports lead into billing. Keep its three real
// membership-query functions verbatim while excluding that out-of-scope graph.
const centreSource = readFileSync(join(root, "src/lib/server/centre-access.ts"), "utf8");
const membershipSource = centreSource.slice(
  centreSource.indexOf("export async function listOwnedDaycareIds("),
  centreSource.indexOf("export async function loadCentreRole("),
);
assert.match(membershipSource, /export async function listAccessibleDaycareIds/);
const virtual = {
  serverFn: `
    export function createServerFn() {
      let validate = value => value;
      const builder = {
        middleware() { return builder; },
        validator(fn) { validate = fn; return builder; },
        handler(fn) { return ({context, data}) => fn({context, data: validate(data)}); },
      };
      return builder;
    }
  `,
  db: `export const getSql = async () => globalThis.${stateKey}.sql;`,
  auth: "export const authMiddleware = {}; export const govAuthMiddleware = {};",
  features: `
    export const curriculumPackEnabled = () => globalThis.${stateKey}.pack;
    export const curriculumPackLive = () => globalThis.${stateKey}.live;
    export const storyCornerEnabled = () => false;
  `,
  utils: `export const nid = prefix => prefix + '-fixture-' + (++globalThis.${stateKey}.ids);`,
  storage: `
    export const putR2Object = input => globalThis.${stateKey}.put(input);
    export const deleteFamilyDocObject = key => globalThis.${stateKey}.remove(key);
    export const presignR2Get = (key, ttl) => globalThis.${stateKey}.sign(key, ttl);
  `,
  centreAccess: stripTypeScriptTypes(membershipSource),
};
const mockFiles = new Map([
  ["src/lib/db.ts", "db"],
  ["src/lib/auth/middleware.ts", "auth"],
  ["src/lib/auth/gov-middleware.ts", "auth"],
  ["src/lib/features.ts", "features"],
  ["src/lib/utils.ts", "utils"],
  ["src/lib/server/r2.server.ts", "storage"],
  ["src/lib/server/centre-access.ts", "centreAccess"],
].map(([file, name]) => [pathToFileURL(join(root, file)).href, name]));
function resolveSource(specifier, parentURL) {
  let file;
  if (specifier.startsWith("@/")) file = join(root, "src", specifier.slice(2));
  else if (specifier.startsWith(".") && parentURL?.startsWith("file:"))
    file = fileURLToPath(new URL(specifier, parentURL));
  if (!file) return null;
  return [file, `${file}.ts`, `${file}.mjs`].find(existsSync) ?? null;
}
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/stripe|payments?/i.test(specifier)) throw new Error(`Out-of-scope module import: ${specifier}`);
    if (specifier === "@tanstack/react-start")
      return { url: `${prefix}serverFn`, shortCircuit: true };
    const file = resolveSource(specifier, context.parentURL);
    if (!file) return nextResolve(specifier, context);
    const url = pathToFileURL(file).href;
    return { url: mockFiles.has(url) ? `${prefix}${mockFiles.get(url)}` : url, shortCircuit: true };
  },
  load(url, context, nextLoad) {
    return url.startsWith(prefix)
      ? { format: "module", source: virtual[url.slice(prefix.length)], shortCircuit: true }
      : nextLoad(url, context);
  },
});
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error("Network is forbidden in curriculum photo fixtures"); };
const { attachCurriculumPhoto, viewCurriculumPhoto } = await import("../src/lib/server/curriculum-pack.ts");
const pg = new PGlite();
await pg.exec(`
  create table provider_daycares (user_id text, daycare_id text);
  create table centre_members (user_id text, daycare_id text, status text, role text);
  create table children (id text primary key, user_id text, name text);
  create table bookings (
    id text primary key, child_id text, daycare_id text, user_id text,
    status text, photo_consent_at timestamptz
  );
  create table learning_stories (
    id text primary key, child_id text, daycare_id text, is_private int
  );
  create table curriculum_story_meta (
    story_id text primary key, daycare_id text, status text,
    published_at timestamptz, photo_keys jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now()
  );
`);
after(async () => {
  await pg.close();
  hooks.deregister();
  delete globalThis[stateKey];
  globalThis.fetch = originalFetch;
});

const keyA = "family-docs/curriculum/centre-a/child-a/booking-a/story-a/existing.jpg";
const keyB = "family-docs/curriculum/centre-b/child-b/booking-b/story-b/existing.jpg";
const keySibling = "family-docs/curriculum/centre-a/child-sibling/booking-sibling/story-sibling/existing.jpg";
const uploadData = (overrides = {}) => ({
  daycareId: "centre-a", storyId: "story-a", bookingId: "booking-a",
  contentType: "image/jpeg", bodyBase64: "c3ludGhldGljLW5vdC1hLXJlYWwtcGhvdG8=",
  ...overrides,
});
const attach = (data = uploadData(), userId = "staff-a") =>
  attachCurriculumPhoto({ context: { userId }, data });
const view = (data = { storyId: "story-a", key: keyA }, userId = "parent-a") =>
  viewCurriculumPhoto({ context: { userId }, data });
function state() { return globalThis[stateKey]; }
async function photoKeys(storyId = "story-a") {
  return (await pg.query("select photo_keys from curriculum_story_meta where story_id = $1", [storyId])).rows[0]?.photo_keys;
}
async function assertUploadBlocked(data = uploadData(), userId = "staff-a") {
  await assert.rejects(attach(data, userId));
  assert.deepEqual(state().puts, []);
  assert.deepEqual(state().signs, []);
  assert.deepEqual(await photoKeys(), [keyA]);
}
async function assertViewBlocked(data = { storyId: "story-a", key: keyA }, userId = "parent-a") {
  const result = await view(data, userId);
  assert.equal(result.blocked, true);
  assert.equal("url" in result, false);
  assert.deepEqual(state().signs, []);
}

beforeEach(async () => {
  await pg.exec(`
    truncate provider_daycares, centre_members, children, bookings, learning_stories, curriculum_story_meta;
    insert into provider_daycares values ('owner-a', 'centre-a'), ('owner-b', 'centre-b');
    insert into centre_members values
      ('staff-a', 'centre-a', 'active', 'staff'),
      ('staff-b', 'centre-b', 'active', 'staff'),
      ('revoked-staff', 'centre-a', 'revoked', 'staff');
    insert into children values
      ('child-a', 'parent-a', 'Synthetic A'),
      ('child-b', 'parent-b', 'Synthetic B'),
      ('child-sibling', 'parent-a', 'Synthetic Sibling');
    insert into bookings values
      ('booking-a', 'child-a', 'centre-a', 'parent-a', 'active', '2026-11-01T00:00:00Z'),
      ('booking-b', 'child-b', 'centre-b', 'parent-b', 'active', '2026-11-01T00:00:00Z'),
      ('booking-sibling', 'child-sibling', 'centre-a', 'parent-a', 'accepted', '2026-11-01T00:00:00Z');
    insert into learning_stories values
      ('story-a', 'child-a', 'centre-a', 1),
      ('story-b', 'child-b', 'centre-b', 1),
      ('story-sibling', 'child-sibling', 'centre-a', 1),
      ('story-second', 'child-a', 'centre-a', 1);
    insert into curriculum_story_meta (story_id, daycare_id, status, published_at, photo_keys) values
      ('story-a', 'centre-a', 'published', now(), '${JSON.stringify([keyA])}'::jsonb),
      ('story-b', 'centre-b', 'published', now(), '${JSON.stringify([keyB])}'::jsonb),
      ('story-sibling', 'centre-a', 'published', now(), '${JSON.stringify([keySibling])}'::jsonb),
      ('story-second', 'centre-a', 'draft', null, '[]'::jsonb);
  `);
  const s = {
    ids: 0, pack: true, live: true, puts: [], removals: [], signs: [], queries: [],
    failWrite: false, zeroWrite: false, commitThenThrow: false, failRead: false, failPut: false,
    failRemove: false, failSign: false, afterPut: null,
    async put(input) {
      s.puts.push(input);
      if (s.failPut) throw new Error("synthetic storage failure");
      if (s.afterPut) await s.afterPut();
      return { key: input.key, bytes: 29, contentType: input.contentType, etag: "synthetic" };
    },
    async remove(key) {
      s.removals.push(key);
      if (s.failRemove) throw new Error("synthetic cleanup failure");
    },
    sign(key, ttl) {
      s.signs.push({ key, ttl });
      if (s.failSign) throw new Error("synthetic signing failure");
      return { url: `https://files.example.invalid/${key}?X-Amz-Signature=synthetic`, key };
    },
  };
  const run = async (text, values = []) => {
    s.queries.push(text.trim());
    if (/update\s+curriculum_story_meta/i.test(text)) {
      if (s.failWrite) throw new Error("synthetic metadata failure");
      if (s.zeroWrite) return [];
    }
    if (s.failRead && /from\s+curriculum_story_meta/i.test(text)) throw new Error("synthetic read failure");
    const rows = (await pg.query(text, values)).rows;
    if (s.commitThenThrow && /update\s+curriculum_story_meta/i.test(text))
      throw new Error("synthetic lost write acknowledgement");
    return rows;
  };
  s.sql = async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run(text, values);
  };
  s.sql.query = run;
  globalThis[stateKey] = s;
});

test("upload binds the generated private key to the exact centre, child, booking, and story", async () => {
  const result = await attach();
  assert.equal(result.ok, true);
  assert.match(result.key, /^family-docs\/curriculum\/centre-a\/child-a\/booking-a\/story-a\/photo-fixture-\d+\.jpg$/);
  assert.equal(state().puts.length, 1);
  assert.equal(state().puts[0].key, result.key);
  assert.deepEqual(await photoKeys(), [keyA, result.key]);
  assert.deepEqual(await photoKeys("story-sibling"), [keySibling]);
  assert.deepEqual(state().removals, []);
});

// The first request pauses at storage while the second finishes registration.
// This exercises handler interleaving, not independent PostgreSQL sessions.
test("overlapping uploads append both exact keys without losing the faster write", { timeout: 10000 }, async () => {
  const stored = Promise.withResolvers();
  const resume = Promise.withResolvers();
  state().afterPut = async () => {
    state().afterPut = null;
    stored.resolve();
    await resume.promise;
  };
  const paused = attach();
  await stored.promise;
  const faster = await attach();
  assert.deepEqual(await photoKeys(), [keyA, faster.key]);
  resume.resolve();
  const slower = await paused;
  assert.notEqual(slower.key, faster.key);
  assert.deepEqual(await photoKeys(), [keyA, faster.key, slower.key]);
  assert.deepEqual(state().removals, []);
  for (const key of [faster.key, slower.key]) {
    await assertViewBlocked({ storyId: "story-a", key }, "staff-b");
  }
  for (const key of [faster.key, slower.key]) {
    assert.equal(typeof (await view({ storyId: "story-a", key })).url, "string");
  }
});

test("failed overlapping upload cleans up only its own object", { timeout: 10000 }, async () => {
  const stored = Promise.withResolvers();
  const resume = Promise.withResolvers();
  state().afterPut = async () => {
    state().afterPut = null;
    stored.resolve();
    await resume.promise;
  };
  const paused = attach();
  const rejected = assert.rejects(paused, /Photo could not be attached/);
  await stored.promise;
  const failedKey = state().puts[0].key;
  const successful = await attach();
  state().zeroWrite = true;
  resume.resolve();
  await rejected;
  assert.notEqual(failedKey, successful.key);
  assert.deepEqual(state().removals, [failedKey]);
  assert.deepEqual(await photoKeys(), [keyA, successful.key]);
  await assertViewBlocked({ storyId: "story-a", key: failedKey });
  assert.equal(typeof (await view({ storyId: "story-a", key: successful.key })).url, "string");
});

test("upload permits a matching draft without making the draft readable", async () => {
  const result = await attach(uploadData({ storyId: "story-second" }));
  assert.equal(result.ok, true);
  assert.deepEqual(await photoKeys("story-second"), [result.key]);
  await assertViewBlocked({ storyId: "story-second", key: result.key }, "staff-a");
});

for (const [label, data, actor] of [
  ["staff from another centre", uploadData(), "staff-b"],
  ["owner of another centre", uploadData(), "owner-b"],
  ["revoked staff", uploadData(), "revoked-staff"],
  ["parent without staff access", uploadData(), "parent-a"],
  ["another child's story in the same centre", uploadData({ storyId: "story-sibling" }), "staff-a"],
  ["another child's booking in the same centre", uploadData({ bookingId: "booking-sibling" }), "staff-a"],
  ["another centre's story", uploadData({ storyId: "story-b" }), "staff-a"],
  ["another centre's booking", uploadData({ bookingId: "booking-b" }), "staff-a"],
  ["missing story", uploadData({ storyId: "missing" }), "staff-a"],
  ["missing booking", uploadData({ bookingId: "missing" }), "staff-a"],
  ["empty story", uploadData({ storyId: "" }), "staff-a"],
]) test(`upload rejects ${label} before storing bytes`, () => assertUploadBlocked(data, actor));

for (const [label, change] of [
  ["revoked photo consent", "update bookings set photo_consent_at = null where id = 'booking-a'"],
  ["invalid consent timestamp", "update bookings set photo_consent_at = 'infinity' where id = 'booking-a'"],
  ["inactive enrolment", "update bookings set status = 'cancelled' where id = 'booking-a'"],
  ["booking parent differs from the child's owner", "update bookings set user_id = 'parent-b' where id = 'booking-a'"],
  ["metadata belongs to another centre", "update curriculum_story_meta set daycare_id = 'centre-b' where story_id = 'story-a'"],
  ["missing metadata", "delete from curriculum_story_meta where story_id = 'story-a'"],
  ["public story", "update learning_stories set is_private = 0 where id = 'story-a'"],
  ["non-array photo metadata", "update curriculum_story_meta set photo_keys = '{}'::jsonb where story_id = 'story-a'"],
]) test(`upload rejects ${label}`, async () => {
  await pg.exec(change);
  await assert.rejects(attach());
  assert.deepEqual(state().puts, []);
  assert.deepEqual(state().removals, []);
});

test("matching parent, exact-centre staff, and owner can read the registered published key", async () => {
  for (const actor of ["parent-a", "staff-a", "owner-a"]) {
    const result = await view(undefined, actor);
    assert.match(result.url, /X-Amz-Signature=synthetic/);
  }
  assert.deepEqual(state().signs, Array(3).fill({ key: keyA, ttl: 120 }));
});

for (const actor of ["staff-b", "owner-b", "parent-b", "revoked-staff", "unrelated"]) {
  test(`reader denies ${actor} before signing`, () => assertViewBlocked(undefined, actor));
}

for (const [label, data] of [
  ["an unregistered key under the correct path", { storyId: "story-a", key: keyA.replace("existing.jpg", "other.jpg") }],
  ["a sibling's key", { storyId: "story-a", key: keySibling }],
  ["another centre's key", { storyId: "story-a", key: keyB }],
  ["a key for another story of the same child", { storyId: "story-second", key: keyA }],
  ["an unknown story", { storyId: "unknown", key: keyA }],
  ["a public URL", { storyId: "story-a", key: "https://files.example.invalid/private.jpg" }],
  ["a legacy key without booking provenance", { storyId: "story-a", key: "family-docs/curriculum/centre-a/child-a/legacy.jpg" }],
  ["a path traversal key", { storyId: "story-a", key: keyA.replace("existing.jpg", "../existing.jpg") }],
  ["an empty key", { storyId: "story-a", key: "" }],
]) test(`reader rejects ${label} before signing`, () => assertViewBlocked(data, "staff-a"));

for (const [label, change] of [
  ["unpublished story", "update curriculum_story_meta set status = 'draft', published_at = null where story_id = 'story-a'"],
  ["revoked consent", "update bookings set photo_consent_at = null where id = 'booking-a'"],
  ["invalid consent timestamp", "update bookings set photo_consent_at = 'infinity' where id = 'booking-a'"],
  ["inactive enrolment", "update bookings set status = 'cancelled' where id = 'booking-a'"],
  ["a reassigned booking child", "update bookings set child_id = 'child-sibling' where id = 'booking-a'"],
  ["a reassigned booking centre", "update bookings set daycare_id = 'centre-b' where id = 'booking-a'"],
  ["a reassigned story child", "update learning_stories set child_id = 'child-sibling' where id = 'story-a'"],
  ["a reassigned story centre", "update learning_stories set daycare_id = 'centre-b' where id = 'story-a'"],
  ["a mismatched metadata centre", "update curriculum_story_meta set daycare_id = 'centre-b' where story_id = 'story-a'"],
  ["a public story", "update learning_stories set is_private = 0 where id = 'story-a'"],
  ["a booking for a different parent", "update bookings set user_id = 'parent-b' where id = 'booking-a'"],
  ["a child owned by a different parent", "update children set user_id = 'parent-b' where id = 'child-a'"],
  ["missing metadata", "delete from curriculum_story_meta where story_id = 'story-a'"],
  ["non-array photo metadata", `update curriculum_story_meta set photo_keys = '${JSON.stringify({ [keyA]: true })}'::jsonb where story_id = 'story-a'`],
]) test(`reader rejects ${label} for parent and staff before signing`, async () => {
  await pg.exec(change);
  await assertViewBlocked(undefined, "parent-a");
  await assertViewBlocked(undefined, "staff-a");
});

test("registered metadata cannot authorize a key with the wrong centre, child, booking, or story path", async () => {
  for (const key of [
    keyA.replace("centre-a", "centre-b"), keyA.replace("child-a", "child-sibling"),
    keyA.replace("booking-a", "booking-sibling"), keyA.replace("story-a", "story-second"),
    "family-docs/curriculum/centre-a/child-a/legacy.jpg",
  ]) {
    await pg.query("update curriculum_story_meta set photo_keys = $1::jsonb where story_id = 'story-a'", [JSON.stringify([key])]);
    await assertViewBlocked({ storyId: "story-a", key }, "staff-a");
  }
});

test("another consenting booking never rescues the exact booking's revoked consent", async () => {
  await pg.exec(`
    update bookings set photo_consent_at = null where id = 'booking-a';
    insert into bookings values ('booking-other', 'child-a', 'centre-a', 'parent-a', 'active', now());
  `);
  await assertViewBlocked(undefined, "parent-a");
  await assertViewBlocked(undefined, "staff-a");
  await assertUploadBlocked();
});

test("a revoked unrelated booking does not hide a correctly bound consenting photo", async () => {
  await pg.exec("insert into bookings values ('booking-other', 'child-a', 'centre-a', 'parent-a', 'active', null)");
  assert.equal(typeof (await view()).url, "string");
  assert.deepEqual(state().signs, [{ key: keyA, ttl: 120 }]);
});

for (const [label, setup] of [
  ["metadata query throws", () => { state().failWrite = true; }],
  ["metadata update affects no rows", () => { state().zeroWrite = true; }],
  ["consent is revoked during storage", () => { state().afterPut = () => pg.exec("update bookings set photo_consent_at = null where id = 'booking-a'"); }],
  ["consent is replaced during storage", () => { state().afterPut = () => pg.exec("update bookings set photo_consent_at = '2026-11-02T00:00:00Z' where id = 'booking-a'"); }],
  ["enrolment ends during storage", () => { state().afterPut = () => pg.exec("update bookings set status = 'cancelled' where id = 'booking-a'"); }],
  ["staff access is revoked during storage", () => { state().afterPut = () => pg.exec("update centre_members set status = 'revoked' where user_id = 'staff-a'"); }],
  ["story is reassigned during storage", () => { state().afterPut = () => pg.exec("update learning_stories set child_id = 'child-sibling' where id = 'story-a'"); }],
  ["booking is reassigned during storage", () => { state().afterPut = () => pg.exec("update bookings set child_id = 'child-sibling' where id = 'booking-a'"); }],
  ["parent and booking are reassigned together during storage", () => { state().afterPut = () => pg.exec("update bookings set user_id = 'parent-b' where id = 'booking-a'; update children set user_id = 'parent-b' where id = 'child-a'"); }],
  ["metadata is removed during storage", () => { state().afterPut = () => pg.exec("delete from curriculum_story_meta where story_id = 'story-a'"); }],
]) test(`upload fails and removes the new object when ${label}`, async () => {
  setup();
  await assert.rejects(attach());
  assert.equal(state().puts.length, 1);
  assert.deepEqual(state().removals, [state().puts[0].key]);
  assert.deepEqual(state().signs, []);
  assert.equal((await photoKeys())?.includes(state().puts[0].key) ?? false, false);
});

test("failed cleanup still cannot turn a failed metadata write into success", async () => {
  state().failWrite = true;
  state().failRemove = true;
  await assert.rejects(attach());
  assert.equal(state().puts.length, 1);
  assert.deepEqual(state().removals, [state().puts[0].key]);
  assert.deepEqual(await photoKeys(), [keyA]);
  await assertViewBlocked({ storyId: "story-a", key: state().puts[0].key }, "staff-a");
});

test("a lost write acknowledgement returns failure and attempts object cleanup", async () => {
  state().commitThenThrow = true;
  await assert.rejects(attach());
  const key = state().puts[0].key;
  assert.deepEqual(state().removals, [key]);
  // The SQL write actually committed: do not pretend cleanup rolled it back.
  assert.deepEqual(await photoKeys(), [keyA, key]);
  await assertViewBlocked({ storyId: "story-a", key }, "staff-b");
});

test("lost acknowledgement plus failed cleanup preserves reader authorization checks", async () => {
  state().commitThenThrow = true;
  state().failRemove = true;
  await assert.rejects(attach());
  const key = state().puts[0].key;
  assert.deepEqual(state().removals, [key]);
  assert.deepEqual(await photoKeys(), [keyA, key]);
  await assertViewBlocked({ storyId: "story-a", key }, "parent-b");
  await pg.exec("update bookings set photo_consent_at = null where id = 'booking-a'");
  await assertViewBlocked({ storyId: "story-a", key }, "parent-a");
  await assertViewBlocked({ storyId: "story-a", key }, "staff-a");
});

test("storage failure cannot attach metadata or return success", async () => {
  state().failPut = true;
  await assert.rejects(attach());
  assert.deepEqual(await photoKeys(), [keyA]);
  assert.deepEqual(state().signs, []);
});

test("reader fails closed when its metadata query fails", async () => {
  state().failRead = true;
  await assertViewBlocked(undefined, "staff-a");
});

test("signing failure returns a blocked result without exposing the private key", async () => {
  state().failSign = true;
  const result = await view();
  assert.equal(result.blocked, true);
  assert.equal("url" in result, false);
  assert.equal("key" in result, false);
});

test("pack off blocks upload and read without storage calls", async () => {
  state().pack = false;
  await assertUploadBlocked();
  await assertViewBlocked();
  assert.deepEqual(state().queries, []);
});

test("live switch off keeps read blocked while draft uploads remain available", async () => {
  state().live = false;
  await assertViewBlocked();
  assert.deepEqual(state().queries, []);
  assert.equal((await attach()).ok, true);
});
