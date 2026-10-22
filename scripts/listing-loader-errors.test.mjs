import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { isNotFound, isRedirect, notFound, redirect } from "@tanstack/react-router";
import { isTransientListingError, rethrowRouterControl } from "../src/lib/listing-loader-errors.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("a 301 redirect and notFound are rethrown; a plain Error becomes not-found", () => {
  const moved = redirect({
    to: "/daycare/$slug",
    params: { slug: "prairie-nature-children-s-centre-7858" },
    statusCode: 301,
  });
  assert.equal(moved.status, 301);
  assert.equal(isRedirect(moved), true);
  assert.throws(
    () => rethrowRouterControl(moved, "prairie-nature-children-s-cetnre-7858"),
    (error) => error === moved,
  );

  const missing = notFound();
  assert.equal(isNotFound(missing), true);
  assert.throws(
    () => rethrowRouterControl(missing, "missing-listing"),
    (error) => error === missing,
  );

  const failure = new Error("catalogue lookup failed");
  const seen = [];
  const original = console.error;
  console.error = (...args) => {
    seen.push(args);
  };
  try {
    assert.throws(
      () => rethrowRouterControl(failure, "frontenac-before-and-after-school-program-96e01725"),
      (error) => isNotFound(error) && error !== failure,
    );
  } finally {
    console.error = original;
  }
  assert.deepEqual(seen, [
    ["[listing-loader]", "frontenac-before-and-after-school-program-96e01725", failure],
  ]);
});

test("a 429 stays a retry, not a missing listing", () => {
  const busy = new Error("Too many requests");
  assert.equal(isTransientListingError(busy), true);
  assert.equal(isTransientListingError({ status: 429 }), true);
  assert.equal(isTransientListingError(new Error("catalogue lookup failed")), false);
  assert.throws(
    () => rethrowRouterControl(busy, "little-fox-child-care-centre-103205"),
    (error) => error === busy,
  );
});

test("no route detects redirects with the isRedirect in operator", () => {
  const routesDir = join(root, "src/routes");
  const hits = [];
  for (const name of readdirSync(routesDir, { recursive: true }).map(String)) {
    if (!name.endsWith(".ts") && !name.endsWith(".tsx")) continue;
    const text = readFileSync(join(routesDir, name), "utf8");
    if (text.includes('"isRedirect" in') || text.includes("'isRedirect' in")) hits.push(name);
  }
  assert.deepEqual(hits, []);
});
