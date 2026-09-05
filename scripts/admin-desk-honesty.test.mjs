import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function packKeys(text, pack) {
  const start = text.indexOf(`  ${pack}: {`);
  assert.ok(start >= 0, `missing ${pack} pack`);
  const rest = text.slice(start);
  const end = pack === "en" ? rest.indexOf("\n  fr: {") : rest.lastIndexOf("\n  },");
  const block = end === -1 ? rest : rest.slice(0, end);
  return [...block.matchAll(/^\s{4}([A-Za-z][A-Za-z0-9]*):/gm)].map((m) => m[1]);
}

test("DocuSign Send is disabled when keys are not live", () => {
  const contracts = src("src/components/admin-contracts.tsx");
  assert.match(contracts, /Send \(DocuSign off\)/);
  assert.match(contracts, /mode === "live"/);
});

test("Titan webmail is an external tab and message open has a timeout", () => {
  const mail = src("src/components/admin-mail.tsx");
  assert.match(mail, /Titan webmail \(external\)/);
  assert.match(mail, /noopener noreferrer/);
  assert.match(mail, /10_000/);
  const server = src("src/lib/server/admin-mail.ts");
  assert.match(server, /8_000/);
});

test("pay CTAs stay off when Stripe is not live", () => {
  const parent = src("src/components/parent-desk.tsx");
  assert.match(parent, /desks\?\.stripeLive/);
  const pay = src("src/routes/pay.\$bookingId.tsx");
  assert.match(pay, /stripeLive && booking/);
  const inbox = src("src/routes/inbox.\$id.tsx");
  assert.match(inbox, /desks\?\.stripeLive/);
});

test("parent empties and inbox have a next action", () => {
  const parent = src("src/components/parent-desk.tsx");
  assert.match(parent, /EmptyState/);
  assert.match(parent, /emptyFindCare/);
  const inbox = src("src/components/inbox-list.tsx");
  assert.match(inbox, /noInboxLead/);
  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /list-new/);
  assert.match(provider, /declined/);
});

test("activity has kind filters and money says pending is not settled", () => {
  const admin = src("src/routes/admin.tsx");
  assert.match(admin, /activityKind/);
  assert.match(admin, /Pending totals are not settled/);
  const copy = src("src/lib/copy.ts");
  const en = packKeys(copy, "en");
  const fr = packKeys(copy, "fr");
  assert.deepEqual(fr, en);
});
