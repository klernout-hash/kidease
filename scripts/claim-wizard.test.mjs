import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  CLAIM_CODE_TTL_MS,
  claimFeesAllowed,
  judgeClaimCode,
  planClaimDelivery,
} from "../src/lib/claim-wizard.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("a code is sent only to a confirmed contact when that channel is on", () => {
  const now = 1_000_000;
  assert.deepEqual(
    planClaimDelivery({
      verifiedEmail: null,
      verifiedPhone: null,
      emailChannelOn: false,
      smsChannelOn: false,
      production: true,
      sends: 0,
      sentAt: null,
      now,
    }),
    { action: "manual", reason: "no_verified_contact" },
  );
  assert.deepEqual(
    planClaimDelivery({
      verifiedEmail: "director@centre.ca",
      emailChannelOn: false,
      smsChannelOn: false,
      production: true,
      sends: 0,
      sentAt: null,
      now,
    }).reason,
    "channel_held",
  );
  assert.equal(
    planClaimDelivery({
      verifiedEmail: "director@centre.ca",
      emailChannelOn: true,
      smsChannelOn: false,
      production: true,
      sends: 0,
      sentAt: null,
      now,
    }).action,
    "send",
  );
  assert.equal(
    planClaimDelivery({
      verifiedEmail: "director@centre.ca",
      emailChannelOn: true,
      smsChannelOn: true,
      production: false,
      sends: 0,
      sentAt: null,
      now,
    }).reason,
    "destination_blocked",
  );
  assert.equal(
    planClaimDelivery({
      verifiedEmail: "director@centre.ca",
      emailChannelOn: true,
      smsChannelOn: false,
      production: true,
      sends: 5,
      sentAt: now - 1000,
      now,
    }).reason,
    "rate_limited",
  );
});

test("codes expire, lock, and a guess does not verify a claim that was never sent", () => {
  const now = 5_000_000;
  assert.deepEqual(
    judgeClaimCode({ required: false, stored: "SECRET", entered: "SECRET", sentAt: null, now, attempts: 0 }),
    { ok: true, matched: false },
  );
  assert.equal(
    judgeClaimCode({ required: true, stored: "SECRET", entered: "SECRET", sentAt: null, now, attempts: 0 }).reason,
    "not_sent",
  );
  assert.equal(
    judgeClaimCode({
      required: true,
      stored: "SECRET",
      entered: "SECRET",
      sentAt: now - CLAIM_CODE_TTL_MS - 1,
      now,
      attempts: 0,
    }).reason,
    "expired",
  );
  assert.equal(
    judgeClaimCode({ required: true, stored: "SECRET", entered: "WRONG", sentAt: now, now, attempts: 0 }).reason,
    "mismatch",
  );
  assert.equal(
    judgeClaimCode({ required: true, stored: "SECRET", entered: "SECRET", sentAt: now, now, attempts: 5 }).reason,
    "locked",
  );
  assert.deepEqual(
    judgeClaimCode({ required: true, stored: "SECRET", entered: "secret", sentAt: now, now, attempts: 1 }),
    { ok: true, matched: true },
  );
  assert.equal(claimFeesAllowed("waiting"), true);
  assert.equal(claimFeesAllowed("pending"), false);
  assert.equal(claimFeesAllowed("approved"), false);
});

test("the claim page does not print a code or grant listing ownership", () => {
  const page = src("src/routes/claim.tsx") + src("src/components/claim-wizard.tsx");
  const claims = src("src/lib/server/claims.ts");
  const start = claims.slice(claims.indexOf("export const startClaim"), claims.indexOf("export const verifyClaim"));
  const verify = claims.slice(claims.indexOf("export const verifyClaim"), claims.indexOf("export const saveClaimFees"));
  assert.doesNotMatch(page, /pending\.code|font-mono text-lg/);
  assert.match(page, /claim-step-code/);
  assert.match(page, /claim-step-licence/);
  assert.match(page, /claim-step-terms/);
  assert.match(page, /claim-pending/);
  assert.match(page, /claim-fees/);
  assert.match(start, /verifiedEmail: null/);
  assert.match(start, /verifiedPhone: null/);
  assert.doesNotMatch(start, /phone: listed\.phone/);
  assert.match(verify, /judgeClaimCode/);
  assert.match(verify, /alreadyPending/);
  assert.match(verify, /claim_status = 'waiting'/);
  assert.doesNotMatch(verify, /ensureOwnerMembership|provider_daycares|saveCentreMonthlyFees/);
  assert.match(claims, /claimFeesAllowed/);
  assert.match(src("src/lib/server/approve-centre.ts"), /ensureOwnerMembership/);
  assert.match(src("src/styles.css"), /data-ke="claim-page"/);
});

test("pending fees stay on the claim row and another account cannot write them", async () => {
  const pg = new PGlite();
  await pg.exec(`
    create table listing_claims (
      id text primary key,
      daycare_id text not null,
      user_id text not null,
      code text not null,
      status text not null,
      contact_verified int not null default 0,
      code_attempts int not null default 0,
      code_sent_at timestamptz,
      fee_infant integer,
      fee_toddler integer,
      fee_preschool integer
    );
  `);
  await pg.query(
    "insert into listing_claims (id, daycare_id, user_id, code, status, contact_verified, code_sent_at) values ('a', 'centre', 'owner', 'SECRET', 'waiting', 1, now())",
  );
  await pg.query(
    "insert into listing_claims (id, daycare_id, user_id, code, status) values ('b', 'centre', 'other', 'OTHER', 'pending')",
  );
  const mine = await pg.query("select id, status from listing_claims where user_id = 'owner' and daycare_id = 'centre' and status = 'waiting'");
  assert.equal(claimFeesAllowed(mine.rows[0].status), true);
  await pg.query("update listing_claims set fee_infant = 900 where id = 'a' and user_id = 'owner'");
  const stolen = await pg.query("select id from listing_claims where user_id = 'other' and daycare_id = 'centre' and status = 'waiting'");
  assert.equal(stolen.rows.length, 0);
  const saved = await pg.query("select fee_infant from listing_claims where id = 'a'");
  assert.equal(saved.rows[0].fee_infant, 900);
  const publicFees = await pg.query("select to_regclass('daycares') as name");
  assert.equal(publicFees.rows[0].name, null);
  await pg.close();
});
