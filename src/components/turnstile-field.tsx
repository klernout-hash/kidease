import { useEffect, useRef, useState } from "react";
import { getTurnstileSiteKey } from "@/lib/server/turnstile";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
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

export function TurnstileField({
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
    void getTurnstileSiteKey()
      .then((key) => {
        if (!cancelled) setSiteKey(key);
      })
      .catch(() => {
        if (!cancelled) setSiteKey(null);
      });
    return () => {
      cancelled = true;
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
    void loadTurnstile().then((api) => {
      if (cancelled || !api || !host.current) return;
      if (widgetId.current) {
        try {
          api.reset(widgetId.current);
        } catch {
          /* widget already gone */
        }
        onTokenRef.current("");
        return;
      }
      widgetId.current = api.render(host.current, {
        sitekey: siteKey,
        callback: (token) => {
          setLoadError(null);
          onTokenRef.current(token);
        },
        "expired-callback": () => onTokenRef.current(""),
        "error-callback": () => {
          onTokenRef.current("");
          setLoadError("Security check failed. Refresh and try again.");
        },
      });
    }).then(() => {
      if (!cancelled && siteKey && !window.turnstile && !widgetId.current) {
        setLoadError("Security check could not load. Refresh the page.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [siteKey, resetSignal]);

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

  if (siteKey === undefined || siteKey === null) return null;
  return (
    <div>
      <div ref={host} className="cf-turnstile" />
      {loadError ? <p className="mt-2 text-sm text-danger">{loadError}</p> : null}
    </div>
  );
}

export function useTurnstileToken() {
  const [token, setToken] = useState("");
  const [resetSignal, setResetSignal] = useState(0);
  const [required, setRequired] = useState(false);
  const reset = () => {
    setToken("");
    setResetSignal((n) => n + 1);
  };
  return { token, setToken, onToken: setToken, reset, resetSignal, required, onRequired: setRequired };
}
