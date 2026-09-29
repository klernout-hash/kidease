import assert from "node:assert/strict";
import test from "node:test";
import { displayCentreName } from "../src/lib/utils.ts";

test("display names clean scraped registry text without rewriting mixed-case names", () => {
  assert.equal(displayCentreName("Little Fox Child Care Cetnre"), "Little Fox Child Care Centre");
  assert.equal(displayCentreName('"Hummingbird" Ihmacc'), "Hummingbird Ihmacc");
  assert.equal(displayCentreName("1St Ave Montessori"), "1st Ave Montessori");
  assert.equal(displayCentreName("ABC MONTESSORI"), "ABC Montessori");
  assert.equal(displayCentreName("YMCA Child Care"), "YMCA Child Care");
});
