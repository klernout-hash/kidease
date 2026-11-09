import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { customerAlertSummary } from "../src/lib/customer-alert-policy.ts";

const inbox = readFileSync(new URL("../src/lib/server/inbox.ts", import.meta.url), "utf8");

test("a message alert names the centre and follows the reader's language", () => {
  const en = customerAlertSummary({ kind: "message", centreName: "Oaks", locale: "en" });
  const fr = customerAlertSummary({ kind: "message", centreName: "Oaks", locale: "fr" });
  assert.match(en.subject, /Oaks/);
  assert.match(fr.subject, /Oaks/);
  assert.match(fr.preview, /nouveau message/i);
  assert.doesNotMatch(`${en.subject} ${en.preview} ${fr.subject} ${fr.preview}`, /my child is sick/i);
  assert.match(inbox, /savedMessageLocale/);
  assert.doesNotMatch(inbox, /detail: body\.slice/);
  assert.match(inbox, /QA_TOUR_CENTRE_ID/);
});
