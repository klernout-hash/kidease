import assert from "node:assert/strict";
import { test } from "node:test";
import { helpDeskFor, helpForDesk } from "../src/lib/ai/desk-help.ts";

test("the active desk sets the greeting for a staff member with multiple desks", () => {
  assert.equal(helpDeskFor("/fr/provider", "parent", "staff"), "staff");
  assert.equal(helpDeskFor("/fr/parent", "provider", "staff"), "parent");
  assert.equal(helpDeskFor("/provider", "guest", null), "guest");
  assert.match(helpForDesk("staff", "fr").greeting, /personnel/);
  assert.match(helpForDesk("provider", "en").greeting, /daycare/);
});

test("bilingual starters and typed questions lead to the actual desk screens", () => {
  for (const locale of ["en", "fr"]) {
    for (const [desk, paths] of [
      ["parent", ["/parent?tab=care"]],
      ["staff", ["/provider?desk=hours", "/provider?desk=care"]],
    ]) {
      const help = helpForDesk(desk, locale);
      assert.deepEqual(help.starters.map((question) => help.answer(question)?.path),
        paths.map((path) => locale === "fr" ? "/fr" + path : path));
    }
  }
  assert.equal(helpForDesk("parent", "fr").answer("Comment pointer?"), null);
  assert.ok(helpForDesk("staff", "en").answer("Where is the kiosk?"));
});
