import { useEffect } from "react";
import { isNative } from "@/lib/native";

/**
 * Keeps a focused field above the keyboard on iPhone and iPad, including
 * Split View. The web fallback uses the visual viewport. The native app
 * also listens to the Capacitor keyboard height.
 */
export function KeyboardInset() {
  useEffect(() => {
    const root = document.documentElement;
    const native = isNative();
    let nativeKeyboardHeight = 0;

    function pad(px: number) {
      root.style.setProperty("--ke-keyboard", `${Math.max(0, Math.round(px))}px`);
    }

    function reveal(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches("input, textarea, select")) return;
      window.setTimeout(() => {
        target.scrollIntoView({ block: "center", inline: "nearest" });
      }, 60);
    }

    function onViewport() {
      const vv = window.visualViewport;
      // iOS resize:"body" sets an explicit pixel height without resizing dvh.
      // Use that measured space, rather than subtracting the keyboard twice
      // when Android or the browser has already resized its viewport.
      const bodyStyle = document.body.style.height;
      const bodyHeight = native && bodyStyle.endsWith("px") ? Number.parseFloat(bodyStyle) : Infinity;
      const height = Math.min(window.innerHeight, vv?.height ?? Infinity, bodyHeight > 0 ? bodyHeight : Infinity);
      root.style.setProperty("--ke-viewport-height", `${Math.max(0, Math.round(height))}px`);
      pad(
        Math.max(
          nativeKeyboardHeight,
          window.innerHeight - (vv?.height ?? window.innerHeight) - (vv?.offsetTop ?? 0),
        ),
      );
    }

    function onFocus(event: FocusEvent) {
      reveal(event.target);
    }

    document.addEventListener("focusin", onFocus);
    onViewport();
    window.addEventListener("resize", onViewport);
    window.visualViewport?.addEventListener("resize", onViewport);
    window.visualViewport?.addEventListener("scroll", onViewport);

    let cancelNative = () => {};
    const bodyObserver = native ? new MutationObserver(onViewport) : null;
    bodyObserver?.observe(document.body, { attributes: true, attributeFilter: ["style"] });
    if (native) {
      void import("@capacitor/keyboard")
        .then(({ Keyboard }) => {
          const shown = Keyboard.addListener("keyboardWillShow", (info) => {
            nativeKeyboardHeight = info.keyboardHeight || 0;
            onViewport();
            root.dataset.keyboard = "open";
          });
          const hidden = Keyboard.addListener("keyboardWillHide", () => {
            nativeKeyboardHeight = 0;
            onViewport();
            delete root.dataset.keyboard;
          });
          cancelNative = () => {
            void shown.then((handle) => handle.remove());
            void hidden.then((handle) => handle.remove());
          };
        })
        .catch(() => undefined);
    }

    return () => {
      document.removeEventListener("focusin", onFocus);
      window.removeEventListener("resize", onViewport);
      window.visualViewport?.removeEventListener("resize", onViewport);
      window.visualViewport?.removeEventListener("scroll", onViewport);
      cancelNative();
      bodyObserver?.disconnect();
      root.style.removeProperty("--ke-keyboard");
      root.style.removeProperty("--ke-viewport-height");
    };
  }, []);

  return null;
}
