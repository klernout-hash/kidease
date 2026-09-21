import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { withPaintBudget } from "../src/lib/timeout.ts";
import { primaryListingPhoto } from "../src/lib/listing-photo.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("paint budget", () => {
  it("returns a fast value and does not hold a slow one", async () => {
    const fast = await withPaintBudget(Promise.resolve(["ok"]), 50);
    assert.equal(fast.ready, true);
    assert.deepEqual(fast.value, ["ok"]);

    const slow = await withPaintBudget(new Promise(() => {}), 30);
    assert.equal(slow.ready, false);
    assert.equal(slow.value, null);

    const failed = await withPaintBudget(Promise.reject(new Error("db")), 50);
    assert.equal(failed.ready, true);
    assert.equal(failed.value, null);
  });
});

describe("shell does not wait on catalogue", () => {
  it("home and search cap origin and featured work", () => {
    const home = src("src/routes/index.tsx");
    const search = src("src/routes/search.tsx");
    const fr = src("src/routes/fr.search.tsx");
    assert.match(home, /withPaintBudget\(/);
    assert.match(home, /PAINT_BUDGET_MS/);
    assert.match(home, /ORIGIN_BUDGET_MS/);
    assert.match(home, /featuredReady: painted\.ready/);
    assert.match(home, /staleTime: 60_000/);
    assert.match(search, /withPaintBudget\(/);
    assert.match(search, /productHomeOrigin\(\)/);
    assert.match(search, /staleTime: 60_000/);
    assert.match(fr, /Promise\.all\(\[/);
    assert.match(fr, /catalogueReady/);
    assert.doesNotMatch(home, /const featured = await withTimeoutFallback\(\s*featuredDaycares/);
  });

  it("critical CSS and the media preconnect sit ahead of boot scripts", () => {
    const rootHtml = src("src/routes/__root.tsx");
    const cssAt = rootHtml.indexOf("html,body{margin:0;background:#f6f3ee");
    const preloadAt = rootHtml.indexOf('rel="preload" href={appCss}');
    const mediaAt = rootHtml.indexOf('rel="preconnect" href="https://media.kidease.ca"');
    const bootAt = rootHtml.indexOf('src="/channel-boot.js"');
    assert.ok(cssAt > 0 && cssAt < bootAt);
    assert.ok(preloadAt > 0 && preloadAt < bootAt);
    assert.ok(mediaAt > 0 && mediaAt < bootAt);
    assert.match(rootHtml, /dns-prefetch/);
    assert.doesNotMatch(rootHtml, /rel: "preconnect", href: "https:\/\/maps\.googleapis\.com"/);
  });
});

describe("images are in the first HTML", () => {
  it("listing cards do not wait on an intersection observer or a 1px gif", () => {
    const photo = src("src/components/building-photo.tsx");
    assert.doesNotMatch(photo, /IntersectionObserver/);
    assert.doesNotMatch(photo, /R0lGODlhAQAB/);
    assert.match(photo, /loading=\{priority \|\| eager \? "eager" : "lazy"\}/);
    assert.match(photo, /ke-photo/);
    assert.match(photo, /skipTransform/);
    assert.match(photo, /publicPhotoUrl/);
  });

  it("a listing hero can paint from the seo payload", () => {
    const listing = src("src/routes/daycare.$slug.tsx");
    assert.match(listing, /primaryListingPhoto/);
    assert.match(listing, /imageSrcSet: photoSrcSet\(hero, HERO_WIDTHS\)/);
    assert.equal(
      primaryListingPhoto(["/photos/buildings/mb-1001.jpg"]),
      "/photos/buildings/mb-1001.jpg",
    );
    assert.equal(primaryListingPhoto([]), "");
  });

  it("sized photo responses tell Cloudflare to cache them", () => {
    const photo = src("src/lib/server/optimize-photo.ts");
    assert.match(photo, /cloudflare-cdn-cache-control/);
    assert.match(src("docs/cloudflare.md"), /Cache KidEase sized photos/);
    assert.match(src("docs/image-resizing.md"), /cf-cache-status/);
  });

  it("the native splash stays until the shell paints", () => {
    const cap = src("capacitor.config.ts");
    assert.match(cap, /launchAutoHide: false/);
    assert.match(cap, /backgroundColor: "#F6F3EE"/);
    assert.match(src("src/components/native-boot.tsx"), /requestAnimationFrame/);
    assert.match(src("ios/App/App/capacitor.config.json"), /"launchAutoHide": false/);
    assert.match(
      src("android/app/src/main/assets/capacitor.config.json"),
      /"launchAutoHide": false/,
    );
  });
});
