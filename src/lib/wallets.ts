/**
 * Browser / Capacitor wallet detection for honest Pay UI.
 *
 * KidEase does not load Stripe.js. Availability is the same signal Stripe.js
 * uses under the hood: ApplePaySession and the Payment Request API.
 * Capacitor WKWebView / Android WebView usually cannot present wallets —
 * hosted Checkout must open in the system browser there.
 */

import { isNative, nativePlatform, type NativePlatform } from "./native.ts";

export type WalletAvailability = {
  applePay: boolean;
  googlePay: boolean;
  /** Capacitor iOS/Android shell — wallets belong in Safari / Chrome Custom Tabs. */
  nativeWebView: boolean;
  paymentRequestApi: boolean;
};

type ApplePayWindow = Window & {
  ApplePaySession?: { canMakePayments?: () => boolean };
};

export type DetectWalletsInput = {
  native?: boolean;
  platform?: NativePlatform;
  applePayCapable?: boolean;
  paymentRequest?: boolean;
  userAgent?: string;
};

export function detectBrowserWallets(input: DetectWalletsInput = {}): WalletAvailability {
  const native = input.native ?? (typeof window !== "undefined" && isNative());
  const platform = input.platform ?? (typeof window !== "undefined" ? nativePlatform() : "web");
  const ua =
    input.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");

  const applePayCapable =
    input.applePayCapable ??
    (typeof window !== "undefined" &&
      typeof (window as ApplePayWindow).ApplePaySession?.canMakePayments === "function" &&
      (window as ApplePayWindow).ApplePaySession!.canMakePayments!() === true);

  const paymentRequest =
    input.paymentRequest ?? (typeof window !== "undefined" && "PaymentRequest" in window);

  const android = platform === "android" || /Android/i.test(ua);
  const chromeLike = /Chrome|Chromium|CriOS|Edg\//i.test(ua);
  const safariWithoutChrome = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg\//i.test(ua);

  // Google Pay: Chrome / Android Payment Request — not Safari, not the native WebView.
  const googlePay = Boolean(paymentRequest && !native && (android || (chromeLike && !safariWithoutChrome)));

  return {
    applePay: Boolean(applePayCapable) && !native,
    googlePay,
    nativeWebView: Boolean(native),
    paymentRequestApi: Boolean(paymentRequest),
  };
}

export function visibleWalletLabels(wallets: WalletAvailability): Array<"card" | "apple" | "google"> {
  const labels: Array<"card" | "apple" | "google"> = ["card"];
  if (wallets.applePay) labels.push("apple");
  if (wallets.googlePay) labels.push("google");
  return labels;
}

/** Open hosted Stripe Checkout. Native apps use the system browser so wallets can appear. */
export async function openStripeCheckout(url: string): Promise<void> {
  const href = String(url || "").trim();
  if (!href) throw new Error("Pay link was not ready.");
  if (typeof window !== "undefined" && isNative()) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: href });
      return;
    } catch {
      /* fall through to same-webview navigation */
    }
  }
  if (typeof window !== "undefined") window.location.assign(href);
}
