import assert from "node:assert/strict";
import { test } from "node:test";
import { helpCentreEnabled, searchHelp, supportMail } from "../src/lib/help-centre.ts";

test("the help centre defaults off and mail is not built", () => {
  assert.equal(helpCentreEnabled({}), false);
  assert.equal(
    supportMail({ enabled: false, name: "Ada", replyTo: "ada@example.com", body: "Hello", locale: "en" }),
    null,
  );
});

test("search finds French and English articles", () => {
  const en = searchHelp("claim", "en");
  assert.equal(en.some((row) => row.id === "claim"), true);
  const fr = searchHelp("signaler", "fr");
  assert.equal(fr.some((row) => row.id === "report"), true);
  assert.equal(searchHelp("zzzz", "en").length, 0);
});

test("a canned reply is addressed to support", () => {
  const mail = supportMail({
    enabled: true,
    name: "Ada",
    replyTo: "ada@example.com",
    body: "Where is my tour?",
    cannedId: "got-it",
    locale: "en",
  });
  assert.equal(mail?.to, "support@kidease.ca");
  assert.match(mail?.text || "", /Thanks/);
  assert.doesNotMatch(mail?.text || "", /free forever/i);
});
