import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  canRemoveLink,
  canSetAccess,
  decideAccept,
  invitePath,
  recordOnFamily,
  scopeFromLinks,
  tokenOk,
  VIEW_ONLY_MESSAGE,
  SHARED_RECORD_KINDS,
} from "../src/lib/coparent.ts";
import { coparentCopy } from "../src/lib/coparent-copy.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { coparentLinkEnabled } from "../src/lib/features.ts";
import { visibleDeskNav } from "../src/lib/desk-nav.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

const owner = "user_owner";
const other = "user_other";

function link(partial) {
  return {
    id: "cp_1",
    ownerUserId: owner,
    memberUserId: null,
    access: "view",
    status: "pending",
    inviteToken: "a".repeat(24),
    ...partial,
  };
}

test("co-parent linking stays off and sends no email or SMS", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_COPARENT_LINK, false);
  assert.equal(coparentLinkEnabled({}), false);
  assert.equal(coparentLinkEnabled({ FEATURE_COPARENT_LINK: "1" }), true);
  assert.match(src(".env.example"), /^FEATURE_COPARENT_LINK=0$/m);
  const server = src("src/lib/server/coparent.ts");
  assert.doesNotMatch(server, /sendSms|sendTransactionalMail|sendMail|twilio/i);
  assert.match(server, /invitePath/);
  assert.match(src("migrations/0158_coparent_links.sql"), /coparent_links/);
  assert.equal(visibleDeskNav("parent").some((item) => item.id === "family"), false);
  assert.equal(visibleDeskNav("parent", { coparentLink: true }).some((item) => item.id === "family"), true);
  const page = src("src/components/coparent-desk.tsx") + src("src/lib/coparent-copy.ts");
  assert.doesNotMatch(page, /subscription|sponsored|USD|\$\d|free forever/i);
});

test("an invite is an in-app link and a second login does not share until it is accepted", () => {
  const pending = link();
  assert.equal(tokenOk(pending.inviteToken), true);
  assert.equal(tokenOk("short"), false);
  assert.equal(invitePath(pending.inviteToken), `/parent?tab=family&invite=${pending.inviteToken}`);
  assert.equal(invitePath(pending.inviteToken, "/fr/parent").startsWith("/fr/parent?tab=family&invite="), true);
  const before = scopeFromLinks(other, [pending], true);
  assert.equal(before.linked, false);
  assert.equal(before.dataUserId, other);
  assert.equal(before.canWrite, true);
  const active = link({ status: "active", memberUserId: other, access: "view" });
  const member = scopeFromLinks(other, [active], true);
  assert.equal(member.linked, true);
  assert.equal(member.dataUserId, owner);
  assert.equal(member.access, "view");
  assert.equal(member.canWrite, false);
  assert.equal(VIEW_ONLY_MESSAGE.includes("look"), true);
  const full = scopeFromLinks(other, [link({ status: "active", memberUserId: other, access: "full" })], true);
  assert.equal(full.canWrite, true);
  const main = scopeFromLinks(owner, [active], true);
  assert.equal(main.dataUserId, owner);
  assert.equal(main.canWrite, true);
  assert.equal(main.linked, true);
  assert.deepEqual(scopeFromLinks(other, [active], false), {
    actorId: other,
    dataUserId: other,
    access: "owner",
    canWrite: true,
    linked: false,
  });
});

test("shared children, tours, waitlists, messages, and bills follow the main parent", () => {
  const member = scopeFromLinks(other, [link({ status: "active", memberUserId: other, access: "full" })], true);
  for (const kind of SHARED_RECORD_KINDS) {
    assert.equal(recordOnFamily(member, owner), true, kind);
  }
  assert.equal(recordOnFamily(member, other), false);
  assert.equal(recordOnFamily(member, "someone-else"), false);
  const removed = scopeFromLinks(other, [link({ status: "removed", memberUserId: other, access: "full" })], true);
  assert.equal(removed.linked, false);
  assert.equal(recordOnFamily(removed, owner), false);
});

test("only the main parent sets access or removes, and a person cannot accept their own invite", () => {
  const pending = link();
  const active = link({ status: "active", memberUserId: other, access: "view" });
  assert.equal(decideAccept({ actorId: owner, link: pending, actorHasOpenFamily: false }).ok, false);
  assert.equal(decideAccept({ actorId: owner, link: pending, actorHasOpenFamily: false }).error, "self");
  assert.equal(decideAccept({ actorId: other, link: pending, actorHasOpenFamily: false }).ok, true);
  assert.equal(decideAccept({ actorId: other, link: pending, actorHasOpenFamily: true }).error, "busy");
  assert.equal(decideAccept({ actorId: other, link: active, actorHasOpenFamily: false }).error, "closed");
  assert.equal(decideAccept({ actorId: other, link: null, actorHasOpenFamily: false }).error, "missing");
  assert.equal(canSetAccess(owner, active, "full"), true);
  assert.equal(canSetAccess(other, active, "full"), false);
  assert.equal(canSetAccess(owner, link({ status: "removed" }), "view"), false);
  assert.equal(canRemoveLink(owner, active), true);
  assert.equal(canRemoveLink(other, active), false);
  assert.equal(canRemoveLink(owner, link({ status: "removed", memberUserId: other })), false);
  const fr = coparentCopy("fr");
  const en = coparentCopy("en");
  assert.match(fr.noSend, /courriel/);
  assert.match(en.noSend, /email or text/);
  assert.equal(fr.shared.length > en.shared.length, true);
});
