import { useEffect, useState } from "react";

/**
 * True while <html data-channel="app"> (native shells, phones, tablets, the
 * Windows package below 1024px). Follows the attribute that channel-boot.js
 * repaints on every resize. Server render and first paint are false.
 */
export function useAppChannel(): boolean {
  const [app, setApp] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const read = () => setApp(root.dataset.channel === "app");
    read();
    if (typeof MutationObserver !== "function") return;
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-channel"] });
    return () => observer.disconnect();
  }, []);
  return app;
}
