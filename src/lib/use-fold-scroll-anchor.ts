import { useEffect } from "react";

/** Width changes smaller than this are the keyboard, a toolbar or a scrollbar, not a fold. */
export const FOLD_WIDTH_STEP = 120;

const ANCHOR_SELECTOR = "[data-slug], [data-ke-anchor], article, section, li";
const MODAL_SELECTOR = "dialog[open], [aria-modal='true']";

/**
 * On a big width change (fold, unfold, Split View, Stage Manager), keep the item
 * the reader was looking at in the same spot. A grid going from one column to two
 * otherwise scrolls a different card under their eye. Width only, never device.
 * Skipped while a modal is open: the sheet keeps its own scroll.
 */
export function useFoldScrollAnchor() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    let lastW = window.innerWidth;
    let anchor: { el: Element; top: number } | null = null;
    let pending = 0;
    const pick = () => {
      if (document.querySelector(MODAL_SELECTOR)) return;
      const header = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const x = Math.round(document.documentElement.clientWidth / 2);
      const hit = typeof document.elementFromPoint === "function" ? document.elementFromPoint(x, Math.max(header + 24, 80)) : null;
      const el = hit?.closest(ANCHOR_SELECTOR) ?? null;
      anchor = el ? { el, top: el.getBoundingClientRect().top } : null;
    };
    const onScroll = () => {
      if (!pending) pick();
    };
    const onResize = () => {
      const w = window.innerWidth;
      if (Math.abs(w - lastW) < FOLD_WIDTH_STEP) {
        lastW = w;
        return;
      }
      lastW = w;
      const held = anchor;
      cancelAnimationFrame(pending);
      // Two frames: let the new layout (grid columns, split map, rail) settle first.
      pending = requestAnimationFrame(() => {
        pending = requestAnimationFrame(() => {
          pending = 0;
          if (held && held.el.isConnected && !document.querySelector(MODAL_SELECTOR)) {
            const delta = held.el.getBoundingClientRect().top - held.top;
            if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "instant" as ScrollBehavior });
          }
          pick();
        });
      });
    };
    pick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(pending);
    };
  }, []);
}
