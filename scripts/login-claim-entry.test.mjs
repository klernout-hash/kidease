import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { claimListingScore } from "../src/lib/claim-search.ts";
import { loginSubmittedText } from "../src/lib/login-fields.ts";

const wheels = {
  id: "mb-101322",
  name: "L'il Wheels Day Care",
  licenseNumber: "MB-101322",
  city: "Winnipeg",
  address: "1 Example St",
  postalCode: "R3C 0A1",
};

test("a vault fill is read from the form when React state is still empty", () => {
  const form = { get: (name) => (name === "email" ? "person@example.com" : "correct horse") };
  assert.equal(loginSubmittedText(form, "email", "", true), "person@example.com");
  assert.equal(loginSubmittedText(form, "password", "", false), "correct horse");
  assert.equal(loginSubmittedText({ get: () => "" }, "email", "", true), "");
});

test("claim search matches the real centre name, licence tail, and id", () => {
  assert.ok(claimListingScore("L'il Wheels DayCare", wheels) >= 80);
  assert.ok(claimListingScore("101322", wheels) >= 30);
  assert.ok(claimListingScore("mb-101322", wheels) >= 30);
  assert.ok(claimListingScore("L'il Wheels Day Care", wheels) >= 80);
  assert.equal(claimListingScore("no-such-centre", wheels), 0);
});

test("provider overview is the today desk, and a signed-out claim link does not start a claim", () => {
  const provider = readFileSync(new URL("../src/routes/provider.tsx", import.meta.url), "utf8");
  assert.match(provider, /deskRaw === "overview" \? "today"/);
  const claim = readFileSync(new URL("../src/routes/claim.tsx", import.meta.url), "utf8");
  const login = readFileSync(new URL("../src/routes/login.tsx", import.meta.url), "utf8");
  assert.match(claim, /previewClaimTarget/);
  assert.match(claim, /data-ke="claim-selected"/);
  assert.match(claim, /if \(!user\)/);
  assert.match(login, /name="email"/);
  assert.match(login, /name="password"/);
  assert.doesNotMatch(login, /value=\{email\}/);
  assert.doesNotMatch(login, /value=\{password\}/);
});
