import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  filterInboxList,
  inboxStatusLine,
  messageFilterCopyKey,
  readByNames,
  withYouPrefix,
} from "../src/lib/inbox-thread-ui.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("message filters use Canada labels and hide archived rows", () => {
  assert.equal(messageFilterCopyKey("requests", "family"), "inboxFilterRequests");
  assert.equal(messageFilterCopyKey("requests", "centre"), "inboxFilterInquiries");
  assert.equal(messageFilterCopyKey("archived", "family"), "inboxFilterArchived");
  const rows = [
    { id: "1", parentName: "Melissa", preview: "Hi", daycareName: "Casa", unread: true, status: "requested", archived: false },
    { id: "2", parentName: "Carol", preview: "Thanks", daycareName: "Casa", unread: false, status: "accepted", archived: true },
    { id: "3", parentName: "Alan", preview: "Tour", daycareName: "Casa", unread: false, tourStatus: "accepted", archived: false },
  ];
  assert.deepEqual(filterInboxList(rows, { filter: "all" }).map((row) => row.id), ["1", "3"]);
  assert.deepEqual(filterInboxList(rows, { filter: "unread" }).map((row) => row.id), ["1"]);
  assert.deepEqual(filterInboxList(rows, { filter: "requests" }).map((row) => row.id), ["1"]);
  assert.deepEqual(filterInboxList(rows, { filter: "archived" }).map((row) => row.id), ["2"]);
});

test("status line and You prefix stay honest", () => {
  assert.deepEqual(inboxStatusLine({ status: "accepted" }), { key: "inboxStatusEnrolled", dot: "ok" });
  assert.deepEqual(inboxStatusLine({ tourStatus: "accepted" }), { key: "inboxStatusTourBooked", dot: "ok" });
  assert.deepEqual(inboxStatusLine({ status: "requested" }), { key: "inboxStatusRequestPending", dot: "wait" });
  assert.equal(withYouPrefix(true, "Your very welcome!", "You: "), "You: Your very welcome!");
  assert.equal(withYouPrefix(false, "Great", "You: "), "Great");
  assert.equal(withYouPrefix(true, "You: already", "You: "), "You: already");
});

test("read receipts skip the viewer and people who have not caught up", () => {
  const names = readByNames(
    [
      { userId: "me", name: "Me", lastReadAt: "2026-10-16T20:00:00.000Z" },
      { userId: "alan", name: "Alan", lastReadAt: "2026-10-16T20:05:00.000Z" },
      { userId: "carol", name: "Carol", lastReadAt: "2026-10-16T19:00:00.000Z" },
    ],
    "2026-10-16T20:01:00.000Z",
    "me",
  );
  assert.deepEqual(names, ["Alan"]);
});

test("star, archive, and unread are per user and admin can set them without a reply", () => {
  const migration = src("migrations/0088_conversation_user_state.sql");
  assert.match(migration, /conversation_user_state/);
  assert.match(migration, /starred/);
  assert.match(migration, /archived_at/);
  assert.match(migration, /marked_unread/);
  const state = src("src/lib/server/conversation-state.ts");
  assert.match(state, /requireConversationRead/);
  assert.doesNotMatch(state, /requireConversationWrite/);
  const access = src("src/lib/server/thread-access.ts");
  assert.match(access, /marked_unread = false/);
});

test("in-app chat never shows SMS STOP wording", () => {
  const files = [
    "src/components/thread-chrome.tsx",
    "src/components/inbox-row.tsx",
    "src/components/conversation-details.tsx",
    "src/components/inbox-list.tsx",
    "src/components/centre-inbox.tsx",
    "src/routes/inbox.$id.tsx",
  ];
  for (const file of files) {
    const text = src(file);
    assert.doesNotMatch(text, /Reply STOP|unsubscribe|opt out/i, file);
  }
  assert.match(src("src/routes/inbox.$id.tsx"), /chatBodyWithoutSmsFooter/);
  assert.match(src("src/components/thread-chrome.tsx"), /chatBodyWithoutSmsFooter/);
});
