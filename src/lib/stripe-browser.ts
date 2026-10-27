/** Load Stripe.js in the browser only. No secret key. No npm package. */

type StripeElements = {
  create: (type: "payment", options?: Record<string, unknown>) => { mount: (el: HTMLElement) => void; unmount: () => void };
  submit: () => Promise<{ error?: { message?: string } }>;
};

type StripeClient = {
  elements: (options: { clientSecret: string; appearance?: Record<string, unknown> }) => StripeElements;
  confirmSetup: (options: {
    elements: StripeElements;
    redirect: "if_required";
    confirmParams?: { return_url?: string };
  }) => Promise<{ error?: { message?: string } }>;
  confirmPayment: (options: {
    clientSecret: string;
    redirect: "if_required";
    confirmParams: { return_url: string; payment_method: string };
  }) => Promise<{ error?: { message?: string } }>;
};

type StripeFactory = (key: string) => StripeClient;

type ConnectInstance = {
  create: (component: "account-onboarding" | "payouts") => HTMLElement;
};

type ConnectFactory = {
  init: (options: {
    publishableKey: string;
    fetchClientSecret: () => Promise<string>;
    appearance?: Record<string, unknown>;
  }) => ConnectInstance;
};

declare global {
  interface Window {
    Stripe?: StripeFactory;
    StripeConnect?: ConnectFactory;
  }
}

function loadScript(src: string): Promise<void> {
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      if (existing.getAttribute("data-loaded") === "1") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load payments")), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.setAttribute("data-loaded", "1");
      resolve();
    };
    script.onerror = () => reject(new Error("Could not load payments"));
    document.head.appendChild(script);
  });
}

export async function loadStripeClient(publishableKey: string): Promise<StripeClient | null> {
  const key = publishableKey.trim();
  if (!key.startsWith("pk_test_") || typeof window === "undefined") return null;
  await loadScript("https://js.stripe.com/v3/");
  if (!window.Stripe) return null;
  return window.Stripe(key);
}

export async function loadConnectInstance(publishableKey: string, fetchClientSecret: () => Promise<string>): Promise<ConnectInstance | null> {
  const key = publishableKey.trim();
  if (!key.startsWith("pk_test_") || typeof window === "undefined") return null;
  await loadScript("https://connect-js.stripe.com/v1.0/connect.js");
  if (!window.StripeConnect) return null;
  return window.StripeConnect.init({
    publishableKey: key,
    fetchClientSecret,
    appearance: { overlays: "dialog", variables: { colorPrimary: "#1a3790" } },
  });
}

export function paymentElementOptions() {
  return {
    wallets: {
      applePay: "auto",
      googlePay: "auto",
    },
    fields: {
      billingDetails: {
        address: { country: "never", postalCode: "auto" },
      },
    },
    defaultValues: {
      billingDetails: { address: { country: "CA" } },
    },
  } as Record<string, unknown>;
}
