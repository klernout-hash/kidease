import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ACCOUNT_CLOSE_NOTE,
  accountDeletionUrl,
  bookingCloseStatus,
  leadCloseStatus,
  tourCloseStatus,
} from "../src/lib/account-close.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("open spot requests, tours, and leads close; finished ones stay", () => {
  assert.equal(bookingCloseStatus("requested"), "cancelled");
  assert.equal(bookingCloseStatus("under_review"), "cancelled");
  assert.equal(bookingCloseStatus("waitlist"), "cancelled");
  assert.equal(bookingCloseStatus("accepted"), null);
  assert.equal(bookingCloseStatus("active"), null);
  assert.equal(bookingCloseStatus("declined"), null);

  assert.equal(tourCloseStatus("pending"), "lost");
  assert.equal(tourCloseStatus("accepted"), "lost");
  assert.equal(tourCloseStatus("completed"), null);
  assert.equal(tourCloseStatus("declined"), null);

  assert.equal(leadCloseStatus("requested"), "closed");
  assert.equal(leadCloseStatus("received"), "closed");
  assert.equal(leadCloseStatus("answered"), null);
  assert.equal(leadCloseStatus("closed"), null);
});

test("close note has no parent name and the public URL is Canadian", () => {
  assert.doesNotMatch(ACCOUNT_CLOSE_NOTE, /@/);
  assert.match(ACCOUNT_CLOSE_NOTE, /deleted their KidEase account/);
  assert.equal(accountDeletionUrl("en"), "https://www.kidease.ca/delete-account");
  assert.equal(accountDeletionUrl("fr"), "https://www.kidease.ca/fr/delete-account");
});

test("delete and purge call the closer and do not touch payment tables", () => {
  const family = src("src/lib/server/family.ts");
  const closer = src("src/lib/server/account-close.ts");
  assert.match(family, /cancelPendingAccountWork/);
  assert.match(family, /purgeAccountExtras/);
  assert.match(closer, /status = 'cancelled'/);
  assert.match(closer, /status = 'lost'/);
  assert.match(closer, /author = 'Parent'/);
  assert.doesNotMatch(closer, /delete from payments/);
  assert.doesNotMatch(closer, /delete from invoices/);
  assert.match(closer, /update payments/);
  assert.match(closer, /DELETED_ACCOUNT_TOMBSTONE/);
  assert.doesNotMatch(closer, /stripe/i);
  assert.match(src("src/lib/copy.ts"), /deleteAccountPendingNow/);
  assert.match(src("src/lib/copy.ts"), /Les demandes de place ouvertes/);
  assert.match(src("src/components/delete-account-panel.tsx"), /deleteAccountWeb/);
});
