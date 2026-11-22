import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { appLinkPath } from "../src/lib/app-link.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("email and auth links on KidEase open the same path in the app", () => {
  const links = [
    ["https://www.kidease.ca/reset-password?token=abc", "/reset-password?token=abc"],
    ["https://kidease.ca/fr/reset-password?token=abc", "/fr/reset-password?token=abc"],
    ["https://www.kidease.ca/verify-email?token=abc", "/verify-email?token=abc"],
    ["https://www.kidease.ca/login?next=%2Finbox", "/login?next=%2Finbox"],
    ["https://www.kidease.ca/unsubscribe?token=abc", "/unsubscribe?token=abc"],
    ["https://www.kidease.ca/inbox/thread-1", "/inbox/thread-1"],
    ["https://www.kidease.ca/claim?token=abc", "/claim?token=abc"],
    ["https://www.kidease.ca/daycare/north-elm", "/daycare/north-elm"],
    ["https://www.kidease.ca/parent?tab=saved", "/parent?tab=saved"],
    ["https://www.kidease.ca/account?tab=profile&section=delete", "/account?tab=profile&section=delete"],
    ["KidEase://reset-password?token=abc", "/reset-password?token=abc"],
    ["ca.kidease.app://inbox/thread-1", "/inbox/thread-1"],
  ];
  for (const [raw, path] of links) assert.equal(appLinkPath(raw), path, raw);
});

test("other sites and open redirects stay out of the shell", () => {
  assert.equal(appLinkPath("https://evil.example/reset-password"), null);
  assert.equal(appLinkPath("http://www.kidease.ca/reset-password"), null);
  assert.equal(appLinkPath("https://www.kidease.ca//evil.example"), null);
  assert.equal(appLinkPath("https://user:pass@www.kidease.ca/inbox"), null);
  assert.equal(appLinkPath("javascript:alert(1)"), null);
  assert.equal(appLinkPath(""), null);
  assert.match(readFileSync(join(root, "src/components/native-boot.tsx"), "utf8"), /appLinkPath/);
});
