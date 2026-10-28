/**
 * Desktop visual check for kidease.ca.
 * Baselines are the site before the phone, tablet, and foldable layout.
 * A website window at 1280 and wider must match those pictures.
 * Mobile, tablet, and foldable layout stays on the app channel.
 */

import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

export const DESKTOP_BASELINE_DIR = join(root, "e2e/desktop-baselines");

export function desktopShotName(width, height, name) {
  return `${width}x${height}__${name}.png`;
}

export async function openRoute(page, base, path) {
  const url = new URL(path, base).href;
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 }).catch(async () => {
    return page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
  });
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 3000))]);
    }
  });
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
      style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}[data-ke=cookie-consent]{display:none!important}";
      const root = document.documentElement;
      if (root) root.appendChild(style);
    });
    for (const route of DESKTOP_ROUTES) {
      const file = join(outDir, desktopShotName(size.width, size.height, route.name));
      const page = await context.newPage();
      try {
        const status = await openRoute(page, base, route.path);
        if (status >= 500) notes.push(`${route.name} ${size.width} status ${status}`);
        else await page.screenshot({ path: file, fullPage: false, animations: "disabled" });
      } catch (err) {
        notes.push(`${route.name} ${size.width} ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      }
      await page.close().catch(() => {});
    }
    await context.close();
  }
  return notes;
}

export async function compareDesktopShots(browser, actualDir, baselineDir) {
  const problems = [];
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  for (const size of DESKTOP_WIDTHS) {
    for (const route of DESKTOP_ROUTES) {
      const name = desktopShotName(size.width, size.height, route.name);
      const baseFile = join(baselineDir, name);
      const actualFile = join(actualDir, name);
      if (!existsSync(baseFile) || !existsSync(actualFile)) {
        problems.push(`${name} missing`);
        continue;
      }
      const found = await page.evaluate(
        async ({ a, b }) => {
          const load = (src) =>
            new Promise((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = () => reject(new Error("png"));
              img.src = src;
            });
          const [ia, ib] = await Promise.all([load(a), load(b)]);
          if (ia.width !== ib.width || ia.height !== ib.height) {
            return { ratio: 1, mismatch: true, reason: `size ${ia.width}x${ia.height}!=${ib.width}x${ib.height}` };
          }
          const canvas = document.createElement("canvas");
          canvas.width = ia.width;
          canvas.height = ia.height;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(ia, 0, 0);
          const da = ctx.getImageData(0, 0, ia.width, ia.height).data;
          ctx.clearRect(0, 0, ia.width, ia.height);
          ctx.drawImage(ib, 0, 0);
          const db = ctx.getImageData(0, 0, ia.width, ia.height).data;
          let diff = 0;
          const pixels = ia.width * ia.height;
          for (let i = 0; i < da.length; i += 16) {
            const delta = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
            if (delta > 36) diff += 4;
          }
          const ratio = diff / pixels;
          return { ratio, mismatch: ratio > 0.004 };
        },
        {
          a: `data:image/png;base64,${readFileSync(baseFile).toString("base64")}`,
          b: `data:image/png;base64,${readFileSync(actualFile).toString("base64")}`,
        },
      );
      if (found.mismatch) problems.push(`${name} ${(found.ratio * 100).toFixed(2)}% ${found.reason || ""}`.trim());
    }
  }
  await page.close();
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
  const diffs = await compareDesktopShots(browser, actualDir, baselineDir);
  return problems.concat(diffs);
}
