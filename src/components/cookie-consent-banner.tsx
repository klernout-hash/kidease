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
import { OPEN_COOKIE_SETTINGS_EVENT } from "@/lib/prompt-manager";
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

  // Footer "Cookie settings" reopens the bar. The saved choice otherwise lasts forever.
  useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, reopen);
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

  // Slim bar: pinned above the tab bar (safe area) on phones, bottom-centre max 560px on desktop.
  return (
    <aside
      data-ke="cookie-consent"
      role="region"
      aria-labelledby="ke-cookie-consent-title"
      aria-describedby="ke-cookie-consent-body"
      data-compact={native ? "native" : undefined}
      className="ke-cookie-consent ke-bottom-prompt pointer-events-none fixed inset-x-0 z-[55] px-3 pb-2 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] md:bottom-3 md:pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      <div className="ke-cookie-consent-panel pointer-events-auto mx-auto flex max-h-[max(64px,4.5rem,calc(100dvh-14rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] max-w-[560px] flex-wrap items-center gap-[8px] overflow-y-auto overscroll-contain rounded-xl bg-surface/95 px-3 py-2 shadow-lift ring-1 ring-border backdrop-blur-md">
        <span className="hidden size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary sm:grid">
          <Cookie className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <p id="ke-cookie-consent-title" className="text-xs font-semibold leading-4 text-fg">
            {t("cookieConsentTitle")}
          </p>
          <p id="ke-cookie-consent-body" className="sr-only">
            {t("cookieConsentBody")}
          </p>
          <p className="flex flex-wrap items-center gap-x-[8px] text-[11px] leading-4 text-muted">
            <span className="hidden sm:inline">{t("cookieConsentBannerLead")} </span>
            <Link to={localePath("/cookies", locale)} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center font-medium text-primary underline-offset-4 hover:underline">
              {t("cookies")}
            </Link>
            <span aria-hidden>·</span>
            <Link to={localePath("/privacy", locale)} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center font-medium text-primary underline-offset-4 hover:underline">
              {t("privacy")}
            </Link>
          </p>
        </div>
        {/* Equal weight: same size, side by side. Nothing pre-selected. */}
        <div className="flex w-full flex-wrap justify-end gap-[8px] sm:w-auto sm:shrink-0">
          <Button type="button" role="button" variant="secondary" data-ke="cookie-essential" className="px-3 text-sm" onClick={() => choose("denied")}>
            {t("cookieConsentEssential")}
          </Button>
          <Button type="button" role="button" variant="secondary" data-ke="cookie-allow" className="px-3 text-sm" onClick={() => choose("granted")}>
            {t("cookieConsentAllowShort")}
          </Button>
        </div>
      </div>
    </aside>
  );
}
