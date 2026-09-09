import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { inAppChatEnabled } from "../src/lib/features.ts";
import { chatComposerState } from "../src/lib/chat-scaffold.ts";
import { localePath, localeSwitchPath } from "../src/lib/locale-path.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("FEATURE_INAPP_CHAT off hides the guest Live Chat composer", () => {
  assert.equal(inAppChatEnabled({}), false);
  assert.equal(inAppChatEnabled({ FEATURE_INAPP_CHAT: "0" }), false);
  const off = chatComposerState(false);
  assert.equal(off.disabled, true);
  assert.equal(off.enabled, false);
  const bot = src("src/components/help-bot.tsx");
  assert.match(bot, /inAppChatEnabled\(\)/);
  assert.match(bot, /if \(!inAppChatEnabled\(\)\) return null/);
  assert.match(bot, /FEATURE_INAPP_CHAT is parked off/);
  const ai = src("src/lib/server/ai.ts");
  assert.match(ai, /if \(!inAppChatEnabled\(\)\)/);
  assert.match(ai, /CHAT_FLAG_OFF_MESSAGE/);
  assert.match(src("docs/chat.md"), /gated on `FEATURE_INAPP_CHAT`/);
});

test("FR get-app, benefits, and login routes exist and pair with English", () => {
  for (const file of ["src/routes/fr.get-app.tsx", "src/routes/fr.benefits.tsx", "src/routes/fr.login.tsx"]) {
    assert.equal(existsSync(join(root, file)), true, file);
  }
  assert.match(src("src/routes/fr.get-app.tsx"), /createFileRoute\("\/fr\/get-app"\)/);
  assert.match(src("src/routes/fr.benefits.tsx"), /createFileRoute\("\/fr\/benefits"\)/);
  assert.match(src("src/routes/fr.login.tsx"), /createFileRoute\("\/fr\/login"\)/);
  assert.match(src("src/routes/fr.get-app.tsx"), /GetAppScreen/);
  assert.match(src("src/routes/fr.benefits.tsx"), /BenefitsPage/);
  assert.match(src("src/routes/fr.login.tsx"), /LoginScreen/);
  assert.equal(localePath("/get-app", "fr"), "/fr/get-app");
  assert.equal(localePath("/benefits", "fr"), "/fr/benefits");
  assert.equal(localePath("/login", "fr"), "/fr/login");
  assert.equal(localeSwitchPath("/get-app", "fr"), "/fr/get-app");
  assert.equal(localeSwitchPath("/benefits", "fr"), "/fr/benefits");
  assert.equal(localeSwitchPath("/login", "fr"), "/fr/login");
  const tree = src("src/routeTree.gen.ts");
  assert.match(tree, /from '\.\/routes\/fr\.get-app'/);
  assert.match(tree, /from '\.\/routes\/fr\.benefits'/);
  assert.match(tree, /from '\.\/routes\/fr\.login'/);
  assert.match(tree, /id:\s*'\/fr\/get-app'/);
  assert.match(tree, /id:\s*'\/fr\/benefits'/);
  assert.match(tree, /id:\s*'\/fr\/login'/);
  assert.match(src("src/lib/use-copy.ts"), /pathLocale\(pathname\) === "fr"/);
});

test("bare /pay is an empty-state hub, not a missing route", () => {
  assert.equal(existsSync(join(root, "src/routes/pay.tsx")), true);
  assert.equal(existsSync(join(root, "src/routes/pay.index.tsx")), true);
  const layout = src("src/routes/pay.tsx");
  const hub = src("src/routes/pay.index.tsx");
  assert.match(layout, /createFileRoute\("\/pay"\)/);
  assert.match(layout, /<Outlet \/>/);
  assert.match(hub, /createFileRoute\("\/pay\/"\)/);
  assert.match(hub, /EmptyState/);
  assert.match(hub, /payHubTitle/);
  assert.match(hub, /\/parent\?tab=payments/);
  assert.match(src("src/routes/pay.$bookingId.tsx"), /createFileRoute\("\/pay\/\$bookingId"\)/);
  const tree = src("src/routeTree.gen.ts");
  assert.match(tree, /from '\.\/routes\/pay'/);
  assert.match(tree, /from '\.\/routes\/pay\.index'/);
  assert.match(tree, /id:\s*'\/pay'/);
  assert.match(tree, /id:\s*'\/pay\/\$bookingId'/);
});

test("home/about marketing copy uses Canadian recognise", () => {
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /so you can recognise the location/);
  assert.match(copy, /so you can recognise the location"/);
  assert.doesNotMatch(copy, /trustWhy2: ".*recognize/);
  assert.doesNotMatch(copy, /aboutDiff2: ".*recognize/);
});

test("header theme control keeps a full System label at laptop width", () => {
  const appearance = src("src/components/appearance-control.tsx");
  assert.match(appearance, /appearanceSystem/);
  assert.match(appearance, /min-w-\[5\.5rem\]/);
  assert.match(appearance, /shrink-0/);
  assert.match(src("src/lib/copy.ts"), /appearanceSystem: "System"/);
  assert.doesNotMatch(appearance, /Syste"/);
});
