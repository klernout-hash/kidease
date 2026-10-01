import assert from "node:assert/strict";
import { test } from "node:test";
import { offlineSavedRows } from "../src/lib/offline-shortlist.ts";

test("offline saved rows keep name, city, and slug and drop blanks", () => {
  const rows = offlineSavedRows([
    { id: "a", name: "Kids World", city: "Edmonton", slug: "kids-world" },
    { id: "a", name: "Kids World", city: "Edmonton", slug: "kids-world" },
    { id: "", name: "Nope", city: "Winnipeg", slug: "nope" },
    { id: "b", name: "  ", city: "Toronto", slug: "blank" },
  ]);
  assert.deepEqual(rows, [{ id: "a", name: "Kids World", city: "Edmonton", slug: "kids-world" }]);
});
