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
      if (!vv) return;
      pad(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    }

    function onFocus(event: FocusEvent) {
      reveal(event.target);
    }

    document.addEventListener("focusin", onFocus);
    window.visualViewport?.addEventListener("resize", onViewport);
    window.visualViewport?.addEventListener("scroll", onViewport);

    let cancelNative = () => {};
    if (isNative()) {
      void import("@capacitor/keyboard")
        .then(({ Keyboard }) => {
          const shown = Keyboard.addListener("keyboardWillShow", (info) => pad(info.keyboardHeight || 0));
          const hidden = Keyboard.addListener("keyboardWillHide", () => pad(0));
          cancelNative = () => {
            void shown.then((handle) => handle.remove());
            void hidden.then((handle) => handle.remove());
          };
        })
        .catch(() => undefined);
    }

    return () => {
      document.removeEventListener("focusin", onFocus);
      window.visualViewport?.removeEventListener("resize", onViewport);
      window.visualViewport?.removeEventListener("scroll", onViewport);
      cancelNative();
      root.style.removeProperty("--ke-keyboard");
    };
  }, []);

  return null;
}
