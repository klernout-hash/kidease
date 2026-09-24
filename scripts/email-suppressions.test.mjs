import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyResendEmailEvent,
  emailHealthRates,
  isSuppressedEmail,
  planResendActions,
} from "../src/lib/email-suppressions.ts";
import {
  buildGhlEmailDndBody,
  GHL_DEFAULT_LOCATION_ID,
  GHL_EMAIL_BOUNCED_TAG,
  GHL_EMAIL_COMPLAINED_TAG,
  suppressGhlEmail,
} from "../src/lib/ghl-api.ts";
import { handleResendWebhook, ResendSignatureError, verifyResendWebhook } from "../src/lib/resend-webhook.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const secretRaw = Buffer.from("kidease-webhook-test-key!!", "utf8");
const secretB64 = secretRaw.toString("base64");
const webhookSecret = `whsec_${secretB64}`;

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function sign(payload, opts = {}) {
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
  const id = opts.id || "msg_test";
  const timestamp = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  const key = Buffer.from(opts.key || secretB64, "base64");
  const mac = createHmac("sha256", key).update(`${id}.${timestamp}.${raw}`).digest("base64");
  const signature = opts.signature || `v1,${mac}`;
  return {
    raw,
    headers: {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": signature,
    },
  };
}

function requestFor(signed) {
  return new Request("https://www.kidease.ca/api/webhooks/resend", {
    method: "POST",
    headers: signed.headers,
    body: signed.raw,
  });
}

function svixHeaders(signed) {
  return {
    id: signed.headers["svix-id"],
    timestamp: signed.headers["svix-timestamp"],
    signature: signed.headers["svix-signature"],
  };
}

function memorySql() {
  const suppressions = new Map();
  const events = [];
  const sql = async (strings, ...values) => {
    const text = strings.join(" ").replace(/\s+/g, " ").toLowerCase();
    if (text.includes("insert into email_suppressions")) {
      suppressions.set(String(values[0]), {
        email: values[0],
        reason: values[1],
        bounce_type: values[2],
        bounce_subtype: values[3],
        resend_email_id: values[4],
        campaign_tag: values[5],
      });
      return [];
    }
    if (text.includes("insert into email_events")) {
      events.push({
        id: values[0],
        email: values[1],
        eventType: values[2],
        reason: values[3],
        bounceType: values[4],
        campaign: values[7],
      });
      return [];
    }
    if (text.includes("delete from email_suppressions")) {
      suppressions.delete(String(values[0]));
      return [];
    }
    if (text.includes("from email_suppressions")) {
      const row = suppressions.get(String(values[0]));
      return row ? [row] : [];
    }
    throw new Error(`unexpected sql: ${text}`);
  };
  return { sql, suppressions, events };
}

function hardBounce(email = "Bad.User@Example.com") {
  return {
    type: "email.bounced",
    created_at: "2026-09-24T12:00:00.000Z",
    data: {
      email_id: "email_hard_1",
      from: "KidEase <kyle@kidease.ca>",
      to: [email],
      subject: "Spots near you",
      bounce: { type: "Permanent", subType: "General", message: "550 user unknown" },
      tags: { campaign: "spring-blast" },
    },
  };
}

test("rejects a bad Svix signature and an unset secret writes nothing", async () => {
  const payload = hardBounce();
  const signed = sign(payload);
  const bad = sign(payload, { signature: "v1,not-the-mac" });
  assert.throws(
    () => verifyResendWebhook(bad.raw, svixHeaders(bad), webhookSecret),
    (err) => err instanceof ResendSignatureError && /mismatch/.test(err.message),
  );
  const stale = sign(payload, { timestamp: 1 });
  assert.throws(() => verifyResendWebhook(stale.raw, svixHeaders(stale), webhookSecret), /too old/);
  assert.throws(() => verifyResendWebhook(signed.raw, { id: signed.headers["svix-id"] }, webhookSecret), /missing/);

  let applied = 0;
  const rejected = await handleResendWebhook(requestFor(bad), {
    secret: webhookSecret,
    apply: async () => {
      applied += 1;
      return { suppressed: [], removed: [] };
    },
    log: async () => undefined,
  });
  assert.equal(rejected.status, 401);
  assert.equal(applied, 0);

  const skipped = await handleResendWebhook(requestFor(signed), {
    secret: "",
    apply: async () => {
      applied += 1;
      return { suppressed: [], removed: [] };
    },
    log: async () => undefined,
  });
  assert.equal(skipped.status, 200);
  assert.deepEqual(await skipped.json(), { ok: true, skipped: "no-webhook-secret" });
  assert.equal(applied, 0);

  const verified = verifyResendWebhook(signed.raw, svixHeaders(signed), webhookSecret);
  assert.equal(verified.type, "email.bounced");
});

test("hard bounce upserts a suppression and soft bounce is log-only", async () => {
  const { sql, suppressions, events } = memorySql();
  const pushed = [];
  const hard = await applyResendEmailEvent({
    event: hardBounce(),
    svixId: "msg_hard",
    sql,
    pushGhl: async (item) => {
      pushed.push(item);
    },
  });
  assert.deepEqual(hard.suppressed, ["bad.user@example.com"]);
  assert.equal(suppressions.get("bad.user@example.com").reason, "bounce");
  assert.equal(suppressions.get("bad.user@example.com").bounce_type, "Permanent");
  assert.equal(suppressions.get("bad.user@example.com").bounce_subtype, "General");
  assert.equal(suppressions.get("bad.user@example.com").resend_email_id, "email_hard_1");
  assert.equal(suppressions.get("bad.user@example.com").campaign_tag, "spring-blast");
  assert.deepEqual(pushed, [{ email: "bad.user@example.com", reason: "bounce" }]);
  assert.equal(await isSuppressedEmail("bad.user@example.com", sql), true);
  assert.equal(await isSuppressedEmail("  BAD.USER@example.com ", sql), true);

  const soft = await applyResendEmailEvent({
    event: {
      type: "email.bounced",
      data: {
        email_id: "email_soft_1",
        to: ["soft@example.com"],
        bounce: { type: "Temporary", subType: "MailboxFull" },
        tags: { category: "spring-blast" },
      },
    },
    svixId: "msg_soft",
    sql,
    pushGhl: async (item) => {
      pushed.push(item);
    },
  });
  assert.deepEqual(soft.suppressed, []);
  assert.equal(suppressions.has("soft@example.com"), false);
  assert.equal(await isSuppressedEmail("soft@example.com", sql), false);
  assert.equal(pushed.length, 1);
  assert.equal(events.some((row) => row.email === "soft@example.com" && row.bounceType === "Temporary"), true);

  const delayed = planResendActions({
    type: "email.delivery_delayed",
    data: { email_id: "email_delay", to: ["soft@example.com"], tags: { campaign: "spring-blast" } },
  });
  assert.equal(delayed[0].suppress, false);
  assert.equal(delayed[0].campaignTag, "spring-blast");

  const complaint = await applyResendEmailEvent({
    event: {
      type: "email.complained",
      data: { email_id: "email_complaint", to: ["soft@example.com"], tags: { campaign: "spring-blast" } },
    },
    svixId: "msg_complaint",
    sql,
    pushGhl: async () => {
      throw new Error("ghl down");
    },
  });
  assert.deepEqual(complaint.suppressed, ["soft@example.com"]);
  assert.equal(suppressions.get("soft@example.com").reason, "complaint");

  const removed = await applyResendEmailEvent({
    event: { type: "suppression.removed", data: { email: "soft@example.com", origin: "complaint", source_id: null } },
    svixId: "msg_removed",
    sql,
    pushGhl: async (item) => {
      pushed.push(item);
    },
  });
  assert.deepEqual(removed.removed, ["soft@example.com"]);
  assert.equal(suppressions.has("soft@example.com"), false);
  assert.equal(pushed.length, 1);
});

test("signed webhook applies a hard bounce and a throw from GoHighLevel does not fail the handler", async () => {
  const { sql, suppressions } = memorySql();
  const payload = hardBounce("parent@family.ca");
  const signed = sign(payload, { id: "msg_live" });
  const res = await handleResendWebhook(requestFor(signed), {
    secret: webhookSecret,
    apply: ({ event, svixId }) =>
      applyResendEmailEvent({
        event,
        svixId,
        sql,
        pushGhl: async () => {
          throw new Error("network");
        },
      }),
    log: async () => undefined,
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.handled, "email.bounced");
  assert.equal(body.suppressed, 1);
  assert.equal(suppressions.get("parent@family.ca").reason, "bounce");
});

test("health rates warn at 2% bounce or 0.08% complaints", () => {
  const quiet = emailHealthRates({ delivered: 99, bounced: 1, complained: 0 });
  assert.equal(quiet.warn, false);
  assert.ok(quiet.bounceRate < 2);

  const bounceLine = emailHealthRates({ delivered: 98, bounced: 2, complained: 0 });
  assert.equal(bounceLine.bounceRate.toFixed(2), "2.00");
  assert.equal(bounceLine.warn, true);

  const complaintLine = emailHealthRates({ delivered: 10000, bounced: 0, complained: 8 });
  assert.equal(complaintLine.complaintRate.toFixed(2), "0.08");
  assert.equal(complaintLine.warn, true);

  const underComplaint = emailHealthRates({ delivered: 10000, bounced: 0, complained: 7 });
  assert.ok(underComplaint.complaintRate < 0.08);
  assert.equal(underComplaint.warn, false);
});

test("GoHighLevel suppression tags and email DND, and never throws", async () => {
  const calls = [];
  const result = await suppressGhlEmail({
    email: "Bad.User@Example.com",
    reason: "bounce",
    env: { GHL_API_TOKEN: "pit-test" },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(String(init.body)) : null });
      if (String(url).includes("/contacts/search/duplicate")) {
        return new Response(JSON.stringify({ contact: { id: "contact_9" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });
  assert.deepEqual(result, { ok: true, skipped: false, contactId: "contact_9" });
  assert.match(calls[0].url, /locationId=hkAJnVH8EJpMcgq9bNjG/);
  assert.match(calls[0].url, /email=bad.user%40example.com/);
  assert.equal(calls[0].url.includes(GHL_DEFAULT_LOCATION_ID), true);
  const tag = calls.find((call) => call.method === "POST" && call.url.endsWith("/tags"));
  assert.deepEqual(tag.body.tags, [GHL_EMAIL_BOUNCED_TAG]);
  const dnd = calls.find((call) => call.method === "PUT");
  assert.equal(dnd.body.dnd, undefined);
  assert.equal(dnd.body.dndSettings.Email.status, "permanent");
  assert.deepEqual(buildGhlEmailDndBody("complaint").dndSettings.Email.code, "complaint");

  const complained = [];
  await suppressGhlEmail({
    email: "parent@family.ca",
    reason: "complaint",
    env: { GHL_API_TOKEN: "pit-test" },
    fetchImpl: async (url, init) => {
      complained.push(init.body ? JSON.parse(String(init.body)) : null);
      if (String(url).includes("/duplicate")) {
        return new Response(JSON.stringify({ contact: { id: "contact_2" } }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    },
  });
  assert.deepEqual(complained.find((body) => body && body.tags).tags, [GHL_EMAIL_COMPLAINED_TAG]);

  let fetches = 0;
  const missing = await suppressGhlEmail({
    email: "parent@family.ca",
    reason: "bounce",
    env: {},
    fetchImpl: async () => {
      fetches += 1;
      return new Response("{}", { status: 200 });
    },
  });
  assert.deepEqual(missing, { ok: true, skipped: true, reason: "no-api-token" });
  const absent = await suppressGhlEmail({
    email: "parent@family.ca",
    reason: "bounce",
    env: { GHL_API_TOKEN: "pit-test" },
    fetchImpl: async () => new Response(JSON.stringify({ contact: null }), { status: 404 }),
  });
  assert.deepEqual(absent, { ok: true, skipped: true, reason: "no-contact" });
  const blewUp = await suppressGhlEmail({
    email: "parent@family.ca",
    reason: "manual",
    env: { GHL_API_TOKEN: "pit-test" },
    fetchImpl: async () => {
      throw new Error("socket");
    },
  });
  assert.equal(blewUp.ok, false);
  assert.equal(fetches, 0);
});

test("routes, migration, and env docs are wired for Kyle", () => {
  const tree = src("src/routeTree.gen.ts");
  assert.match(tree, /\/api\/webhooks\/resend/);
  assert.match(tree, /\/api\/admin\/email-suppressions/);
  assert.match(tree, /\/admin-email-health/);
  const hook = src("src/routes/api/webhooks.resend.ts");
  assert.match(hook, /createFileRoute\("\/api\/webhooks\/resend"\)/);
  assert.doesNotMatch(hook, /assertSameSiteRequest/);
  const admin = src("src/routes/api/admin.email-suppressions.ts");
  assert.match(admin, /requireAdmin/);
  assert.match(admin, /assertSameSiteRequest/);
  assert.match(src("src/lib/server/search-alerts.ts"), /isSuppressed\(to\)/);
  assert.match(src("migrations/0058_email_suppressions.sql"), /email_suppressions/);
  assert.match(src("migrations/0058_email_suppressions.sql"), /email_events/);
  const example = src(".env.example");
  assert.match(example, /RESEND_WEBHOOK_SECRET=/);
  assert.match(example, /https:\/\/www\.kidease\.ca\/api\/webhooks\/resend/);
  assert.match(example, /email\.bounced/);
  assert.match(example, /suppression\.removed/);
  assert.match(src("scripts/export-suppressions.mjs"), /DATABASE_URL unset/);
  assert.match(src("src/lib/email-suppressions.ts"), /email_suppressions.reason = 'complaint'/);
});
