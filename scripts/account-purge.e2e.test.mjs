import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { ACCOUNT_RESTORE_MS } from "../src/lib/account-delete.ts";
import { DELETED_ACCOUNT_TOMBSTONE, accountIsDueForPurge, purgeDueAccounts } from "../src/lib/account-purge.ts";
import { forgetExternalAccounts, sentryProjectFromEnv } from "../src/lib/account-external.ts";
import { cronAuthorized } from "../src/lib/cron-auth.ts";
import { deskHrefForLocale } from "../src/lib/desk-nav.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const DAY = 24 * 60 * 60 * 1000;

test("sign in, request deletion, then the purge wipes the account after 30 days", async () => {
  const now = Date.parse("2026-10-26T12:00:00.000Z");
  const userId = "user-parent-1";
  const calls = [];
  const db = {
    session: { userId, createdAt: now },
    profile: { userId, email: "parent@example.com", stripeCustomerId: "cus_test", deletedAt: null },
    invoice: { id: "inv-1", parentUserId: userId, createdBy: userId, childId: "child-1" },
    payment: { id: "pay-1", userId },
    security: { id: "sec-1", actorUserId: userId, targetUserId: userId, kind: "login" },
    signal: { id: "sig-1", userId },
  };

  assert.equal(db.session.userId, userId);

  db.profile.deletedAt = new Date(now).toISOString();
  db.session = null;

  assert.equal(accountIsDueForPurge(db.profile.deletedAt, now + 29 * DAY), false);
  const early = await purgeDueAccounts({
    nowMs: now + 29 * DAY,
    listUserIds: async () => (accountIsDueForPurge(db.profile?.deletedAt, now + 29 * DAY) ? [userId] : []),
    purgeUser: async () => false,
  });
  assert.equal(early.purged, 0);
  assert.equal(early.log, "[account-purge] purged=0");
  assert.equal(db.profile.email, "parent@example.com");

  const later = now + ACCOUNT_RESTORE_MS;
  assert.equal(accountIsDueForPurge(db.profile.deletedAt, later), true);

  const env = {
    STRIPE_SECRET_KEY: "sk_test_purge",
    POSTHOG_PERSONAL_API_KEY: "phx_test",
    GHL_API_TOKEN: "ghl_test",
    FEATURE_GHL_INTAKE: "on",
    SENTRY_AUTH_TOKEN: "sentry_test",
    SENTRY_DSN: "https://public@o123.ingest.us.sentry.io/456",
  };
  assert.deepEqual(sentryProjectFromEnv(env), { org: "123", project: "456" });
  assert.equal(sentryProjectFromEnv({}), null);

  const fetchImpl = async (url, init) => {
    const method = init?.method || "GET";
    calls.push(`${method} ${url}`);
    const text = String(url);
    if (text.includes("api.stripe.com") && method === "DELETE") return new Response("{}", { status: 200 });
    if (text.includes("posthog.com") && method === "GET") {
      return Response.json({ results: [{ id: 99 }] });
    }
    if (text.includes("posthog.com") && method === "DELETE") return new Response(null, { status: 204 });
    if (text.includes("leadconnectorhq.com") && method === "GET") return Response.json({ contact: { id: "ghl-1" } });
    if (text.includes("leadconnectorhq.com") && method === "DELETE") return new Response("no", { status: 500 });
    if (text.includes("leadconnectorhq.com") && method === "PUT") return Response.json({ id: "ghl-1" });
    if (text.includes("sentry.io") && method === "DELETE") return new Response(null, { status: 404 });
    return new Response("missing", { status: 404 });
  };

  const first = await purgeDueAccounts({
    nowMs: later,
    listUserIds: async (cutoffIso) => {
      assert.equal(cutoffIso, new Date(later - ACCOUNT_RESTORE_MS).toISOString());
      return db.profile && accountIsDueForPurge(db.profile.deletedAt, later) ? [db.profile.userId] : [];
    },
    purgeUser: async (id) => {
      assert.equal(db.session, null);
      const external = await forgetExternalAccounts({
        userId: id,
        email: db.profile.email,
        stripeCustomerId: db.profile.stripeCustomerId,
        env,
        fetchImpl,
      });
      assert.equal(external.stripe, "deleted");
      assert.equal(external.posthog, "deleted");
      assert.equal(external.ghl, "anonymized");
      assert.equal(external.sentry, "missing");
      assert.doesNotMatch(JSON.stringify(external), /parent@example.com|cus_test|sentry_test/);
      db.invoice.parentUserId = DELETED_ACCOUNT_TOMBSTONE;
      db.invoice.createdBy = DELETED_ACCOUNT_TOMBSTONE;
      db.invoice.childId = null;
      db.payment.userId = DELETED_ACCOUNT_TOMBSTONE;
      db.security.actorUserId = null;
      db.security.targetUserId = null;
      db.signal.userId = null;
      db.profile = null;
      return true;
    },
  });

  assert.equal(first.purged, 1);
  assert.equal(first.log, "[account-purge] purged=1");
  assert.equal(db.profile, null);
  assert.equal(db.invoice.id, "inv-1");
  assert.equal(db.invoice.parentUserId, DELETED_ACCOUNT_TOMBSTONE);
  assert.equal(db.invoice.createdBy, DELETED_ACCOUNT_TOMBSTONE);
  assert.equal(db.invoice.childId, null);
  assert.equal(db.payment.id, "pay-1");
  assert.equal(db.payment.userId, DELETED_ACCOUNT_TOMBSTONE);
  assert.equal(db.security.kind, "login");
  assert.equal(db.security.actorUserId, null);
  assert.equal(db.security.targetUserId, null);
  assert.equal(db.signal.userId, null);
  assert.ok(calls.some((line) => line.startsWith("DELETE https://api.stripe.com/v1/customers/")));
  assert.ok(calls.some((line) => line.includes("/persons/?distinct_id=user-parent-1")));
  assert.ok(calls.some((line) => line.startsWith("DELETE https://sentry.io/api/0/projects/123/456/users/")));
  assert.equal(calls.some((line) => /parent@example.com/.test(line) && line.includes("console")), false);

  const second = await purgeDueAccounts({
    nowMs: later + DAY,
    listUserIds: async () => [],
    purgeUser: async () => {
      throw new Error("should not run");
    },
  });
  assert.equal(second.purged, 0);
  assert.equal(second.log, "[account-purge] purged=0");
  assert.doesNotMatch(second.log, /@|user-parent|cus_/);
});

test("the daily purge route needs the existing cron bearer and no new secret", () => {
  const route = src("src/routes/api/account-purge.ts");
  const job = src("src/lib/server/account-purge-job.ts");
  const vercel = src("vercel.json");
  const migration = src("migrations/0096_anonymize_legal_links.sql");
  assert.match(route, /cronAuthorized/);
  assert.match(route, /console\.info\(result\.log\)/);
  assert.doesNotMatch(route, /CRON_SECRET|DIGEST_SECRET|\?secret=/);
  assert.match(job, /deleted_at <=/);
  assert.match(vercel, /\/api\/account-purge/);
  assert.match(vercel, /25 9 \* \* \*/);
  assert.match(migration, /security_events is insert-only/);
  assert.match(migration, /actor_user_id/);
  assert.match(src("src/lib/server/account-close.ts"), /DELETED_ACCOUNT_TOMBSTONE/);
  assert.equal(cronAuthorized(new Request("https://kidease.ca/api/account-purge")), false);
  assert.equal(
    cronAuthorized(new Request("https://kidease.ca/api/account-purge?secret=nope"), "cron-secret"),
    false,
  );
  assert.equal(
    cronAuthorized(
      new Request("https://kidease.ca/api/account-purge", { headers: { authorization: "Bearer cron-secret" } }),
      "cron-secret",
    ),
    true,
  );
});

test("a third-party failure does not throw and a missing sentry token is a skip", async () => {
  const status = await forgetExternalAccounts({
    userId: "user-2",
    email: "parent@example.com",
    stripeCustomerId: "cus_2",
    env: { STRIPE_SECRET_KEY: "sk_test", FEATURE_GHL_INTAKE: "off" },
    fetchImpl: async () => {
      throw new Error("stripe down");
    },
  });
  assert.equal(status.stripe, "failed");
  assert.equal(status.posthog, "skipped");
  assert.equal(status.ghl, "flag-off");
  assert.equal(status.sentry, "skipped");
  assert.equal(sentryProjectFromEnv({ SENTRY_AUTH_TOKEN: "t" }), null);
});

test("french parent and inbox links stay on /fr", () => {
  assert.equal(deskHrefForLocale("/parent", "/fr/parent"), "/fr/parent");
  assert.equal(deskHrefForLocale("/inbox", "/fr/inbox"), "/fr/inbox");
  assert.equal(deskHrefForLocale("/parent", "/parent"), "/parent");
  assert.match(src("src/routes/fr.parent.tsx"), /createFileRoute\("\/fr\/parent"\)/);
  assert.match(src("src/routes/fr.inbox.tsx"), /createFileRoute\("\/fr\/inbox"\)/);
  assert.match(src("src/lib/desk-nav.ts"), /tab: "care"/);
  assert.match(src("src/lib/desk-nav.ts"), /tab: "payments"/);
  assert.match(src("src/lib/desk-nav.ts"), /tab: "alerts"/);
});
