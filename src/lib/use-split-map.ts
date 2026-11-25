import { useEffect, useState } from "react";

/** Wide enough for the list and the map side by side, like Airbnb's results page. Website look. */
export const SPLIT_MAP_QUERY = "(min-width: 1120px)";

/**
 * App look (native shells, tablets, the inner display of a foldable such as
 * iPhone Duo at 951pt). Width and height only, never device or orientation.
 * Rollback: set this to "(min-width: 99999px)" to turn the app split off.
 */
export const APP_SPLIT_MAP_QUERY = "(min-width: 900px) and (min-height: 480px)";

/**
 * True when the list and map sit side by side: the app look from 900px wide,
 * or the website in the clean look from 1120px. Server render and first paint
 * stay false, so the list never waits on the map. Re-reads on every resize
 * and whenever the channel or look attribute changes (fold, unfold, Split View).
 */
export function useSplitMap(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const root = document.documentElement;
    const web = window.matchMedia(SPLIT_MAP_QUERY);
    const app = window.matchMedia(APP_SPLIT_MAP_QUERY);
    const read = () => setOn(root.dataset.channel === "app" ? app.matches : web.matches && root.dataset.look === "clean");
    read();
    web.addEventListener("change", read);
    app.addEventListener("change", read);
    const observer = typeof MutationObserver === "function" ? new MutationObserver(read) : null;
    observer?.observe(root, { attributes: true, attributeFilter: ["data-channel", "data-look"] });
    return () => {
      web.removeEventListener("change", read);
      app.removeEventListener("change", read);
      observer?.disconnect();
    };
  }, []);
  return on;
}
