/** Browser-side content state. An h1 alone is never evidence that search finished. */
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
    '[data-ke="admin-gate-pending"],[data-ke="admin-session-pending"],[aria-label="Starting KidEase"]',
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
  const selector =
    pageId === "parent"
      ? '[data-ke="parent-home-saved"]'
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
  return {
    ready: true,
    healthy: true,
    state:
      ["org", "staff"].includes(pageId) &&
      headings.some((text) => /are off|sont éteints/i.test(text))
        ? "gated"
        : "content",
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
    ready: false,
    healthy: false,
    samples,
    elapsedMs: Date.now() - start,
    reason: last.reason || "Content state did not remain stable within the readiness budget.",
  };
}
