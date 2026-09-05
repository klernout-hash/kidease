import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("390px guest chrome wraps instead of forcing a horizontal page scroll", () => {
  const css = src("src/styles.css");
  assert.match(css, /html\[data-channel="website"\] \.ke-listings \{[\s\S]*grid-template-columns: 1fr;/);
  assert.match(css, /overflow-x:\s*hidden/);
  const trust = src("src/components/trust-bar.tsx");
  assert.match(trust, /grid-cols-2/);
  assert.doesNotMatch(trust, /min-w-\[78%\]/);
  const map = src("src/components/map-view.tsx");
  assert.match(map, /size-11 place-items-center rounded-full bg-surface/);
  assert.match(map, /size-11 place-items-center text-fg/);
  const search = src("src/routes/search.tsx");
  assert.match(search, /sm:min-w-\[13\.5rem\]/);
  assert.match(search, /h-11 shrink-0 rounded-full px-3/);
});

test("PWA manifest is installable and points at pin icons", () => {
  const manifest = JSON.parse(src("public/manifest.webmanifest"));
  assert.equal(manifest.name, "KidEase");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.theme_color, "#1A3790");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "any"));
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
  const rootHead = src("src/routes/__root.tsx");
  assert.match(rootHead, /rel: "manifest"/);
  assert.match(rootHead, /apple-touch-icon/);
});

test("service worker caches chrome only and registers from NativeBoot", () => {
  assert.equal(existsSync(join(root, "public/sw.js")), true);
  assert.equal(existsSync(join(root, "public/offline.html")), true);
  const sw = src("public/sw.js");
  assert.match(sw, /\/offline\.html/);
  assert.match(sw, /kidease-shell/);
  assert.match(sw, /request\.mode === "navigate"/);
  assert.match(sw, /startsWith\("\/api\/"\)/);
  assert.doesNotMatch(sw, /us\.i\.posthog\.com|js\.stripe\.com|maps\.googleapis\.com/);
  const offline = src("public/offline.html");
  assert.match(offline, /support@kidease\.ca/);
  assert.match(offline, /href="\/"/);
  assert.doesNotMatch(offline, /kyle@kidease\.ca/);
  const native = src("src/lib/native.ts");
  assert.match(native, /registerOfflineShell/);
  assert.match(native, /serviceWorker\.register\("\/sw\.js"/);
  assert.match(src("src/components/native-boot.tsx"), /registerOfflineShell/);
  const vercel = src("vercel.json");
  assert.match(vercel, /"source": "\/sw\.js"/);
  assert.match(vercel, /max-age=0, must-revalidate/);
  const getApp = src("src/routes/get-app.tsx");
  assert.match(getApp, /HomeScreenGuide/);
  assert.match(getApp, /#add-to-home/);
  assert.doesNotMatch(getApp, /\/\?install=1/);
});
