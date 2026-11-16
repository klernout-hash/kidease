import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { STORE_PAYMENTS_ENABLED } from "../src/lib/native-entitlements.ts";
import {
  microsoftBadgeAction,
  microsoftManifestActive,
  microsoftPlatformContext,
  microsoftStoreDeepLink,
  microsoftStoreUrl,
  microsoftWidgetData,
  withMicrosoftExtras,
} from "../src/lib/microsoft/platform.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");
const base = JSON.parse(src("public/manifest.microsoft.webmanifest"));

test("Microsoft flags stay off and the static manifest is unchanged", () => {
  for (const key of [
    "FEATURE_MS_SHARE_TARGET",
    "FEATURE_MS_PROTOCOL_HANDLERS",
    "FEATURE_MS_WIDGETS",
    "FEATURE_MS_SHORTCUTS",
    "FEATURE_MS_BADGING",
    "FEATURE_MS_STORE_LINK",
  ]) {
    assert.equal(FLAG_DEFAULTS[key], false, key);
  }
  assert.deepEqual(microsoftPlatformContext({}), {});
  assert.equal(microsoftManifestActive({}), false);
  assert.deepEqual(withMicrosoftExtras(base, {}), base);
  assert.equal(microsoftWidgetData({}), null);
  assert.equal(microsoftStoreUrl({}), null);
  assert.equal(microsoftBadgeAction(false, 2), "skip");
  assert.equal(STORE_PAYMENTS_ENABLED.microsoft, false);
  assert.doesNotMatch(src("public/manifest.microsoft.webmanifest"), /share_target|protocol_handlers|widgets|shortcuts/);
});

test("each Microsoft extra appears only for its own flag", () => {
  const share = withMicrosoftExtras(base, { FEATURE_MS_SHARE_TARGET: "1" });
  assert.equal(share.share_target.action, "/search");
  assert.equal(share.share_target.method, "GET");
  assert.equal(share.protocol_handlers, undefined);
  const protocol = withMicrosoftExtras(base, { FEATURE_MS_PROTOCOL_HANDLERS: "1" });
  assert.equal(protocol.protocol_handlers[0].protocol, "web+kidease");
  assert.equal(protocol.protocol_handlers[0].url, "/search?q=%s");
  const shortcuts = withMicrosoftExtras(base, { FEATURE_MS_SHORTCUTS: "1" });
  assert.equal(shortcuts.shortcuts[0].url, "/search");
  assert.match(shortcuts.shortcuts[0].description, /Canada/);
  const widgets = withMicrosoftExtras(base, { FEATURE_MS_WIDGETS: "1" });
  assert.equal(widgets.widgets[0].data, "/api/microsoft-widget");
  const feed = microsoftWidgetData({ FEATURE_MS_WIDGETS: "1" });
  assert.equal(feed.target, "https://www.kidease.ca/search?q={q}");
  assert.equal(microsoftBadgeAction(true, null), "skip");
  assert.equal(microsoftBadgeAction(true, 0), "clear");
  assert.equal(microsoftBadgeAction(true, 3), "set");
  assert.equal(microsoftStoreUrl({ FEATURE_MS_STORE_LINK: "1" }), null);
  assert.equal(
    microsoftStoreUrl({ FEATURE_MS_STORE_LINK: "1", MICROSOFT_STORE_PRODUCT_ID: "9NBLGGH4NNS1" }),
    "https://apps.microsoft.com/detail/9NBLGGH4NNS1",
  );
  assert.equal(
    microsoftStoreDeepLink("https://apps.microsoft.com/detail/9NBLGGH4NNS1"),
    "ms-windows-store://pdp/?productid=9NBLGGH4NNS1",
  );
  assert.equal(microsoftStoreUrl({ FEATURE_MS_STORE_LINK: "0", MICROSOFT_STORE_PRODUCT_ID: "9NBLGGH4NNS1" }), null);
  assert.deepEqual(microsoftPlatformContext({ FEATURE_MS_BADGING: "1" }), { msBadging: true });
});

test("the static manifest link stays in the root head", () => {
  const head = src("src/routes/__root.tsx");
  assert.match(head, /manifest\.microsoft\.webmanifest/);
  assert.match(head, /\/api\/microsoft-manifest/);
  assert.match(src("server/middleware/microsoft-manifest.ts"), /microsoftManifestActive/);
  assert.match(src("src/components/native-boot.tsx"), /msBadging !== true/);
});
