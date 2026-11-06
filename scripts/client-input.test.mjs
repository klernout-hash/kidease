import assert from "node:assert/strict";
import test from "node:test";
import { ClientInputError, requireClientRecord } from "../src/lib/observe.ts";
import { reportError } from "../src/lib/observe.ts";

test("an empty server payload is a client input error, not an incident", () => {
  assert.throws(() => requireClientRecord(undefined), ClientInputError);
  assert.throws(() => requireClientRecord(null), ClientInputError);
  assert.equal(requireClientRecord({ daycareId: "abc" }).daycareId, "abc");
  const lines = [];
  const real = console.error;
  console.error = (...args) => lines.push(args.join(" "));
  try {
    reportError(new ClientInputError(), { route: "server-fn" });
  } finally {
    console.error = real;
  }
  assert.equal(lines.length, 0);
});
