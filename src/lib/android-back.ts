import { isNative, nativePlatform } from "./native.ts";

export type AndroidBackDecision = "back" | "exit" | "ignore";

/** Home is the only place Android may leave the app. Every other screen goes back. */
export function androidBackDecision(input: {
  platform: string;
  path: string;
  canGoBack: boolean;
}): AndroidBackDecision {
  if (input.platform !== "android") return "ignore";
  const path = (input.path.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  const home = path === "/" || path === "/fr";
  if (!home || input.canGoBack) return "back";
  return "exit";
}

/** Hardware back on Android only. iOS has no system back button. */
export async function bindAndroidBack(onBack: () => void, onExit: () => void): Promise<() => void> {
  if (!isNative() || nativePlatform() !== "android") return () => {};
  const { App } = await import("@capacitor/app");
  const handle = await App.addListener("backButton", ({ canGoBack }) => {
    const decision = androidBackDecision({
      platform: "android",
      path: window.location.pathname,
      canGoBack: Boolean(canGoBack),
    });
    if (decision === "exit") onExit();
    else if (decision === "back") onBack();
  });
  return () => {
    void handle.remove();
  };
}
