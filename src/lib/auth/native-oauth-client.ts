import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { registerPlugin } from "@capacitor/core";
import {
  isNativeOAuthCancel,
  nativeHandoffPath,
  parseNativeAuthFinish,
  type NativeAuthFinish,
} from "./native-oauth";

type AuthSessionPlugin = {
  start(options: { url: string; callbackScheme: string }): Promise<{ url?: string }>;
};

const AuthSession = registerPlugin<AuthSessionPlugin>("AuthSession");

let finishing = false;

/** Load the handoff (or the next page) inside this webview and close the sheet. */
export async function finishNativeAuthInWebView(parsed: NativeAuthFinish): Promise<void> {
  if (finishing) return;
  finishing = true;
  try {
    try {
      await Browser.close();
    } catch {
      /* sheet already closed */
    }
    const next = nativeHandoffPath(parsed);
    const here = `${window.location.pathname}${window.location.search}`;
    if (here !== next) window.location.assign(next);
  } finally {
    window.setTimeout(() => {
      finishing = false;
    }, 1500);
  }
}

/**
 * Listen for ca.kidease.app://auth/finish. Installed once at boot so a Custom
 * Tab or Safari sheet can return after the page that started it is gone.
 */
export async function bindNativeOAuthReturn(): Promise<() => void> {
  const handle = await App.addListener("appUrlOpen", (event) => {
    const parsed = parseNativeAuthFinish(event.url);
    if (!parsed) return;
    void finishNativeAuthInWebView(parsed);
  });
  return () => {
    void handle.remove();
  };
}

/**
 * Prefer the iOS auth-session plugin (new binary). Fall back to Capacitor
 * Browser, which is already in the shipped shell: SFSafariViewController on
 * iOS and Custom Tabs on Android. Never navigate the webview to Google.
 */
export async function openNativeOAuthSheet(providerUrl: string): Promise<void> {
  try {
    const result = await AuthSession.start({ url: providerUrl, callbackScheme: "ca.kidease.app" });
    const parsed = parseNativeAuthFinish(result?.url);
    if (parsed) {
      await finishNativeAuthInWebView(parsed);
      return;
    }
  } catch (err) {
    if (isNativeOAuthCancel(err)) throw new Error("Sign-in was cancelled");
    const message = err instanceof Error ? err.message : String(err || "");
    if (!/not implemented|unimplemented|plugin is not implemented|does not have/i.test(message)) {
      throw err instanceof Error ? err : new Error("Could not open sign-in");
    }
  }
  await Browser.open({ url: providerUrl, presentationStyle: "fullscreen" });
}
