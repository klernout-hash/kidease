import { memo, useEffect, useRef, useState } from "react";
import { getTurnstileSiteKey } from "@/lib/server/turnstile";
import { beginTurnstileReset, coalesceTurnstileToken, readTurnstileResponseValue } from "@/lib/turnstile-widget";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "timeout-callback"?: () => void;
      "error-callback"?: () => void;
      retry?: "auto" | "never";
      "refresh-expired"?: "auto" | "manual" | "never";
      "response-field"?: boolean;
      "response-field-name"?: string;
      appearance?: "always" | "execute" | "interaction-only";
      theme?: "auto" | "light" | "dark";
      size?: "normal" | "flexible" | "compact";
    },
  ) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi | null> | null = null;

function loadTurnstile(): Promise<TurnstileApi | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-kidease-turnstile]");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.turnstile ?? null), { once: true });
      existing.addEventListener("error", () => resolve(null), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.kideaseTurnstile = "1";
    script.onload = () => resolve(window.turnstile ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return scriptPromise;
}

function resetWidget(widgetId: string | null, onToken: (token: string) => void) {
  const api = typeof window !== "undefined" ? window.turnstile : undefined;
  // Clear React state first. reset() may synchronously call the success
  // callback; wiping the token afterwards leaves Success on screen and the
  // sign-in button disabled.
  beginTurnstileReset(onToken, () => {
    if (!widgetId || !api) return;
    try {
      api.reset(widgetId);
    } catch {
      /* widget already gone */
    }
  });
}

export const TurnstileField = memo(function TurnstileField({
  onToken,
  resetSignal = 0,
  onRequired,
  onLoadError,
}: {
  onToken: (token: string) => void;
  resetSignal?: number;
  onRequired?: (required: boolean) => void;
  onLoadError?: (message: string | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const [siteKey, setSiteKey] = useState<string | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  onTokenRef.current = onToken;

  useEffect(() => {
    let cancelled = false;
    const start = () => {
      void getTurnstileSiteKey()
        .then((key) => {
          if (!cancelled) setSiteKey(key);
        })
        .catch(() => {
          if (!cancelled) setSiteKey(null);
        });
    };
    const ric = typeof requestIdleCallback === "function" ? requestIdleCallback : null;
    const id = ric ? ric(start, { timeout: 1500 }) : window.setTimeout(start, 0);
    return () => {
      cancelled = true;
      if (ric) cancelIdleCallback(id);
      else window.clearTimeout(id);
    };
  }, []);

  useEffect(() => {
    onRequired?.(Boolean(siteKey));
  }, [siteKey, onRequired]);

  useEffect(() => {
    onLoadError?.(loadError);
  }, [loadError, onLoadError]);

  useEffect(() => {
    if (!siteKey || !host.current) return;
    let cancelled = false;
    void loadTurnstile()
      .then((api) => {
        if (cancelled || !api || !host.current || widgetId.current) return;
        const narrow =
          typeof window !== "undefined" &&
          typeof window.matchMedia === "function" &&
          window.matchMedia("(max-width: 399px)").matches;
        widgetId.current = api.render(host.current, {
          sitekey: siteKey,
          size: narrow ? "compact" : "flexible",
          // Managed/checkbox must stay visible so parents and daycares see
          // Cloudflare branding. interaction-only hid the widget on most logins.
          appearance: "always",
          theme: "auto",
          retry: "auto",
          "refresh-expired": "auto",
          "response-field": true,
          "response-field-name": "cf-turnstile-response",
          callback: (token) => {
            setLoadError(null);
            onTokenRef.current(token);
          },
          "expired-callback": () => {
            onTokenRef.current("");
            setLoadError("Security check expired. Complete it again, then try once.");
          },
          "timeout-callback": () => {
            onTokenRef.current("");
            setLoadError("Security check expired. Complete it again, then try once.");
          },
          "error-callback": () => {
            onTokenRef.current("");
            setLoadError("Security check failed. Refresh and try again.");
          },
        });
      })
      .then(() => {
        if (!cancelled && siteKey && !window.turnstile && !widgetId.current) {
          setLoadError("Security check could not load. Refresh the page.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [siteKey]);

  useEffect(() => {
    if (!resetSignal) return;
    resetWidget(widgetId.current, (token) => onTokenRef.current(token));
  }, [resetSignal]);

  useEffect(() => {
    const onPageShow = (event: Event) => {
      const persisted = "persisted" in event && Boolean((event as PageTransitionEvent).persisted);
      if (!persisted) return;
      resetWidget(widgetId.current, (token) => onTokenRef.current(token));
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    return () => {
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* widget already gone */
        }
      }
      widgetId.current = null;
    };
  }, []);

  // Setting input.value does not notify React. Poll the hidden field so a
  // Success checkbox still enables Sign in when the callback never fires
  // (implicit api.js, or a reset that raced the callback).
  useEffect(() => {
    if (!siteKey) return;
    const publish = () => {
      const live = readTurnstileResponseValue(host.current);
      if (live) onTokenRef.current(live);
    };
    const id = window.setInterval(publish, 300);
    publish();
    return () => window.clearInterval(id);
  }, [siteKey]);

  if (siteKey === undefined || siteKey === null) return null;
  return (
    <div className="min-h-[65px] max-w-full overflow-x-hidden" data-ke="turnstile">
      {/* No cf-turnstile class: implicit api.js auto-renders that class
          without our callback, so Success never enables the button. */}
      <div ref={host} className="max-w-full" data-ke-turnstile-host="" />
      {loadError ? <p className="mt-2 text-sm text-danger">{loadError}</p> : null}
    </div>
  );
});

export function useTurnstileToken() {
  const [token, setToken] = useState("");
  const [resetSignal, setResetSignal] = useState(0);
  const [required, setRequired] = useState(false);
  const reset = () => {
    setToken("");
    setResetSignal((n) => n + 1);
  };
  /** Capture the current token and remint so a retry cannot reuse it. */
  const takeChallenge = () => {
    const live = typeof document !== "undefined" ? readTurnstileResponseValue(document) : "";
    const challenge = coalesceTurnstileToken(token, live);
    if (challenge) reset();
    return challenge;
  };
  return { token, setToken, onToken: setToken, reset, takeChallenge, resetSignal, required, onRequired: setRequired };
}
