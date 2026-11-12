import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { applyQuickReply, threadQuickReplies } from "../src/lib/thread-quick-replies.ts";

test("a parent gets reply choices in English and French", () => {
  const en = threadQuickReplies({ viewerIsParent: true, locale: "en" });
  const fr = threadQuickReplies({ viewerIsParent: true, locale: "fr" });
  assert.ok(en.length >= 4);
  assert.equal(en.length, fr.length);
  assert.deepEqual(en.map((r) => r.id), fr.map((r) => r.id));
  for (const reply of [...en, ...fr]) assert.ok(reply.title && reply.body);
});

test("picking a reply fills the draft and keeps typed text", () => {
  const [first] = threadQuickReplies({ viewerIsParent: true, locale: "en" });
  assert.equal(applyQuickReply("", first), first.body);
  assert.equal(applyQuickReply("Hello.", first), `Hello.\n${first.body}`);
});

test("the parent thread shows replies under Quick replies, not the attachment note", () => {
  const src = readFileSync(new URL("../src/routes/inbox.$id.tsx", import.meta.url), "utf8");
  assert.match(src, /threadQuickReplies\(/);
  assert.match(src, /setBody\(\(draft\) => applyQuickReply\(draft, reply\)\)/);
  assert.doesNotMatch(src, /inboxAttachSoon/);
});
