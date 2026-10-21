/**
 * Viewport pass for Play, Samsung, Huawei, and the Windows PWA.
 * Portrait and landscape. Fold, unfold, and a desktop window resize
 * stay on the same page: no reload and no dropped call.
 * Apple has not published iPhone Duo point sizes; those stay in fold-resize.mjs.
 */

const ROUTES = ["/", "/search", "/login", "/fr", "/fr/login", "/help", "/for-daycares", "/inbox", "/parent", "/call/demo", "/video/demo"];

const CAPPED = new Set(["/", "/search", "/login", "/fr", "/fr/login", "/help", "/for-daycares"]);

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 KidEaseNative";

export const STORE_UAS = {
  google: ANDROID_UA,
  samsung: `${ANDROID_UA} KidEaseStoreSamsung`,
  huawei: `${ANDROID_UA} KidEaseStoreHuawei`,
  microsoft:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 KidEaseStoreMicrosoft",
};

function both(name, width, height, store) {
  return [
    { name: `${name}-${width}x${height}`, width, height, store },
    { name: `${name}-${height}x${width}`, width: height, height: width, store },
  ];
}

export const ANDROID_PHONES = [
  ...both("phone", 360, 640, "google"),
  ...both("phone", 360, 800, "google"),
  ...both("phone", 384, 854, "google"),
  ...both("phone", 393, 873, "google"),
  ...both("phone", 412, 915, "google"),
  ...both("phone", 480, 1040, "google"),
];

export const FOLDABLES = [
  ...both("zflip", 360, 880, "samsung"),
  ...both("zfold-closed", 344, 882, "samsung"),
  ...both("zfold-closed", 360, 804, "samsung"),
  ...both("zfold-open", 673, 841, "samsung"),
  ...both("zfold-open", 884, 1104, "samsung"),
  ...both("matex", 768, 720, "huawei"),
  ...both("matex", 800, 740, "huawei"),
];

export const ANDROID_TABLETS = [
  ...both("tablet", 600, 960, "google"),
  ...both("tablet", 800, 1280, "google"),
  ...both("tabs", 1138, 712, "samsung"),
  ...both("tabs", 900, 1440, "samsung"),
  ...both("matepad", 1280, 800, "huawei"),
];

export const WINDOWS_SIZES = [
  ...both("win", 500, 600, "microsoft"),
  { name: "win-snap-960x1080", width: 960, height: 1080, store: "microsoft" },
  { name: "win-snap-1080x960", width: 1080, height: 960, store: "microsoft" },
  ...both("surface", 1368, 912, "microsoft"),
  ...both("surface", 1440, 960, "microsoft"),
  ...both("win", 1920, 1080, "microsoft"),
  ...both("win", 2560, 1440, "microsoft"),
];

export function pageCap(width) {
  if (width >= 1200) return 1040;
  if (width >= 1024) return 880;
  if (width >= 768) return 720;
  return width;
}

export function expectedShape(width, height) {
  const ratio = height > 0 ? width / height : 1;
  if (ratio >= 0.85 && ratio <= 1.18) return "square";
  if (ratio > 1.18) return "wide";
  return "tall";
}

function expectedChannel(store, width) {
  if (store === "microsoft") return width < 1024 ? "app" : "website";
  return "app";
}

function expectedRuntime(store) {
  if (store === "samsung" || store === "microsoft") return "web";
  return "native";
}

function safeFor(vp) {
  if (vp.store === "microsoft" || vp.width > vp.height) return { top: 0, right: 0, bottom: 0, left: 0 };
  return { top: 24, right: 0, bottom: 24, left: 0 };
}

async function openRoute(page, base, path) {
  const url = new URL(path, base).href;
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 }).catch(async () => {
    return page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
  });
  return res?.status() ?? 0;
}

async function sweepSizes(page, base, viewports, problems) {
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    for (const path of ROUTES) {
      const label = `${vp.name} ${path}`;
      try {
        const status = await openRoute(page, base, path);
        if (status >= 500) {
          problems.push(`${label} status ${status}`);
          continue;
        }
        const found = await page.evaluate(
          ({ safe, shape, channel, runtime, store }) => {
            window.dispatchEvent(new Event("resize"));
            const root = document.documentElement;
            root.style.setProperty("--ke-safe-top", `${safe.top}px`);
            root.style.setProperty("--ke-safe-right", `${safe.right}px`);
            root.style.setProperty("--ke-safe-bottom", `${safe.bottom}px`);
            root.style.setProperty("--ke-safe-left", `${safe.left}px`);
            root.style.setProperty("--ke-text-scale", "1");
            const notes = [];
            if (root.scrollWidth > root.clientWidth + 2) notes.push(`overflow ${root.scrollWidth}>${root.clientWidth}`);
            if (root.dataset.channel !== channel) notes.push(`channel ${root.dataset.channel || "missing"}!=${channel}`);
            if (root.dataset.store !== store) notes.push(`store ${root.dataset.store || "missing"}!=${store}`);
            if (root.dataset.runtime !== runtime) notes.push(`runtime ${root.dataset.runtime || "missing"}!=${runtime}`);
            if (root.dataset.keShape !== shape) notes.push(`shape ${root.dataset.keShape || "missing"}!=${shape}`);
            const header = document.querySelector("header");
            if (header) {
              const pad = parseFloat(getComputedStyle(header).paddingTop) || 0;
              if (pad + 1 < safe.top) notes.push(`header-top ${Math.round(pad)}<${safe.top}`);
            }
            const shell = document.querySelector(".min-h-dvh");
            if (shell) {
              const left = parseFloat(getComputedStyle(shell).paddingLeft) || 0;
              if (left + 1 < safe.left) notes.push(`shell-left ${Math.round(left)}<${safe.left}`);
            }
            const bar = document.querySelector("[data-ke='app-tab-bar']");
            const barShown = bar && getComputedStyle(bar).display !== "none";
            if (channel === "website" && barShown) notes.push("tab-on-desktop");
            if (barShown) {
              const inner = bar.firstElementChild;
              const pad = inner ? parseFloat(getComputedStyle(inner).paddingBottom) || 0 : 0;
              if (pad + 1 < safe.bottom) notes.push(`tab-bottom ${Math.round(pad)}<${safe.bottom}`);
            }
            const h1 = document.querySelector("h1");
            if (h1 && (h1.textContent || "").trim() && h1.scrollWidth > h1.clientWidth + 4) notes.push("h1-clip");
            const pageEl = document.querySelector("[data-ke='page']");
            const pageWidth = pageEl ? Math.round(pageEl.getBoundingClientRect().width) : null;
            let desktop = null;
            if (channel === "website") {
              const video = document.querySelector(".ke-how-video");
              desktop = {
                pageWidth,
                video: video ? getComputedStyle(video).display : "missing",
              };
            }
            return { notes, pageWidth, desktop };
          },
          {
            safe: safeFor(vp),
            shape: expectedShape(vp.width, vp.height),
            channel: expectedChannel(vp.store, vp.width),
            runtime: expectedRuntime(vp.store),
            store: vp.store,
          },
        );
        for (const note of found.notes) problems.push(`${label} ${note}`);
        if (vp.width >= 768 && CAPPED.has(path) && found.pageWidth != null) {
          const cap = pageCap(vp.width);
          if (found.pageWidth > cap + 1) problems.push(`${label} page ${found.pageWidth}>${cap}`);
          if (expectedChannel(vp.store, vp.width) === "website" && found.pageWidth > vp.width - 16) {
            problems.push(`${label} edge ${found.pageWidth}`);
          }
        }
        if (path === "/" && expectedChannel(vp.store, vp.width) === "website" && vp.width >= 1024 && found.desktop) {
          if (found.desktop.video === "none" || found.desktop.video === "missing") {
            problems.push(`${label} desktop-video ${found.desktop.video}`);
          }
        }
      } catch (err) {
        problems.push(`${label} ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      }
    }
  }
}

async function armField(page, base, path, selector, value) {
  const status = await openRoute(page, base, path);
  if (status >= 500) return { ok: false, reason: `status ${status}` };
  const armed = await page.evaluate(() => {
    window.__keFoldMark = "stay";
    return performance.timeOrigin;
  });
  const field = page.locator(selector).locator("visible=true").first();
  if (await field.isVisible().catch(() => false)) {
    await field.fill(value);
    await field.evaluate((el) => {
      el.dataset.keTyped = "1";
    });
  }
  return { ok: true, origin: armed };
}

async function readLive(page, expect) {
  return page.evaluate((expect) => {
    window.dispatchEvent(new Event("resize"));
    const root = document.documentElement;
    const notes = [];
    if (window.__keFoldMark !== "stay") notes.push("reloaded");
    if (root.dataset.channel !== expect.channel) notes.push(`channel ${root.dataset.channel}`);
    if (root.dataset.keShape !== expect.shape) notes.push(`shape ${root.dataset.keShape}`);
    if (root.scrollWidth > root.clientWidth + 2) notes.push(`overflow ${root.scrollWidth}>${root.clientWidth}`);
    const input = document.querySelector("[data-ke-typed='1']");
    if (expect.value) {
      if (!input || !input.isConnected) notes.push("state-detached");
      else if (input.value !== expect.value) notes.push(`state ${input.value}`);
    }
    const pageEl = document.querySelector("[data-ke='page']");
    const pageWidth = pageEl ? Math.round(pageEl.getBoundingClientRect().width) : null;
    if (expect.cap && pageWidth != null && pageWidth > expect.cap + 1) notes.push(`page ${pageWidth}>${expect.cap}`);
    return { notes, origin: performance.timeOrigin };
  }, expect);
}

async function liveFold(page, base, problems) {
  try {
    const armed = await armField(page, base, "/", "[data-ke='where-field'] input", "Winnipeg");
    if (!armed.ok) {
      problems.push(`fold-live / ${armed.reason}`);
      return;
    }
    const steps = [
      { name: "zfold-closed", width: 344, height: 882, store: "samsung" },
      { name: "zfold-open", width: 673, height: 841, store: "samsung" },
      { name: "zfold-class", width: 884, height: 1104, store: "samsung" },
      { name: "zflip-inner", width: 360, height: 880, store: "samsung" },
      { name: "zfold-closed-again", width: 344, height: 882, store: "samsung" },
    ];
    for (const step of steps) {
      await page.setViewportSize({ width: step.width, height: step.height });
      const found = await readLive(page, {
        channel: "app",
        shape: expectedShape(step.width, step.height),
        field: "[data-ke='where-field'] input",
        value: "Winnipeg",
        cap: step.width >= 768 ? pageCap(step.width) : 0,
      });
      for (const note of found.notes) problems.push(`fold-live ${step.name} ${note}`);
      if (found.origin !== armed.origin) problems.push(`fold-live ${step.name} new-document`);
    }
    await page.evaluate(() => {
      const room = document.createElement("div");
      room.className = "ke-video-room";
      room.dataset.ke = "video-room";
      room.dataset.keLive = "video";
      const stage = document.createElement("div");
      stage.className = "ke-video-stage";
      const video = document.createElement("video");
      video.dataset.keProbe = "live";
      video.muted = true;
      stage.appendChild(video);
      room.appendChild(stage);
      room.style.position = "fixed";
      room.style.inset = "4rem 0 auto 0";
      room.style.zIndex = "5";
      document.body.appendChild(room);
    });
    for (const step of [
      { name: "call-closed", width: 360, height: 804, grid: false },
      { name: "call-open", width: 884, height: 1104, grid: true },
      { name: "call-square", width: 768, height: 720, grid: true },
      { name: "call-closed-again", width: 344, height: 882, grid: false },
    ]) {
      await page.setViewportSize({ width: step.width, height: step.height });
      const found = await page.evaluate(({ grid }) => {
        window.dispatchEvent(new Event("resize"));
        const notes = [];
        if (window.__keFoldMark !== "stay") notes.push("reloaded");
        const video = document.querySelector("[data-ke-probe='live']");
        if (!video || !video.isConnected) notes.push("video-detached");
        else if (getComputedStyle(video).objectFit !== "contain") notes.push(`fit ${getComputedStyle(video).objectFit}`);
        const room = document.querySelector("[data-ke-live='video']");
        const display = room ? getComputedStyle(room).display : "";
        if (grid && display !== "grid") notes.push(`stage ${display}`);
        if (!grid && display === "grid") notes.push("stage grid");
        return notes;
      }, { grid: step.grid });
      for (const note of found) problems.push(`fold-call ${step.name} ${note}`);
      const origin = await page.evaluate(() => performance.timeOrigin);
      if (origin !== armed.origin) problems.push(`fold-call ${step.name} new-document`);
    }
  } catch (err) {
    problems.push(`fold-live ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  }
}

async function liveWindow(page, base, problems) {
  try {
    const armed = await armField(page, base, "/", "[data-ke='where-field'] input", "Winnipeg");
    if (!armed.ok) {
      problems.push(`win-live / ${armed.reason}`);
      return;
    }
    const steps = [
      { name: "min", width: 500, height: 600 },
      { name: "snap", width: 960, height: 1080 },
      { name: "surface", width: 1368, height: 912 },
      { name: "fhd", width: 1920, height: 1080 },
      { name: "qhd", width: 2560, height: 1440 },
      { name: "surface-portrait", width: 912, height: 1368 },
      { name: "min-again", width: 500, height: 600 },
    ];
    for (const step of steps) {
      await page.setViewportSize({ width: step.width, height: step.height });
      const channel = expectedChannel("microsoft", step.width);
      const found = await readLive(page, {
        channel,
        shape: expectedShape(step.width, step.height),
        field: "[data-ke='where-field'] input",
        value: "Winnipeg",
        cap: step.width >= 768 ? pageCap(step.width) : 0,
      });
      for (const note of found.notes) problems.push(`win-live ${step.name} ${note}`);
      if (found.origin !== armed.origin) problems.push(`win-live ${step.name} new-document`);
    }
  } catch (err) {
    problems.push(`win-live ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  }
}

async function windowsInputs(browser, base, problems) {
  const mouse = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    userAgent: STORE_UAS.microsoft,
    hasTouch: false,
    deviceScaleFactor: 1,
  });
  const page = await mouse.newPage();
  try {
    const status = await openRoute(page, base, "/");
    if (status >= 500) problems.push(`win-mouse status ${status}`);
    else {
      const hover = await page.evaluate(async () => {
        window.dispatchEvent(new Event("resize"));
        const root = document.documentElement;
        const notes = [];
        if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) notes.push("pointer");
        if (root.dataset.channel !== "website") notes.push(`channel ${root.dataset.channel}`);
        const menu = document.querySelector("button[aria-controls='ke-nav-drawer']");
        if (menu && "focus" in menu) menu.focus({ focusVisible: true });
        const active = document.activeElement;
        const shadow = active ? getComputedStyle(active).boxShadow : "";
        const outline = active ? getComputedStyle(active).outlineStyle : "";
        if (active?.getAttribute("aria-controls") !== "ke-nav-drawer") notes.push("focus-target");
        if ((!shadow || shadow === "none") && (!outline || outline === "none")) notes.push("focus-ring");
        return notes;
      });
      const link = page.locator("[data-ke='list-your-daycare']");
      if (await link.isVisible().catch(() => false)) {
        const before = await link.evaluate((el) => getComputedStyle(el).backgroundColor);
        await link.hover();
        const after = await link.evaluate((el) => getComputedStyle(el).backgroundColor);
        if (before === after) problems.push("win-mouse hover-unchanged");
      } else problems.push("win-mouse missing-link");
      for (const note of hover) problems.push(`win-mouse ${note}`);
    }
  } catch (err) {
    problems.push(`win-mouse ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  }
  await mouse.close();

  const touch = await browser.newContext({
    viewport: { width: 1368, height: 912 },
    userAgent: STORE_UAS.microsoft,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const touchPage = await touch.newPage();
  try {
    const client = await touchPage.context().newCDPSession(touchPage);
    await client.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "hover", value: "none" },
        { name: "pointer", value: "coarse" },
      ],
    });
    const status = await openRoute(touchPage, base, "/");
    if (status >= 500) problems.push(`win-touch status ${status}`);
    else {
      const found = await touchPage.evaluate(() => {
        window.dispatchEvent(new Event("resize"));
        const notes = [];
        const root = document.documentElement;
        if (root.scrollWidth > root.clientWidth + 2) notes.push(`overflow ${root.scrollWidth}>${root.clientWidth}`);
        if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) notes.push("still-fine");
        const button = document.querySelector("[data-ke='list-your-daycare']");
        const touchAction = button ? getComputedStyle(button).touchAction : "";
        if (touchAction !== "manipulation") notes.push(`touch-action ${touchAction || "missing"}`);
        const box = button ? button.getBoundingClientRect() : null;
        if (box && (box.height < 38 || box.width < 38)) notes.push(`target ${Math.round(box.width)}x${Math.round(box.height)}`);
        if (root.dataset.channel !== "website") notes.push(`channel ${root.dataset.channel}`);
        return notes;
      });
      const menu = touchPage.locator("button[aria-controls='ke-nav-drawer']");
      if (await menu.isVisible().catch(() => false)) {
        await touchPage.evaluate(() => {
          window.__keTap = 0;
          document.querySelector("button[aria-controls='ke-nav-drawer']")?.addEventListener("pointerup", () => {
            window.__keTap = 1;
          }, { once: true });
        });
        await menu.tap();
        const tapped = await touchPage.evaluate(() => window.__keTap);
        if (tapped !== 1) problems.push("win-touch missed");
      } else problems.push("win-touch missing-menu");
      for (const note of found) problems.push(`win-touch ${note}`);
    }
  } catch (err) {
    problems.push(`win-touch ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
  }
  await touch.close();
}

export async function runStoreViewportPass(browser, base) {
  const problems = [];
  const groups = [
    { store: "google", viewports: [...ANDROID_PHONES, ...ANDROID_TABLETS.filter((vp) => vp.store === "google")] },
    { store: "samsung", viewports: [...FOLDABLES.filter((vp) => vp.store === "samsung"), ...ANDROID_TABLETS.filter((vp) => vp.store === "samsung")] },
    { store: "huawei", viewports: [...FOLDABLES.filter((vp) => vp.store === "huawei"), ...ANDROID_TABLETS.filter((vp) => vp.store === "huawei")] },
    { store: "microsoft", viewports: WINDOWS_SIZES },
  ];
  for (const group of groups) {
    const context = await browser.newContext({
      viewport: { width: 360, height: 800 },
      userAgent: STORE_UAS[group.store],
      deviceScaleFactor: 1,
      hasTouch: group.store !== "microsoft",
    });
    const page = await context.newPage();
    await sweepSizes(page, base, group.viewports, problems);
    if (group.store === "samsung") await liveFold(page, base, problems);
    if (group.store === "huawei") {
      try {
        const armed = await armField(page, base, "/", "[data-ke='where-field'] input", "Winnipeg");
        if (!armed.ok) problems.push(`matex-live / ${armed.reason}`);
        else {
          for (const step of [
            { name: "closed", width: 360, height: 800 },
            { name: "open", width: 768, height: 720 },
            { name: "pura", width: 800, height: 740 },
            { name: "closed-again", width: 360, height: 800 },
          ]) {
            await page.setViewportSize({ width: step.width, height: step.height });
            const found = await readLive(page, {
              channel: "app",
              shape: expectedShape(step.width, step.height),
              field: "[data-ke='where-field'] input",
              value: "Winnipeg",
              cap: step.width >= 768 ? pageCap(step.width) : 0,
            });
            for (const note of found.notes) problems.push(`matex-live ${step.name} ${note}`);
            if (found.origin !== armed.origin) problems.push(`matex-live ${step.name} new-document`);
          }
        }
      } catch (err) {
        problems.push(`matex-live ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      }
    }
    if (group.store === "microsoft") await liveWindow(page, base, problems);
    await context.close();
  }
  await windowsInputs(browser, base, problems);
  return problems;
}
