import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleThreadMessages } from "../src/lib/thread-history.ts";

test("family thread keeps the request note and the replies", () => {
  const history = visibleThreadMessages([
    { id: "1", sender: "system", body: "A parent asked for a visit.", kind: "system", createdAt: "" },
    { id: "2", sender: "system", body: "Push copy", kind: "notify", createdAt: "" },
    { id: "3", sender: "parent", body: "Can we come Tuesday?", kind: "chat", createdAt: "" },
    { id: "4", sender: "provider", body: "Yes, 10:00.", kind: "chat", createdAt: "" },
    { id: "5", sender: "provider", body: "   ", kind: "chat", createdAt: "" },
  ]);
  assert.deepEqual(history.map((message) => message.id), ["1", "3", "4"]);
});
