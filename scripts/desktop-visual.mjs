/**
 * Desktop visual check for kidease.ca.
 * Baselines are the site before the phone, tablet, and foldable layout.
 * A website window at 1280 and wider must match those pictures.
 * Mobile, tablet, and foldable layout stays on the app channel.
 *
 * Search and daycares mask listing counts, photos, and the map before the
 * diff. Those pixels change with the catalogue. The default ratio stays
 * 0.004. Search and daycares use 0.01 after the mask. Do not raise the
 * default to hide a real layout change.
 */

import { readFileSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { withNetRetry } from "./e2e-net.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const DESKTOP_WIDTHS = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

export const DESKTOP_ROUTES = [
  { path: "/", name: "home" },
  { path: "/search", name: "search" },
  { path: "/login", name: "login" },
  { path: "/signup", name: "signup" },
  { path: "/help", name: "help" },
  { path: "/for-daycares", name: "for-daycares" },
  { path: "/plans", name: "plans" },
  { path: "/how-it-works", name: "how-it-works" },
  { path: "/faq", name: "faq" },
  { path: "/about", name: "about" },
  { path: "/contact", name: "contact" },
  { path: "/fr", name: "fr" },
  { path: "/daycares", name: "daycares" },
  { path: "/claim", name: "claim" },
  { path: "/parent", name: "parent" },
  { path: "/inbox", name: "inbox" },
  { path: "/provider", name: "provider" },
  { path: "/account", name: "account" },
  { path: "/admin", name: "admin" },
];

/** Default budget. Static pages stay here. */
export const DEFAULT_MAX_DIFF_PIXEL_RATIO = 0.004;

/**
 * After masking counts, photos, and the map. Tight enough to catch a layout
 * change, loose enough for a leftover antialiased edge.
 */
export const DYNAMIC_MAX_DIFF_PIXEL_RATIO = 0.01;

const DYNAMIC_ROUTES = new Set(["search", "daycares"]);

/** Regions that move with catalogue data. Applied on /search and /daycares only. */
export const DYNAMIC_MASK_SELECTORS = [
  "[data-ke='search-count']",
  "[data-ke='search-result-list']",
  "[data-ke='photo-fallback']",
  "[data-ke='map-fallback']",
  "[data-ke='map-selected-card']",
  ".maplibregl-map",
  ".maplibregl-canvas",
  ".leaflet-container",
];

const FONT_SAMPLE = "Find licensed daycare near you. Trouver une garderie près de chez vous — été, français.";

export const DESKTOP_BASELINE_DIR = join(root, "e2e/desktop-baselines");

export function desktopShotName(width, height, name) {
  return `${width}x${height}__${name}.png`;
}

export function maxDiffPixelRatio(routeName) {
  if (DYNAMIC_ROUTES.has(routeName)) return DYNAMIC_MAX_DIFF_PIXEL_RATIO;
  return DEFAULT_MAX_DIFF_PIXEL_RATIO;
}

/**
 * Same sample as the previous in-browser compare: every 4th pixel, and a
 * miss counts as 4 pixels. Masked bytes are painted equal before this runs.
 */
export function sampledPixelRatio(left, right) {
  if (!left || !right || left.length !== right.length || left.length % 4 !== 0 || left.length === 0) {
    return { ratio: 1, reason: "size" };
  }
  let diff = 0;
  const pixels = left.length / 4;
  for (let i = 0; i < left.length; i += 16) {
    const delta = Math.abs(left[i] - right[i]) + Math.abs(left[i + 1] - right[i + 1]) + Math.abs(left[i + 2] - right[i + 2]);
    if (delta > 36) diff += 4;
  }
  return { ratio: diff / pixels };
}

export function paintMaskRects(data, width, height, rects) {
  if (!rects?.length) return;
  for (const rect of rects) {
    const x0 = Math.max(0, rect.x | 0);
    const y0 = Math.max(0, rect.y | 0);
    const x1 = Math.min(width, x0 + Math.max(0, rect.w | 0));
    const y1 = Math.min(height, y0 + Math.max(0, rect.h | 0));
    for (let y = y0; y < y1; y += 1) {
      let offset = (y * width + x0) * 4;
      for (let x = x0; x < x1; x += 1) {
        data[offset] = 235;
        data[offset + 1] = 230;
        data[offset + 2] = 220;
        data[offset + 3] = 255;
        offset += 4;
      }
    }
  }
}

async function waitForPinnedFonts(page) {
  await page.evaluate(async (sample) => {
    if (!document.fonts) return;
    const loads = [];
    for (const weight of [400, 500, 600, 700]) {
      loads.push(document.fonts.load(`${weight} 16px "Plus Jakarta Sans"`, sample));
      loads.push(document.fonts.load(`${weight} 32px "Plus Jakarta Sans"`, sample));
    }
    await Promise.race([
      Promise.all(loads).then(() => document.fonts.ready),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
  }, FONT_SAMPLE);
}

async function dynamicMaskRects(page) {
  return page.evaluate((selectors) => {
    const rects = [];
    const width = window.innerWidth;
    const height = window.innerHeight;
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        const box = el.getBoundingClientRect();
        const x = Math.max(0, Math.floor(box.x));
        const y = Math.max(0, Math.floor(box.y));
        const right = Math.min(width, Math.ceil(box.x + box.width));
        const bottom = Math.min(height, Math.ceil(box.y + box.height));
        if (right - x < 2 || bottom - y < 2) continue;
        rects.push({ x, y, w: right - x, h: bottom - y });
      }
    }
    return rects;
  }, DYNAMIC_MASK_SELECTORS);
}

export async function openRoute(page, base, path) {
  const url = new URL(path, base).href;
  const res = await withNetRetry(() => page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 }), {
    retries: 2,
    label: `open ${path}`,
  }).catch(async () => page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 }));
  await page.evaluate(
    async (sample, pinSample) => {
      if (!document.fonts) return;
      const work = [document.fonts.ready];
      if (pinSample) {
        work.push(document.fonts.load(`400 16px "Plus Jakarta Sans"`, sample));
        work.push(document.fonts.load(`700 32px "Plus Jakarta Sans"`, sample));
      }
      await Promise.race([Promise.all(work), new Promise((resolve) => setTimeout(resolve, 3000))]);
    },
    FONT_SAMPLE,
    path === "/" || path === "/fr",
  );
  // Home and contact stills are lazy. A wide window sometimes shoots the placeholder.
  if (path === "/" || path === "/fr" || path === "/contact") {
    await page
      .waitForFunction(() => {
        const imgs = [...document.images].filter((img) => {
          const box = img.getBoundingClientRect();
          return box.width > 40 && box.bottom > 0 && box.top < window.innerHeight;
        });
        return imgs.length > 0 && imgs.every((img) => img.complete && img.naturalWidth > 0);
      }, null, { timeout: 8000 })
      .catch(() => {});
  }
  // The French home at 1920 shows the explainer. It swaps the poster image for a
  // video as soon as the block is near, and the poster frame is blank for a moment.
  if (path === "/" || path === "/fr") {
    await page
      .waitForFunction(() => {
        if (document.querySelector(".ke-home [aria-busy='true']")) return false;
        const root = document.querySelector("[data-ke='home-how-video']");
        if (!root) return true;
        const box = root.getBoundingClientRect();
        if (box.width < 40 || box.bottom <= 0 || box.top >= window.innerHeight) return true;
        const video = root.querySelector("video");
        if (!video) return false;
        if (video.readyState >= 1 && video.videoWidth > 0) return true;
        const canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 9;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return false;
        try {
          ctx.drawImage(video, 0, 0, 16, 9);
        } catch {
          return false;
        }
        const data = ctx.getImageData(0, 0, 16, 9).data;
        let min = 765;
        let max = 0;
        for (let i = 0; i < data.length; i += 4) {
          const lum = data[i] + data[i + 1] + data[i + 2];
          if (lum < min) min = lum;
          if (lum > max) max = lum;
        }
        return max - min > 48;
      }, { timeout: 8000 })
      .catch(() => {});
  }
  await page.waitForTimeout(250);
  // The explainer stays empty until it is near the viewport. Wait for that
  // still and its button, then swap. Decode cannot wait forever.
  if (path === "/" || path === "/fr") {
    await page
      .waitForFunction(() => {
        const root = document.querySelector("[data-ke='home-how-video']");
        if (!root) return true;
        const box = root.getBoundingClientRect();
        if (box.width < 40 || box.bottom <= 0 || box.top >= window.innerHeight) return true;
        const img = root.querySelector("img");
        const video = root.querySelector("video");
        const mediaReady =
          (img && img.complete && img.naturalWidth > 0) || Boolean(video && video.getAttribute("poster"));
        return mediaReady && Boolean(root.querySelector("button"));
      }, null, { timeout: 4000 })
      .catch(() => {});
  }
  await page.evaluate(async () => {
    const posters = [...document.querySelectorAll("video")]
      .map((video) => video.getAttribute("poster"))
      .filter(Boolean);
    const warm = posters.every((src) => {
      const probe = new Image();
      probe.src = src;
      return probe.complete && probe.naturalWidth > 0;
    });
    if (!warm) {
      await Promise.all(
        posters.map(async (src) => {
          const probe = new Image();
          probe.src = src;
          if (probe.complete && probe.naturalWidth > 0) return;
          await Promise.race([
            probe.decode().catch(() => {}),
            new Promise((resolve) => setTimeout(resolve, 3000)),
          ]);
        }),
      );
    }
    const style = document.createElement("style");
    style.textContent = "[data-ke=cookie-consent]{display:none!important}";
    document.documentElement.appendChild(style);
    document.querySelectorAll("[data-ke='cookie-consent']").forEach((el) => el.remove());
    document.querySelectorAll("video").forEach((video) => {
      video.pause();
      const poster = video.getAttribute("poster");
      if (!poster) return;
      const img = document.createElement("img");
      img.src = poster;
      img.alt = "";
      img.className = video.className;
      video.replaceWith(img);
    });
  });
  // Search and the daycares redirect paint listing counts, photos, and map
  // tiles after the first paint. Wait those in, then the compare masks them.
  // Other pages keep the original timing so a late photo does not replace a
  // baseline that was shot on the placeholder.
  if (path === "/search" || path === "/daycares") {
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await waitForPinnedFonts(page);
    await page
      .waitForSelector("[data-ke='search-count'], [data-ke='search-result-list'], [data-ke='map-fallback']", {
        timeout: 8000,
      })
      .catch(() => {});
  }
  return res?.status() ?? 0;
}

export async function captureDesktopShots(browser, base, outDir) {
  mkdirSync(outDir, { recursive: true });
  const notes = [];
  for (const size of DESKTOP_WIDTHS) {
    const context = await browser.newContext({
      viewport: size,
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => {
      const deny = () => {
        try {
          localStorage.setItem("kidease-analytics-consent", "denied");
        } catch {
          /* private mode */
        }
      };
      deny();
      document.addEventListener("DOMContentLoaded", deny);
      const warmPoster = new Image();
      warmPoster.src = "/video/how-kidease.webp";
      HTMLMediaElement.prototype.play = function play() {
        this.pause();
        return Promise.resolve();
      };
      const style = document.createElement("style");
      style.setAttribute("data-ke-visual", "stable");
      style.textContent =
        "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}[data-ke=cookie-consent]{display:none!important}";
      const rootNode = document.documentElement;
      if (rootNode) rootNode.appendChild(style);
    });
    for (const route of DESKTOP_ROUTES) {
      const file = join(outDir, desktopShotName(size.width, size.height, route.name));
      const page = await context.newPage();
      try {
        const status = await openRoute(page, base, route.path);
        if (status >= 500) notes.push(`${route.name} ${size.width} status ${status}`);
        else {
          if (DYNAMIC_ROUTES.has(route.name)) {
            const rects = await dynamicMaskRects(page);
            writeFileSync(`${file}.masks.json`, JSON.stringify(rects));
          }
          await page.screenshot({ path: file, fullPage: false, animations: "disabled" });
        }
      } catch (err) {
        notes.push(`${route.name} ${size.width} ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      }
      await page.close().catch(() => {});
    }
    await context.close();
  }
  return notes;
}

function readMaskRects(actualFile) {
  const sidecar = `${actualFile}.masks.json`;
  if (!existsSync(sidecar)) return [];
  try {
    const parsed = JSON.parse(readFileSync(sidecar, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function loadRgba(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

async function writeDiffPng(file, data, width, height) {
  mkdirSync(dirname(file), { recursive: true });
  await sharp(Buffer.from(data), { raw: { width, height, channels: 4 } }).png().toFile(file);
}

export async function compareDesktopShots(actualDir, baselineDir) {
  const problems = [];
  const report = [];
  const diffDir = join(dirname(actualDir), "desktop-diff");
  for (const size of DESKTOP_WIDTHS) {
    for (const route of DESKTOP_ROUTES) {
      const name = desktopShotName(size.width, size.height, route.name);
      const baseFile = join(baselineDir, name);
      const actualFile = join(actualDir, name);
      if (!existsSync(baseFile) || !existsSync(actualFile)) {
        problems.push(`${name} missing`);
        report.push({ name, route: route.name, missing: true });
        continue;
      }
      const [baseImage, actualImage] = await Promise.all([loadRgba(baseFile), loadRgba(actualFile)]);
      if (baseImage.width !== actualImage.width || baseImage.height !== actualImage.height) {
        const reason = `size ${actualImage.width}x${actualImage.height}!=${baseImage.width}x${baseImage.height}`;
        problems.push(`${name} 100.00% ${reason}`);
        report.push({ name, route: route.name, ratio: 1, mismatch: true, reason });
        continue;
      }
      const rects = DYNAMIC_ROUTES.has(route.name) ? readMaskRects(actualFile) : [];
      const left = new Uint8Array(baseImage.data);
      const right = new Uint8Array(actualImage.data);
      paintMaskRects(left, baseImage.width, baseImage.height, rects);
      paintMaskRects(right, actualImage.width, actualImage.height, rects);
      const found = sampledPixelRatio(left, right);
      const maxRatio = maxDiffPixelRatio(route.name);
      const mismatch = found.ratio > maxRatio;
      report.push({
        name,
        route: route.name,
        ratio: found.ratio,
        maxRatio,
        masked: rects.length,
        mismatch,
      });
      if (mismatch) {
        const diff = new Uint8Array(right);
        for (let i = 0; i < left.length; i += 16) {
          const delta = Math.abs(left[i] - right[i]) + Math.abs(left[i + 1] - right[i + 1]) + Math.abs(left[i + 2] - right[i + 2]);
          if (delta > 36) {
            diff[i] = 220;
            diff[i + 1] = 40;
            diff[i + 2] = 40;
          }
        }
        await writeDiffPng(join(diffDir, name), diff, actualImage.width, actualImage.height);
        problems.push(`${name} ${(found.ratio * 100).toFixed(2)}% limit ${(maxRatio * 100).toFixed(2)}%`);
      }
    }
  }
  const reportPath = join(dirname(actualDir), "desktop-report.json");
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify({ shots: report }, null, 2));
  return problems;
}

export async function runDesktopVisualPass(browser, base, baselineDir = DESKTOP_BASELINE_DIR) {
  const actualDir = join(root, "artifacts/e2e/desktop-actual");
  const notes = await captureDesktopShots(browser, base, actualDir);
  const problems = [...notes];
  if (!existsSync(baselineDir)) {
    problems.push("baselines missing");
    return problems;
  }
  const diffs = await compareDesktopShots(actualDir, baselineDir);
  return problems.concat(diffs);
}
