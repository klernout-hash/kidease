/** Shared dismiss for Explore popovers (Places suggestions, date sheet). */
export const DISMISS_POPOVERS = "kidease-dismiss-popovers";

export function dismissPopovers() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DISMISS_POPOVERS));
}

/** True when a PlaceSearch host is on-screen and not in a `display:none` channel copy. */
export function placeHostVisible(el: HTMLElement | null | undefined) {
  if (!el?.isConnected) return false;
  const box = el.getBoundingClientRect();
  return box.width >= 2 && box.height >= 2;
}
