import { useEffect, useState } from "react";

/** Wide enough for the list and the map side by side, like Airbnb's results page. */
export const SPLIT_MAP_QUERY = "(min-width: 1120px)";

/**
 * True on wide screens in the clean look. Server render and first paint stay false,
 * so the list never waits on the map.
 */
export function useSplitMap(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(SPLIT_MAP_QUERY);
    const read = () => setOn(media.matches && document.documentElement.dataset.look === "clean");
    read();
    media.addEventListener("change", read);
    return () => media.removeEventListener("change", read);
  }, []);
  return on;
}
