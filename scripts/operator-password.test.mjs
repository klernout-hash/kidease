import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { operatorResetEmail, operatorResetPassword } from "./set-operator-password.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("operator credential reset (no secret in repo)", () => {
  it("reads OPERATOR_RESET_PASSWORD from env and defaults to kyle@kidease.ca", () => {
    assert.equal(operatorResetEmail({}), "kyle@kidease.ca");
    assert.equal(operatorResetEmail({ ADMIN_EMAIL: "ops@example.com" }), "ops@example.com");
    assert.equal(
      operatorResetEmail({ OPERATOR_RESET_EMAIL: "kyle@kidease.ca", ADMIN_EMAIL: "other@x.com" }),
      "kyle@kidease.ca",
    );
    assert.equal(operatorResetPassword({}), "");
    assert.equal(operatorResetPassword({ OPERATOR_RESET_PASSWORD: "  " }), "");
    assert.equal(operatorResetPassword({ OPERATOR_RESET_PASSWORD: "long-enough" }), "long-enough");
  });

  it("is wired through migrate and never commits a password value", () => {
    const script = read("scripts/set-operator-password.mjs");
    const migrate = read("scripts/migrate.mjs");
    const example = read(".env.example");
    const pkg = read("package.json");
    assert.match(script, /hashPassword/);
    assert.match(script, /providerId" = 'credential'/);
    assert.match(script, /OPERATOR_RESET_PASSWORD/);
    assert.match(migrate, /applyOperatorCredentialFromEnv/);
    assert.match(pkg, /ops:operator-password/);
    assert.match(example, /# OPERATOR_RESET_PASSWORD=/);
    assert.doesNotMatch(example, /^OPERATOR_RESET_PASSWORD=.+/m);
    assert.doesNotMatch(script, /Winnipeg/i);
    assert.doesNotMatch(script, /OPERATOR_RESET_PASSWORD\s*=\s*["'`][^"'`]+["'`]/);
  });
});
