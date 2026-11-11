import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { familyInviteEnabled } from "../src/lib/features.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";

test("connecting a family stays off and does not send", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_FAMILY_INVITE, false);
  assert.equal(familyInviteEnabled({}), false);
  assert.equal(familyInviteEnabled({ FEATURE_FAMILY_INVITE: "1" }), true);
  const panel = readFileSync(new URL("../src/components/family-invite-gap.tsx", import.meta.url), "utf8");
  assert.match(panel, /if \(!on\) return null/);
  assert.match(panel, /disabled/);
  assert.doesNotMatch(panel, /sendMail|sendSms|fetch\(/);
});
