import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  scheduleAnalyticsConsentBannerReveal,
  shouldShowAnalyticsConsentBanner,
  writeAnalyticsConsent,
} from "@/lib/analytics-consent";
import { applyPostHogRecordingGate, startPostHog } from "@/lib/posthog";
import { localePath } from "@/lib/locale-path";
import { useNativeHidesAdmin } from "@/lib/use-native-shell";
import { useCopy } from "@/lib/use-copy";

/**
 * Essential vs Allow. Website and the Capacitor shell both wait for a choice
 * before PostHog or native crash reports start. Essential = required cookies only.
 * Allow = load PostHog, and start Sentry inside the app.
 */
export function CookieConsentBanner() {
  const { t, locale } = useCopy();
  const native = useNativeHidesAdmin();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!shouldShowAnalyticsConsentBanner()) return;
    return scheduleAnalyticsConsentBannerReveal(() => setOpen(true));
  }, []);

  useEffect(() => {
    if (!open) return;
    document.documentElement.dataset.cookieBanner = "open";
    if (native) document.documentElement.dataset.nativePrompt = "open";
    return () => {
      delete document.documentElement.dataset.cookieBanner;
      if (document.documentElement.dataset.nativePrompt === "open") {
        delete document.documentElement.dataset.nativePrompt;
      }
    };
  }, [native, open]);

  function choose(value: "granted" | "denied") {
    writeAnalyticsConsent(value);
    if (value === "granted") {
      startPostHog();
      // instrument.client.ts owns the Sentry import. A static import here
      // is denied in the server build.
      window.dispatchEvent(new Event("kidease:analytics-granted"));
    }
    applyPostHogRecordingGate();
    setOpen(false);
  }

  if (!open) return null;

  return (
    <aside
      data-ke="cookie-consent"
      role="region"
      aria-labelledby="ke-cookie-consent-title"
      aria-describedby="ke-cookie-consent-body"
      data-compact={native ? "native" : undefined}
      className="ke-cookie-consent pointer-events-none fixed inset-x-0 bottom-0 z-50 px-[clamp(1rem,4vw,2rem)] py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] [[data-channel=app]_&]:bottom-[calc(5.25rem+env(safe-area-inset-bottom))]"
    >
      <div className="ke-cookie-consent-panel pointer-events-auto mx-auto max-w-3xl rounded-xl bg-surface/95 px-3 py-2.5 shadow-lift ring-1 ring-border backdrop-blur-md">
        <div className="flex items-start gap-2">
          <span className="hidden size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary sm:grid">
            <Cookie className="size-3.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p id="ke-cookie-consent-title" className="text-xs font-semibold leading-4 text-fg">
              {t("cookieConsentTitle")}
            </p>
            <p id="ke-cookie-consent-body" className="sr-only">
              {t("cookieConsentBody")}
            </p>
            <p className="mt-0.5 text-[11px] leading-4 text-muted [overflow-wrap:normal]">
              {t("cookieConsentBannerLead")}{" "}
              <Link to={localePath("/cookies", locale)} className="font-medium text-primary underline-offset-4 hover:underline">
                {t("cookies")}
              </Link>
              {" · "}
              <Link to={localePath("/privacy", locale)} className="font-medium text-primary underline-offset-4 hover:underline">
                {t("privacy")}
              </Link>
            </p>
            {/* Nothing is pre-selected. Allow is the brand button. Essential is one tap, same as Allow. */}
            <div className="mt-3 flex flex-col gap-2">
              <Button
                type="button"
                variant="primary"
                data-ke="cookie-allow"
                className="h-auto min-h-14 w-full whitespace-normal px-4 py-2.5 text-center text-base leading-snug [overflow-wrap:normal]"
                onClick={() => choose("granted")}
              >
                {t("cookieConsentAllow")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                data-ke="cookie-essential"
                className="h-auto min-h-11 w-full whitespace-normal px-4 py-2 text-center leading-snug [overflow-wrap:normal]"
                onClick={() => choose("denied")}
              >
                {t("cookieConsentEssential")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
