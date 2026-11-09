import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  MESSAGE_CHANNEL_ID,
  ordinaryApnsAps,
  ordinaryFcmMessage,
  pushOpenPath,
  pushPermissionDecision,
  pushRegisterLocale,
} from "../src/lib/push-lifecycle.ts";
import { revokePushDeviceToken } from "../src/lib/server/push-tokens.ts";
import { googleSignInEnabled } from "../src/lib/auth/google-login-flag.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("a notification tap opens only a KidEase page", () => {
  assert.equal(pushOpenPath("https://www.kidease.ca/inbox/thread-1?view=centre"), "/inbox/thread-1?view=centre");
  assert.equal(pushOpenPath("https://kidease.ca/fr/inbox/thread-1"), "/fr/inbox/thread-1");
  assert.equal(pushOpenPath("https://evil.example/inbox/thread-1"), null);
  assert.equal(pushOpenPath("javascript:alert(1)"), null);
  assert.equal(pushOpenPath("https://user:pass@www.kidease.ca/inbox"), null);
  assert.equal(pushOpenPath("/inbox/thread-1"), null);
});

test("French profile locale is stored, and a missing locale stays English", () => {
  assert.equal(pushRegisterLocale("fr-CA"), "fr");
  assert.equal(pushRegisterLocale("fr"), "fr");
  assert.equal(pushRegisterLocale("en-CA"), "en");
  assert.equal(pushRegisterLocale(""), "en");
});

test("a denied notification permission does not register", () => {
  assert.equal(pushPermissionDecision("granted"), "register");
  assert.equal(pushPermissionDecision("prompt"), "ask");
  assert.equal(pushPermissionDecision("denied"), "denied");
});

test("ordinary alerts use a private message channel and do not invent a badge", () => {
  const message = ordinaryFcmMessage({
    token: "abc",
    title: "New message",
    body: "You have a message about Example Centre.",
    url: "https://www.kidease.ca/inbox/t1",
  });
  assert.equal(message.message.android.priority, "NORMAL");
  assert.equal(message.message.android.notification.channel_id, MESSAGE_CHANNEL_ID);
  assert.equal(message.message.android.notification.visibility, "PRIVATE");
  assert.equal(JSON.stringify(message).includes("child"), false);
  const aps = ordinaryApnsAps({ title: "New message", body: "You have a message about Example Centre." });
  assert.equal("badge" in aps, false);
  assert.equal("interruption-level" in aps, false);
});

test("sign-out drops only this account's token", async () => {
  const rows = [
    { user_id: "parent-a", token: "a".repeat(32) },
    { user_id: "parent-b", token: "b".repeat(32) },
  ];
  const sql = {
    async query(text, params = []) {
      const sqlText = String(text).toLowerCase();
      if (sqlText.startsWith("delete from push_device_tokens")) {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i -= 1) {
          if (rows[i].user_id === params[0] && rows[i].token === params[1]) rows.splice(i, 1);
        }
        return [{ n: before - rows.length }];
      }
      return [];
    },
  };
  assert.equal(await revokePushDeviceToken(sql, "parent-a", "b".repeat(32)), true);
  assert.equal(rows.length, 2);
  assert.equal(await revokePushDeviceToken(sql, "parent-a", "a".repeat(32)), true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, "parent-b");
});

test("Google sign-in stays off until its own flag is on", () => {
  assert.equal(googleSignInEnabled({}), false);
  assert.equal(googleSignInEnabled({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" }), false);
});

test("this Play source does not ask for the photo library", () => {
  const manifest = readFileSync(join(root, "android/app/src/main/AndroidManifest.xml"), "utf8");
  assert.equal(manifest.includes("READ_MEDIA_IMAGES"), false);
  assert.equal(manifest.includes("READ_EXTERNAL_STORAGE"), false);
  assert.match(manifest, /android:localeConfig="@xml\/locales_config"/);
  const channel = readFileSync(
    join(root, "android/app/src/main/java/ca/kidease/app/MessageChannel.java"),
    "utf8",
  );
  assert.match(channel, /VISIBILITY_PRIVATE/);
  assert.match(channel, /IMPORTANCE_DEFAULT/);
});
