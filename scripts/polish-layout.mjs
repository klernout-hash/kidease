#!/usr/bin/env node
/** Local-only, non-interactive page audit; never submits product forms. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import {
  inspectPolishReadiness,
  waitForPolishReadiness,
  POLISH_READINESS_CONTRACT,
} from "./polish-readiness.mjs";
import {
  POLISH_PAGES,
  POLISH_SCREENSHOT_WIDTHS,
  localAuditUrl,
  polishPath,
  polishProfiles,
} from "./polish-coverage.mjs";

function options(args) {
  const result = {
    base: "http://127.0.0.1:8081",
    out: "artifacts/performance-polish",
    mode: "quick",
    phase: "local",
    locales: "en,fr",
    pages: "core",
    slug: "",
    fixtures: "none",
    scroll: "full",
    chrome: "",
    menu: "yes",
    revision: "",
    workers: "1",
    reuse: "",
    "retry-pages": "",
    "retry-reason": "",
  };
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index].replace(/^--/, "");
    if (
      !(key in result) ||
      !args[index].startsWith("--") ||
      !args[index + 1] ||
      args[index + 1].startsWith("--")
    )
      throw new Error(`Unsupported or missing argument: ${args[index]}`);
    result[key] = args[++index];
  }
  result.base = localAuditUrl(result.base);
  result.out = resolve(result.out);
  const inside = relative(process.cwd(), result.out);
  if (!inside || inside.startsWith("..") || isAbsolute(inside))
    throw new Error("Output must be a directory inside this checkout.");
  if (!/^[a-z0-9-]+$/.test(result.phase))
    throw new Error("Use a simple phase label, such as before or after.");
  if (!["none", "local-pglite"].includes(result.fixtures))
    throw new Error("--fixtures must be none or local-pglite.");
  if (result.fixtures === "local-pglite" && process.env.POLISH_FIXTURE_DATABASE !== "local-pglite")
    throw new Error(
      "Verify the server uses a disposable local PGLite database, then set POLISH_FIXTURE_DATABASE=local-pglite explicitly.",
    );
  result.locales = result.locales.split(",");
  if (result.locales.some((locale) => !["en", "fr"].includes(locale)))
    throw new Error("Locales must be en and/or fr.");
  if (!["full", "top"].includes(result.scroll)) throw new Error("--scroll must be full or top.");
  if (!["yes", "no"].includes(result.menu)) throw new Error("--menu must be yes or no.");
  if (result.revision && !/^[a-f0-9]{40}$/.test(result.revision))
    throw new Error("--revision must be a verified full served-source Git SHA.");
  result.workers = Number(result.workers);
  if (!Number.isInteger(result.workers) || result.workers < 1 || result.workers > 3)
    throw new Error("--workers must be 1, 2 or 3.");
  if (result["retry-pages"] && (!result.reuse || !result["retry-reason"]))
    throw new Error(
      "Retry pages require --reuse and an explicit --retry-reason; prior attempts remain linked.",
    );
  return result;
}

/** Runs in the page; records exceptions so exclusions are reviewable. */
export function inspectLayout() {
  const styles = new WeakMap();
  const rects = new WeakMap();
  const styleOf = (el) => {
    if (!styles.has(el)) styles.set(el, getComputedStyle(el));
    return styles.get(el);
  };
  const rectOf = (el) => {
    if (!rects.has(el)) rects.set(el, el.getBoundingClientRect());
    return rects.get(el);
  };
  const issues = [];
  const observations = [];
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const selector =
    "a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=checkbox],[role=switch]";
  const name = (el) =>
    (
      el.getAttribute("aria-label") ||
      el.getAttribute("alt") ||
      el.textContent ||
      el.getAttribute("name") ||
      el.tagName
    )
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 100);
  const locator = (el) => {
    if (el.id) return `#${el.id}`;
    if (el.getAttribute("data-ke"))
      return `${el.tagName.toLowerCase()}[data-ke="${el.getAttribute("data-ke")}"]`;
    return `${el.tagName.toLowerCase()}${el.classList.length ? `.${Array.from(el.classList).slice(0, 3).join(".")}` : ""}`;
  };
  const box = (rect) => ({
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width * 10) / 10,
    height: Math.round(rect.height * 10) / 10,
  });
  function visuallyHidden(el) {
    const style = styleOf(el);
    return style.clip === "rect(0px, 0px, 0px, 0px)" || style.clipPath === "inset(50%)";
  }
  function rendered(el) {
    if (!(el instanceof HTMLElement || el instanceof SVGElement)) return false;
    const rect = rectOf(el);
    const style = styleOf(el);
    const visible =
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0 &&
      !visuallyHidden(el) &&
      !el.closest("[hidden],[inert],details:not([open]) > :not(summary)");
    if (!visible) return false;
    for (let parent = el.parentElement; parent; parent = parent.parentElement)
      if (Number(styleOf(parent).opacity) === 0) return false;
    return true;
  }
  function horizontalScroller(el) {
    for (
      let parent = el.parentElement;
      parent && parent !== document.body;
      parent = parent.parentElement
    ) {
      const style = styleOf(parent);
      if (
        ["auto", "scroll"].includes(style.overflowX) &&
        parent.scrollWidth > parent.clientWidth + 1
      )
        return parent;
    }
    return null;
  }
  function clippedRect(rect, el) {
    let left = Math.max(0, rect.left),
      top = Math.max(0, rect.top),
      right = Math.min(vw, rect.right),
      bottom = Math.min(vh, rect.bottom);
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      const style = styleOf(parent),
        bounds = rectOf(parent);
      if (["auto", "scroll", "hidden", "clip"].includes(style.overflowX)) {
        left = Math.max(left, bounds.left + parent.clientLeft);
        right = Math.min(right, bounds.left + parent.clientLeft + parent.clientWidth);
      }
      if (["auto", "scroll", "hidden", "clip"].includes(style.overflowY)) {
        top = Math.max(top, bounds.top + parent.clientTop);
        bottom = Math.min(bottom, bounds.top + parent.clientTop + parent.clientHeight);
      }
    }
    return right > left && bottom > top
      ? { left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top }
      : null;
  }
  const visibleRects = (el) =>
    Array.from(el.getClientRects())
      .map((rect) => clippedRect(rect, el))
      .filter(Boolean);
  const inViewport = (el) => visibleRects(el).length > 0;
  const points = (rect) =>
    [0.2, 0.5, 0.8].flatMap((x) =>
      [0.2, 0.5, 0.8].map((y) => ({
        x: rect.left + rect.width * x,
        y: rect.top + rect.height * y,
      })),
    );
  const hitControl = (node) => {
    if (!(node instanceof Element)) return null;
    const control = node.closest(selector);
    if (control) return control;
    const label = node.closest("label");
    return label instanceof HTMLLabelElement ? label.control : null;
  };
  const ownHit = (el, point) => hitControl(document.elementFromPoint(point.x, point.y)) === el;
  const usable = (el) =>
    visibleRects(el)
      .flatMap(points)
      .some((point) => ownHit(el, point));
  function anchored(el) {
    for (let parent = el; parent; parent = parent.parentElement)
      if (["fixed", "sticky"].includes(styleOf(parent).position)) return true;
    return false;
  }
  const chromeRegions = Array.from(
    document.querySelectorAll('header,nav,[role="navigation"],[role="toolbar"]'),
  ).filter(
    (el) =>
      rendered(el) &&
      ["fixed", "sticky"].includes(styleOf(el).position) &&
      rectOf(el).width >= vw / 2,
  );
  const safeTop = Math.max(
    0,
    ...chromeRegions
      .filter((el) => rectOf(el).top <= 1)
      .map((el) => Math.min(vh, rectOf(el).bottom)),
  );
  const safeBottom = Math.min(
    vh,
    ...chromeRegions
      .filter((el) => rectOf(el).bottom >= vh - 1)
      .map((el) => Math.max(0, rectOf(el).top)),
  );
  const chromeFor = (el) => chromeRegions.find((region) => region.contains(el));
  function canRevealByDocumentScroll(el) {
    if (anchored(el)) return false;
    const rect = rectOf(el),
      scrollMax = document.documentElement.scrollHeight - vh;
    if (scrollMax <= 1 || rect.height > safeBottom - safeTop) return false;
    const documentTop = rect.top + window.scrollY;
    const scroll = Math.max(0, Math.min(scrollMax, documentTop - safeTop));
    const top = documentTop - scroll;
    return top >= safeTop - 1 && top + rect.height <= safeBottom + 1;
  }
  function scrollChromePair(a, b) {
    return Boolean(
      (chromeFor(a) && !chromeFor(b) && canRevealByDocumentScroll(b)) ||
      (chromeFor(b) && !chromeFor(a) && canRevealByDocumentScroll(a)),
    );
  }
  function cardSavePair(a, b) {
    const save = [a, b].find((el) => el.getAttribute("data-ke") === "save-listing");
    if (!save) return false;
    const image = save === a ? b : a,
      card = save.closest("article[data-slug]");
    if (
      !card ||
      image.tagName !== "A" ||
      !/\/daycare\/[^/?#]+/.test(image.getAttribute("href") || "") ||
      image.parentElement !== save.parentElement ||
      image.closest("article[data-slug]") !== card ||
      !image.querySelector('img,picture,[data-ke="photo-fallback"]') ||
      styleOf(save).position !== "absolute"
    )
      return false;
    const s = rectOf(save),
      i = rectOf(image);
    return (
      s.left >= i.left - 1 &&
      s.right <= i.right + 1 &&
      s.top >= i.top - 1 &&
      s.bottom <= i.bottom + 1 &&
      s.width * s.height < (i.width * i.height) / 2 &&
      usable(save) &&
      usable(image)
    );
  }
  function passwordPair(a, b) {
    const input = [a, b].find((el) => el instanceof HTMLInputElement);
    if (!input) return false;
    const toggle = input === a ? b : a;
    if (
      toggle.tagName !== "BUTTON" ||
      toggle.getAttribute("type") !== "button" ||
      !input.id ||
      toggle.getAttribute("aria-controls") !== input.id ||
      input.parentElement !== toggle.parentElement ||
      !["password", "text"].includes(input.type) ||
      styleOf(toggle).position !== "absolute"
    )
      return false;
    const i = rectOf(input),
      t = rectOf(toggle),
      reserved = parseFloat(styleOf(input).paddingRight);
    return (
      t.left >= i.right - reserved - 1 &&
      t.right <= i.right + 1 &&
      t.top >= i.top - 1 &&
      t.bottom <= i.bottom + 1 &&
      usable(input) &&
      usable(toggle)
    );
  }
  const activeDialog = Array.from(
    document.querySelectorAll('[role="dialog"][aria-modal="true"],dialog[open]'),
  ).find((el) => rendered(el) && inViewport(el));
  const add = (kind, el, extra = {}) =>
    issues.push({
      kind,
      target: locator(el),
      text: name(el),
      rect: box(rectOf(el)),
      ...extra,
    });
  if (document.documentElement.scrollWidth > vw + 1)
    issues.push({
      kind: "document-overflow",
      width: vw,
      scrollWidth: document.documentElement.scrollWidth,
    });

  const candidates = Array.from((activeDialog || document).querySelectorAll(selector)).filter(
    rendered,
  );
  const controls = candidates.filter(inViewport);
  for (const el of candidates.filter((item) => !inViewport(item))) {
    const rect = rectOf(el);
    if (rect.right > 0 && rect.left < vw && rect.bottom > 0 && rect.top < vh) {
      let scrollable = horizontalScroller(el);
      for (let parent = el.parentElement; !scrollable && parent; parent = parent.parentElement)
        if (
          ["auto", "scroll"].includes(styleOf(parent).overflowY) &&
          parent.scrollHeight > parent.clientHeight + 1
        )
          scrollable = parent;
      if (scrollable)
        observations.push({
          kind: "interactive-clipped-by-scroll-region",
          target: locator(el),
          scrollRegion: locator(scrollable),
        });
      else
        add("interactive-clipped", el, {
          reason: "Ancestor clipping leaves no pointer-visible hit area.",
        });
    }
  }
  for (const el of controls) {
    const rect = rectOf(el);
    let target = rect;
    if (el instanceof HTMLInputElement) {
      const labels = Array.from(el.labels || []).filter(rendered);
      const label = labels.find((item) => rectOf(item).width >= 44 && rectOf(item).height >= 44);
      if (label) {
        target = rectOf(label);
        observations.push({
          kind: "associated-label-target",
          target: locator(el),
          label: locator(label),
          rect: box(target),
        });
      }
    }
    if (target.width < 43.5 || target.height < 43.5)
      add("tap-target-under-44", el, { effectiveTarget: box(target) });
    const labelledBy = (el.getAttribute("aria-labelledby") || "")
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || "")
      .join(" ")
      .trim();
    const formName = el.labels
      ? Array.from(el.labels)
          .map((label) => label.textContent || "")
          .join(" ")
          .trim()
      : "";
    const textName = ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)
      ? el instanceof HTMLInputElement && ["submit", "reset", "button"].includes(el.type)
        ? el.value
        : ""
      : el.textContent?.trim();
    if (!(
      el.getAttribute("aria-label") ||
      labelledBy ||
      formName ||
      textName ||
      el.getAttribute("title")
    ))
      add("control-name-missing", el);
  }
  for (let i = 0; i < controls.length; i += 1) {
    const a = controls[i];
    for (let j = i + 1; j < controls.length; j += 1) {
      const b = controls[j];
      if (a.contains(b) || b.contains(a)) {
        add("nested-interactive", a, { other: locator(b) });
        continue;
      }
      const intersections = visibleRects(a)
        .flatMap((ra) =>
          visibleRects(b).map((rb) => ({
            left: Math.max(ra.left, rb.left),
            top: Math.max(ra.top, rb.top),
            right: Math.min(ra.right, rb.right),
            bottom: Math.min(ra.bottom, rb.bottom),
          })),
        )
        .map((rect) => ({ ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top }))
        .filter((rect) => rect.width > 2 && rect.height > 2);
      if (!intersections.length) continue;
      const hits = intersections.flatMap(points).filter((point) => {
        const front = hitControl(document.elementFromPoint(point.x, point.y));
        if (front !== a && front !== b) return false;
        const stack = document.elementsFromPoint(point.x, point.y).map(hitControl);
        return stack.includes(a) && stack.includes(b);
      });
      if (!hits.length) {
        observations.push({
          kind: "geometry-without-shared-hit-area",
          target: locator(a),
          other: locator(b),
        });
        continue;
      }
      const intentionalSave = cardSavePair(a, b),
        paddedPassword = passwordPair(a, b),
        scrollChrome = scrollChromePair(a, b);
      if (intentionalSave || paddedPassword || scrollChrome)
        observations.push({
          kind: intentionalSave
            ? "same-card-photo-save-overlay"
            : paddedPassword
              ? "reserved-password-toggle"
              : "scroll-revealable-navigation-occlusion",
          target: locator(a),
          other: locator(b),
          sampledSharedHits: hits.length,
        });
      else
        add("interactive-overlap", a, {
          other: locator(b),
          otherText: name(b),
          sampledSharedHits: hits.length,
          hitEvidence: hits.slice(0, 3).map((point) => ({
            x: Math.round(point.x),
            y: Math.round(point.y),
            front: locator(hitControl(document.elementFromPoint(point.x, point.y))),
          })),
        });
    }
  }
  for (const el of controls) {
    if (
      el.matches(":disabled,[aria-disabled=true]") ||
      styleOf(el).pointerEvents === "none" ||
      usable(el)
    )
      continue;
    const blockers = visibleRects(el)
      .flatMap(points)
      .map((point) => document.elementFromPoint(point.x, point.y))
      .filter(Boolean);
    const onlyChrome =
      blockers.length &&
      blockers.every((node) => chromeRegions.some((region) => region.contains(node)));
    if (onlyChrome && canRevealByDocumentScroll(el))
      observations.push({
        kind: "scroll-revealable-navigation-occlusion",
        target: locator(el),
        sampledHits: 0,
      });
    else
      add("interactive-occluded", el, {
        sampledHits: 0,
        blockers: [...new Set(blockers.map((node) => locator(hitControl(node) || node)))].slice(
          0,
          4,
        ),
      });
  }
  for (const el of (activeDialog || document).querySelectorAll(activeDialog ? "*" : "body *")) {
    if (visuallyHidden(el)) {
      observations.push({ kind: "visually-hidden-accessible-text", target: locator(el) });
      continue;
    }
    if (!rendered(el) || !inViewport(el)) continue;
    const rect = rectOf(el);
    const scroller = horizontalScroller(el);
    if (rect.left < -1 || rect.right > vw + 1) {
      if (scroller)
        observations.push({
          kind: "horizontal-scroll-region",
          target: locator(el),
          region: locator(scroller),
        });
      else if (!el.closest("svg") && !["SVG", "PATH"].includes(el.tagName))
        add("element-outside-viewport", el);
    }
    if (
      !(el instanceof HTMLElement) ||
      !el.textContent?.trim() ||
      el.children.length ||
      el.clientWidth === 0
    )
      continue;
    const style = styleOf(el);
    if (el.scrollWidth > el.clientWidth + 1 && ["hidden", "clip"].includes(style.overflowX)) {
      const accessible = el.getAttribute("aria-label") || el.getAttribute("title");
      if (style.textOverflow === "ellipsis" && accessible)
        observations.push({
          kind: "accessible-ellipsis",
          target: locator(el),
          accessibleText: accessible,
        });
      else
        add("text-clipped-horizontal", el, {
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          textOverflow: style.textOverflow,
        });
    }
    if (
      el.scrollHeight > el.clientHeight + 2 &&
      ["hidden", "clip"].includes(style.overflowY) &&
      style.webkitLineClamp === "none"
    )
      add("text-clipped-vertical", el, {
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
      });
  }
  for (const image of document.images) {
    if (rendered(image) && inViewport(image) && !image.hasAttribute("alt"))
      add("image-alt-missing", image);
  }
  return {
    issues,
    observations,
    page: {
      width: vw,
      height: vh,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      scrollY: window.scrollY,
      look: document.documentElement.dataset.look || "classic",
      theme: document.documentElement.dataset.resolvedTheme,
      textScale: document.documentElement.dataset.textScale || "md",
      scope: activeDialog ? "active-modal-only" : "page",
      activeDialog: activeDialog ? locator(activeDialog) : null,
    },
  };
}

async function seed(context, base, role) {
  const response = await context.request.post(`${base}/api/e2e-seed`, {
    data: {
      role,
      paid: false,
      ownSlug: role === "provider" ? "e2e-attention-centre" : "",
      activity: true,
      attention: true,
    },
    headers: { origin: base, "content-type": "application/json" },
  });
  if (!response.ok())
    throw new Error(
      `Local fixture seed returned ${response.status()}; authenticated page was not audited.`,
    );
  // Local HTTP needs the same compatibility cookie as the existing WebKit smoke.
  const cookies = response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value.split(";")[0])
    .filter((value) => value.includes("session_token="));
  if (cookies[0]) {
    const value = cookies[0].slice(cookies[0].indexOf("=") + 1);
    await context.addCookies([
      {
        name: "kidease.e2e_session",
        value: decodeURIComponent(value),
        url: base,
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
  }
}

async function run() {
  const args = options(process.argv.slice(2));
  const profiles = polishProfiles(args.mode);
  const selected =
    args.pages === "all"
      ? POLISH_PAGES
      : args.pages === "core"
        ? POLISH_PAGES.filter((page) => page.tier === "core")
        : args.pages === "public"
          ? POLISH_PAGES.filter((page) => page.tier !== "desk")
          : POLISH_PAGES.filter((page) => args.pages.split(",").includes(page.id));
  if (!selected.length) throw new Error("No matching page IDs.");
  mkdirSync(args.out, { recursive: true });
  let sha = "unavailable";
  try {
    sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    /* provenance stays unavailable */
  }
  const manifest = {
    schemaVersion: 1,
    phase: args.phase,
    commit: args.revision || sha,
    provenance: {
      servedRevision: args.revision || sha,
      servedRevisionSource: args.revision
        ? "explicit independently verified source"
        : "working checkout HEAD; verify server separately",
      harnessRevision: sha,
    },
    startedAt: new Date().toISOString(),
    configuration: { ...args, profiles },
    methodology: {
      engine: "Chromium headless",
      physicalDevice: false,
      externalRequests: "blocked",
      healthRequests: "blocked",
      zoom: "Half CSS viewport reflow approximation, not browser UI zoom",
      overlapScope: "Rendered viewport at each recorded scroll position",
      input:
        "No product form is submitted; optional loopback seed creates only disposable local fixtures",
      animations: "reduced-motion requested",
    },
    pages: POLISH_PAGES.map((page) => ({
      ...page,
      selected: selected.includes(page),
      status: "not-run",
    })),
    results: [],
  };
  const reportPath = resolve(args.out, `${args.phase}-layout.json`);
  let reused = [];
  if (args.reuse) {
    const prior = JSON.parse(readFileSync(resolve(args.reuse), "utf8"));
    if (
      prior.commit !== manifest.commit ||
      prior.phase !== manifest.phase ||
      prior.configuration.base !== args.base
    )
      throw new Error(
        "Reused evidence must have the same verified source revision, phase, and local server origin.",
      );
    reused = prior.results.filter((result) => !["running", "interrupted"].includes(result.status));
    manifest.reusedEvidence = {
      report: resolve(args.reuse),
      cases: reused.length,
      originalMode: prior.configuration.mode,
      originalScroll: prior.configuration.scroll,
      retriedPages: args["retry-pages"].split(",").filter(Boolean),
      retryReason: args["retry-reason"] || null,
    };
  }
  const save = () => writeFileSync(reportPath, `${JSON.stringify(manifest, null, 2)}\n`);
  save();
  const browser = await chromium.launch({
    headless: true,
    ...(args.chrome ? { executablePath: args.chrome } : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    for (const pageSpec of selected) {
      const coverage = manifest.pages.find((page) => page.id === pageSpec.id);
      if (pageSpec.safetyBlock) {
        coverage.status = "blocked";
        coverage.reason = pageSpec.safetyBlock;
        save();
        continue;
      }
      if (pageSpec.requiresSlug && !args.slug) {
        coverage.status = "blocked";
        coverage.reason = "No verified local catalog slug supplied.";
        save();
        continue;
      }
      if (pageSpec.role && args.fixtures !== "local-pglite") {
        coverage.status = "blocked";
        coverage.reason = "Disposable local fixture database not explicitly verified.";
        save();
        continue;
      }
      coverage.status = "running";
      let fixtureState;
      if (pageSpec.role) {
        const fixtureContext = await browser.newContext();
        try {
          await seed(fixtureContext, args.base, pageSpec.role);
          fixtureState = await fixtureContext.storageState();
        } catch (error) {
          coverage.status = "blocked";
          coverage.reason = String(error.message || error);
          save();
          continue;
        } finally {
          await fixtureContext.close();
        }
      }
      const cases = args.locales.flatMap((locale) =>
        profiles.map((profile) => ({ locale, profile })),
      );
      let nextCase = 0;
      async function runCase({ locale, profile }) {
        const existing = reused.find(
          (row) => row.page === pageSpec.id && row.locale === locale && row.profile === profile.id,
        );
        if (
          existing &&
          !args["retry-pages"].split(",").includes(pageSpec.id) &&
          existing.readiness?.contract === POLISH_READINESS_CONTRACT
        ) {
          manifest.results.push({ ...existing, reusedFrom: resolve(args.reuse) });
          save();
          return;
        }
        const result = {
          page: pageSpec.id,
          locale,
          profile: profile.id,
          viewport: { width: profile.width, height: profile.height },
          requestedPath: polishPath(pageSpec, locale, args.slug),
          status: "running",
          issues: [],
          observations: [],
          blockedRequests: [],
          consoleErrors: [],
          pageErrors: [],
          ...(existing
            ? {
                priorAttempt: {
                  report: resolve(args.reuse),
                  status: existing.status,
                  reason: existing.reason || null,
                  readiness: existing.readiness,
                  retryReason: args["retry-reason"],
                },
              }
            : {}),
        };
        manifest.results.push(result);
        const context = await browser.newContext({
          viewport: result.viewport,
          colorScheme: profile.theme,
          reducedMotion: "reduce",
          serviceWorkers: "block",
          ...(fixtureState ? { storageState: fixtureState } : {}),
        });
        try {
          await context.routeWebSocket("**", (socket) => {
            result.blockedRequests.push({
              kind: "websocket",
              destination: new URL(socket.url()).origin,
            });
            socket.close();
          });
          await context.route("**/*", async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            if (["data:", "blob:"].includes(url.protocol)) return route.continue();
            let pathname = url.pathname;
            try {
              pathname = decodeURIComponent(pathname).replace(/\/+/g, "/").replace(/\/+$/, "");
            } catch {
              /* invalid escapes stay blocked by the origin check */
            }
            if (url.origin !== args.base || pathname === "/api/health") {
              result.blockedRequests.push({
                kind: pathname === "/api/health" ? "forbidden-health" : "external",
                resourceType: request.resourceType(),
                destination: url.origin === args.base ? url.pathname : url.origin,
              });
              return route.abort("blockedbyclient");
            }
            return route.continue();
          });
          await context.addInitScript(({ theme, textScale }) => {
            localStorage.setItem("kidease-theme", theme);
            localStorage.setItem("kidease-text-scale", textScale);
          }, profile);
          const page = await context.newPage();
          page.on("pageerror", (error) => result.pageErrors.push(error.message));
          page.on("console", (message) => {
            if (message.type() === "error") result.consoleErrors.push(message.text().slice(0, 240));
          });
          const url = new URL(result.requestedPath, args.base);
          url.searchParams.set("look", profile.look);
          const response = await page.goto(url.href, {
            waitUntil: "domcontentloaded",
            timeout: 45000,
          });
          const routeUnavailable =
            (response?.status() || 0) >= 400 ||
            new URL(page.url()).pathname !== new URL(result.requestedPath, args.base).pathname;
          result.readiness = routeUnavailable
            ? {
                ready: false,
                healthy: false,
                state: "unavailable",
                reason: `Expected ${new URL(result.requestedPath, args.base).pathname}, received ${response?.status() || 0} ${new URL(page.url()).pathname}.`,
              }
            : await waitForPolishReadiness(page, { pageId: pageSpec.id });
          result.readiness.contract = POLISH_READINESS_CONTRACT;
          result.fontsReady = await page.evaluate(() =>
            Promise.race([
              document.fonts.ready.then(() => true),
              new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
            ]),
          );
          result.httpStatus = response?.status() || 0;
          result.finalPath = new URL(page.url()).pathname;
          result.title = await page.title();
          const body = (await page.locator("body").innerText()).slice(0, 240);
          result.bodyPrefix = body;
          result.headings = await page.locator("h1,h2").allTextContents();
          result.mainText = (
            await page
              .locator('[data-ke="parent-identity"], .ke-dense, main')
              .first()
              .innerText()
              .catch(() => "")
          ).slice(0, 600);
          result.surfaceState =
            pageSpec.gate &&
            /not (?:available|enabled)|turned off|disabled|not yet|bientôt|désactiv|indisponible|pas encore/i.test(
              await page.locator("body").innerText(),
            )
              ? "feature-gated-or-empty; inspect screenshot"
              : pageSpec.role
                ? "local authenticated fixture; inspect screenshot for populated-state coverage"
                : "public";
          const wantedPath = new URL(result.requestedPath, args.base).pathname;
          if (
            result.finalPath !== wantedPath ||
            !result.readiness.ready ||
            result.httpStatus >= 400 ||
            /page not found|page introuvable|KidEase could not finish loading/i.test(body) ||
            (await page.locator('[data-ke="admin-gate-pending"]').count())
          ) {
            result.status = "blocked";
            result.reason = !result.readiness.ready
              ? result.readiness.reason
              : `Expected ${wantedPath}, received ${result.httpStatus} ${result.finalPath}.`;
          } else {
            const seenIssues = new Set();
            const seenObservations = new Set();
            let scrollPosition = 0;
            let scrollSteps = 0;
            do {
              await page.evaluate((y) => window.scrollTo(0, y), scrollPosition);
              await page.waitForTimeout(60);
              const content = await page.evaluate(inspectPolishReadiness, { pageId: pageSpec.id });
              if (!content.ready || content.fingerprint !== result.readiness.fingerprint) {
                result.status = "blocked";
                result.reason = "Content changed or returned to pending during the geometry scan.";
                result.readiness.duringAudit = content;
                break;
              }
              const sample = await page.evaluate(inspectLayout);
              result.rendered = sample.page;
              for (const issue of sample.issues) {
                const key = JSON.stringify([issue.kind, issue.target, issue.text, issue.other]);
                if (!seenIssues.has(key)) {
                  seenIssues.add(key);
                  result.issues.push({ ...issue, scrollY: sample.page.scrollY });
                }
              }
              for (const observation of sample.observations) {
                const key = JSON.stringify([
                  observation.kind,
                  observation.target,
                  observation.region,
                ]);
                if (!seenObservations.has(key)) {
                  seenObservations.add(key);
                  result.observations.push(observation);
                }
              }
              scrollSteps += 1;
              scrollPosition += Math.round(profile.height * 0.8);
              if (
                args.scroll === "top" ||
                scrollPosition >= sample.page.scrollHeight ||
                scrollSteps >= 80
              )
                break;
            } while (scrollSteps < 80);
            result.scrollSteps = scrollSteps;
            result.scrollCoverage =
              args.scroll === "top"
                ? "first viewport only"
                : scrollSteps >= 80
                  ? "capped at 80 scroll samples"
                  : "full document with 20% overlapping viewport samples";
            result.geometryStatus =
              result.issues.length || result.pageErrors.length ? "failed" : "passed";
            if (result.status !== "blocked")
              result.status =
                result.geometryStatus === "passed" && result.readiness.healthy && result.fontsReady
                  ? "passed"
                  : "failed";
            if (result.readiness.state === "error")
              result.reason =
                "A settled search error surface was audited; healthy result-data coverage was unavailable.";
            if (result.readiness.state === "gated") {
              result.status = "blocked";
              result.reason = "Feature flags are off; only gated-state geometry was audited.";
            }
          }
          const screenshot =
            args.mode !== "matrix" &&
            (POLISH_SCREENSHOT_WIDTHS.includes(profile.width) ||
              profile.look !== "classic" ||
              profile.theme !== "light");
          if (screenshot) {
            await page.evaluate(() => window.scrollTo(0, 0));
            const screenshotState = await waitForPolishReadiness(page, {
              pageId: pageSpec.id,
              timeoutMs: 5000,
              stableMs: 300,
            });
            result.readiness.beforeScreenshot =
              screenshotState.ready && screenshotState.fingerprint === result.readiness.fingerprint;
            result.readiness.screenshotState = screenshotState;
            if (!result.readiness.beforeScreenshot) {
              result.status = "blocked";
              result.reason =
                "Route returned to pending content before screenshot; not counted as loaded coverage.";
            }
            result.screenshot = `${args.phase}-${pageSpec.id}-${locale}-${profile.id}.png`;
            await page.screenshot({
              path: resolve(args.out, result.screenshot),
              fullPage: true,
              animations: "disabled",
            });
          }
        } catch (error) {
          result.status = "error";
          result.reason = String(error.message || error).slice(0, 500);
        } finally {
          await context.close();
          save();
        }
        console.log(
          `${args.phase}: ${pageSpec.id} ${locale} ${profile.id}: ${result.status} (${result.issues.length} issues)`,
        );
      }
      await Promise.all(
        Array.from({ length: Math.min(args.workers, cases.length) }, async () => {
          while (nextCase < cases.length) {
            const current = cases[nextCase++];
            await runCase(current);
          }
        }),
      );
      const rows = manifest.results.filter((row) => row.page === pageSpec.id);
      coverage.status = rows.every((row) => row.status === "passed")
        ? "passed"
        : rows.some((row) => ["failed", "error"].includes(row.status))
          ? "failed"
          : "blocked";
      save();
    }
  } finally {
    await browser.close();
    manifest.finishedAt = new Date().toISOString();
    save();
  }
  const counts = manifest.results.reduce(
    (acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }),
    {},
  );
  console.log(
    JSON.stringify(
      {
        report: reportPath,
        counts,
        blockedPages: manifest.pages
          .filter((page) => page.selected && page.status === "blocked")
          .map((page) => page.id),
      },
      null,
      2,
    ),
  );
  process.exitCode =
    manifest.results.some((row) => ["failed", "error", "blocked"].includes(row.status)) ||
    manifest.pages.some((page) => page.selected && page.status === "blocked")
      ? 1
      : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname))
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
