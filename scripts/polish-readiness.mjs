/** Browser-side content state. An h1 alone is never evidence that search finished. */
export const POLISH_READINESS_CONTRACT = "content-v3";

export function inspectPolishReadiness({ pageId }) {
  const shown = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      !element.closest("[hidden],[inert]")
    );
  };
  const visible = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector)).filter(shown);
  const pendingGate = visible(
    '[data-ke="admin-gate-pending"],[data-ke="admin-session-pending"],[aria-label="Starting KidEase"],[data-ke="parent-home"][data-settled="0"],[data-ke="daycare-desk"][data-settled="0"]',
  );
  if (pendingGate.length)
    return {
      ready: false,
      healthy: false,
      state: "pending",
      reason: "A route/session pending surface is still rendered.",
      pendingRegions: pendingGate.length,
    };
  if (pageId === "search") {
    const regions = visible('.ke-search-results,[data-ke="msv2-list"]');
    const countNodes = visible('[data-ke="search-count"],[data-ke="msv2-count"]');
    const countText = countNodes.map((node) => node.textContent.trim()).join(" | ");
    const loadingText = /Loading centres|Chargement des centres/i.test(countText);
    const pending = regions.flatMap((region) =>
      visible('[aria-busy="true"],.ke-result-stack > [aria-hidden="true"] .ke-skel', region),
    );
    const countSkeletons = countNodes.flatMap((node) => visible(".ke-skel", node));
    const refreshing = regions.some(
      (region) =>
        region.classList.contains("opacity-70") || region.getAttribute("aria-busy") === "true",
    );
    const resultLists = visible('[data-ke="search-result-list"],[data-ke="msv2-list"]');
    const slugs = [
      ...new Set(
        resultLists
          .flatMap((list) =>
            visible("[data-slug]", list).map((node) => node.getAttribute("data-slug")),
          )
          .filter(Boolean),
      ),
    ].sort();
    const details = {
      countText,
      uniqueListingCount: slugs.length,
      listingSlugs: slugs,
      pendingRegions: pending.length + countSkeletons.length,
      refreshing,
    };
    if (loadingText || pending.length || countSkeletons.length || refreshing)
      return {
        ...details,
        ready: false,
        healthy: false,
        state: "pending",
        reason: "Search result/count loading or refresh state remains rendered.",
      };
    if (slugs.length)
      return {
        ...details,
        ready: true,
        healthy: true,
        state: "results",
        fingerprint: JSON.stringify(["results", countText, slugs]),
      };
    const emptyTitles = regions
      .flatMap((region) =>
        visible(
          "p.font-display,[data-ke=search-empty],[data-ke=search-error],[role=alert]",
          region,
        ),
      )
      .map((node) => node.textContent.trim())
      .filter(Boolean);
    const mobileEmpty = visible('[data-ke="msv2-list"] > p')
      .map((node) => node.textContent.trim())
      .filter(Boolean);
    const titles = [...emptyTitles, ...mobileEmpty];
    const errorTitle = titles.find((text) =>
      /Couldn't load centres|Impossible de charger les centres/i.test(text),
    );
    if (errorTitle)
      return {
        ...details,
        ready: true,
        healthy: false,
        state: "error",
        title: errorTitle,
        fingerprint: JSON.stringify(["error", countText, errorTitle]),
      };
    const actionableEmpty = regions.some(
      (region) =>
        visible("p.font-display,[data-ke=search-empty]", region).length &&
        visible("a[href],button", region).length,
    );
    if (actionableEmpty || mobileEmpty.length)
      return {
        ...details,
        ready: true,
        healthy: true,
        state: "empty",
        title: titles[0] || "",
        fingerprint: JSON.stringify(["empty", countText, titles]),
      };
    return {
      ...details,
      ready: false,
      healthy: false,
      state: "missing",
      reason:
        "Neither actual search listings nor an explicit settled empty/error surface is rendered.",
    };
  }
  if (pageId === "home") {
    const surface = visible('[data-ke="home-discovery-surface"]')[0];
    const slugs = surface
      ? [
          ...new Set(
            visible("[data-slug]", surface)
              .map((node) => node.getAttribute("data-slug"))
              .filter(Boolean),
          ),
        ].sort()
      : [];
    if (!surface || !visible("h1", surface).length || !slugs.length)
      return {
        ready: false,
        healthy: false,
        state: "pending",
        reason: "The home discovery surface and actual listing cards have not both rendered.",
      };
    return {
      ready: true,
      healthy: true,
      state: "content",
      uniqueListingCount: slugs.length,
      listingSlugs: slugs,
      fingerprint: JSON.stringify(["home", slugs]),
    };
  }
  if (pageId === "listing") {
    const failed = visible('[data-ke="listing-retry"],[data-ke="listing-missing"]')[0];
    if (failed)
      return {
        ready: true,
        healthy: false,
        state: "error",
        title: failed.textContent.trim(),
        fingerprint: JSON.stringify(["listing-error", failed.textContent.trim()]),
      };
    const name = visible('[data-ke="listing-name"] h1')[0];
    if (!name)
      return {
        ready: false,
        healthy: false,
        state: "pending",
        reason: "Full listing data has not rendered; an early SEO summary alone is insufficient.",
      };
    return {
      ready: true,
      healthy: true,
      state: "content",
      title: name.textContent.trim(),
      fingerprint: JSON.stringify(["listing", name.textContent.trim()]),
    };
  }
  if (pageId === "login") {
    const form = visible('[data-ke="login-split"] [data-ke="email-sign-in"]')[0];
    if (
      !form ||
      !visible('input[type="email"]', form).length ||
      !visible('[data-ke="email-primary"]', form).length
    )
      return {
        ready: false,
        healthy: false,
        state: "pending",
        reason: "The actual email sign-in form and primary action are not both rendered.",
      };
    return { ready: true, healthy: true, state: "content", fingerprint: "email-sign-in-ready" };
  }
  const selector =
    pageId === "parent"
      ? '[data-ke="parent-home"][data-settled="1"]'
      : pageId === "daycare"
        ? '[data-ke="daycare-desk"][data-settled="1"]'
        : pageId === "admin"
          ? '[data-ke="admin-queue-filters"]'
          : ["org", "staff"].includes(pageId)
            ? ".ke-dense h2, .ke-dense p.font-display"
            : "h1";
  const nodes = visible(selector);
  if (!nodes.length)
    return {
      ready: false,
      healthy: false,
      state: "pending",
      selector,
      reason: "The expected route content marker is not rendered.",
    };
  const headings = nodes.map((node) => node.textContent.trim()).filter(Boolean);
  const error = headings.find((text) =>
    /could not finish loading|page not found|page introuvable/i.test(text),
  );
  if (error)
    return {
      ready: true,
      healthy: false,
      state: "error",
      selector,
      title: error,
      fingerprint: JSON.stringify(["error", error]),
    };
  const gated =
    ["org", "staff"].includes(pageId) &&
    headings.some((text) => /are off|sont éteints/i.test(text));
  return {
    ready: true,
    healthy: !gated,
    state: gated ? "gated" : "content",
    selector,
    fingerprint: JSON.stringify([selector, headings]),
  };
}

/** Two stable positive samples are required; a settled error is recorded, never called healthy. */
export async function waitForPolishReadiness(
  page,
  { pageId, timeoutMs = 25000, stableMs = 500, pollMs = 150 } = {},
) {
  const start = Date.now();
  let priorFingerprint = "";
  let stableSince = 0;
  let samples = 0;
  let last = { ready: false, healthy: false, state: "missing" };
  while (Date.now() - start <= timeoutMs) {
    last = await page.evaluate(inspectPolishReadiness, { pageId });
    samples += 1;
    if (last.ready) {
      if (last.fingerprint !== priorFingerprint) {
        priorFingerprint = last.fingerprint;
        stableSince = Date.now();
      }
      if (Date.now() - stableSince >= stableMs && samples >= 2)
        return {
          ...last,
          contract: POLISH_READINESS_CONTRACT,
          stableForMs: Date.now() - stableSince,
          samples,
          elapsedMs: Date.now() - start,
        };
    } else {
      priorFingerprint = "";
      stableSince = 0;
    }
    await page.waitForTimeout(Math.min(pollMs, Math.max(1, timeoutMs - (Date.now() - start))));
  }
  return {
    ...last,
    contract: POLISH_READINESS_CONTRACT,
    ready: false,
    healthy: false,
    samples,
    elapsedMs: Date.now() - start,
    reason: last.reason || "Content state did not remain stable within the readiness budget.",
  };
}
