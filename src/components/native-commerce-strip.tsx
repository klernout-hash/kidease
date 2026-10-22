import { useEffect } from "react";
import { NATIVE_COMMERCE_SELECTORS, readClientStoreChannel, shellBlocksCommerce } from "@/lib/native-entitlements";

function shellBlocks(): boolean {
  if (typeof document === "undefined") return false;
  return shellBlocksCommerce(readClientStoreChannel());
}

/** Unmounts click targets for digital goods inside the native shell. CSS hides them before this runs. */
export function NativeCommerceStrip() {
  useEffect(() => {
    if (!shellBlocks()) return;
    const disarm = () => {
      document.querySelectorAll(NATIVE_COMMERCE_SELECTORS).forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.dataset.keDisarmed === "1") return;
        node.dataset.keDisarmed = "1";
        node.hidden = true;
        node.setAttribute("aria-hidden", "true");
        node.style.setProperty("display", "none", "important");
        node.querySelectorAll("a,button").forEach((el) => {
          if (el instanceof HTMLAnchorElement) {
            el.removeAttribute("href");
            el.tabIndex = -1;
          }
          if (el instanceof HTMLButtonElement) el.disabled = true;
        });
      });
    };
    disarm();
    const observer = new MutationObserver(disarm);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
