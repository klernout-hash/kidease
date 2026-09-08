import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ENVIRONMENT_NAMES,
  EPHEMERAL_NAMES,
  GROUPS,
  VERCEL_PROJECT,
  formatChecklist,
  listedVariableNames,
  parseEnvExampleNames,
  presenceReport,
} from "./1password-env-inventory.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const CRITICAL_IDS = [
  "neon",
  "better-auth",
  "stripe",
  "twilio",
  "inngest",
  "posthog",
  "docusign",
  "r2",
];

test("inventory names exist in .env.example and never carry values", () => {
  const example = src(".env.example");
  const documented = new Set(parseEnvExampleNames(example));
  const names = listedVariableNames();
  assert.equal(new Set(names).size, names.length, "duplicate inventory names");
  for (const name of names) {
    assert.match(name, /^[A-Z][A-Z0-9_]+$/);
    assert.ok(documented.has(name), `${name} missing from .env.example`);
  }
  for (const group of GROUPS) {
    for (const item of group.vars) {
      assert.equal(typeof item.concealed, "boolean", item.name);
      assert.equal(typeof item.required, "boolean", item.name);
      assert.ok(["both", "production", "preview"].includes(item.vercel), item.name);
      assert.equal(Object.hasOwn(item, "value"), false, item.name);
    }
  }
});

test("critical vendor groups and Environment names are fixed", () => {
  assert.deepEqual(
    GROUPS.filter((group) => group.id !== "ops-also").map((group) => group.id),
    CRITICAL_IDS,
  );
  assert.deepEqual(
    ENVIRONMENT_NAMES.map((item) => item.name),
    ["KidEase Production", "KidEase Preview"],
  );
  assert.equal(VERCEL_PROJECT, "kidease-git");
  assert.deepEqual(EPHEMERAL_NAMES, ["OPERATOR_RESET_EMAIL", "OPERATOR_RESET_PASSWORD"]);
});

test("checklist and presence report never include secret-like values", () => {
  const text = formatChecklist();
  assert.match(text, /KidEase Production/);
  assert.match(text, /DATABASE_URL/);
  assert.match(text, /INNGEST_SIGNING_KEY/);
  assert.match(text, /R2_SECRET_ACCESS_KEY/);
  assert.doesNotMatch(text, /sk_live_|sk_test_|whsec_|AKIA|BEGIN RSA|postgresql:\/\//i);
  assert.doesNotMatch(text, /phc_[A-Za-z0-9]/);

  const report = presenceReport(["BETTER_AUTH_SECRET", "MISSING_TEST_KEY"], {
    BETTER_AUTH_SECRET: "should-never-be-printed",
    MISSING_TEST_KEY: "",
  });
  assert.deepEqual(report.present, ["BETTER_AUTH_SECRET"]);
  assert.deepEqual(report.missing, ["MISSING_TEST_KEY"]);
  const printed = JSON.stringify(report);
  assert.doesNotMatch(printed, /should-never-be-printed/);
});

test("ops docs and safe hooks stay names-only", () => {
  const docs = src("docs/1password-environments.md");
  assert.match(docs, /KidEase Production/);
  assert.match(docs, /1Password Environments/);
  assert.match(docs, /DATABASE_URL/);
  assert.match(docs, /INNGEST_EVENT_KEY/);
  assert.match(docs, /Do not invent/);
  assert.doesNotMatch(docs, /sk_live_[A-Za-z0-9]+/);
  assert.doesNotMatch(docs, /postgresql:\/\/[^.]+:[^@]+@/);

  const toml = src(".1password/environments.toml");
  assert.match(toml, /mount_paths = \["\.env"\]/);
  assert.doesNotMatch(toml, /sk_|token|password\s*=/i);

  const vite = src("vite.config.ts");
  assert.match(vite, /ignored: \["\*\*\/\.env", "\*\*\/\.env\.local", "\*\*\/\.env\.\*\.local"\]/);

  const envExample = src(".env.example");
  assert.match(envExample, /docs\/1password-environments\.md/);
  assert.match(src("SECURITY.md"), /docs\/1password-environments\.md/);
  assert.match(src("docs/inngest.md"), /docs\/1password-environments\.md/);
  assert.match(src("package.json"), /"ops:1password-checklist"/);
});
