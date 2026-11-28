import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ANALYTICS_CONSENT_KEY,
  restoreNativeAnalyticsConsent,
  scheduleAnalyticsConsentBannerReveal,
  shouldShowAnalyticsConsentBanner,
  writeAnalyticsConsent,
} from "@/lib/analytics-consent";
import { applyPostHogRecordingGate, startPostHog } from "@/lib/posthog";
import { localePath } from "@/lib/locale-path";
import { OPEN_COOKIE_SETTINGS_EVENT } from "@/lib/prompt-manager";
import { useCopy } from "@/lib/use-copy";

const AUTH_PAGE = /^\/(?:fr\/)?(?:login|signup|parent\/signup|verify-2fa|forgot-password|reset-password)\/?$/;

/**
 * Essential vs Allow. Website and the Capacitor shell both wait for a choice
 * before PostHog or native crash reports start. Essential = required cookies only.
 * Allow = load PostHog, and start Sentry inside the app.
 */
export function CookieConsentBanner() {
  const { t, locale } = useCopy();
  const panel = useRef<HTMLElement>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [reopened, setReopened] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // EM4: on phones the bar covered Password and Sign in. Sign-in pages wait
  // for the choice until the next page. Analytics stay off until then.
  const authPage = AUTH_PAGE.test(pathname);
  const visible = open && (reopened || !authPage);

  useEffect(() => {
    let cancelled = false;
    let cancelReveal: (() => void) | undefined;
    void (async () => {
      const preferences = await nativePreferences().catch(() => null);
      if (cancelled) return;
      const wasUnset = shouldShowAnalyticsConsentBanner();
      const restored = await (preferences ? restoreNativeAnalyticsConsent(preferences).catch(() => null) : null);
      if (cancelled) return;
      if (wasUnset && restored === "granted") applyChoice();
      if (restored == null ? shouldShowAnalyticsConsentBanner() : restored === "unset") {
        cancelReveal = scheduleAnalyticsConsentBannerReveal(() => setOpen(true));
      }
    })();
    return () => {
      cancelled = true;
      cancelReveal?.();
    };
  }, []);

  // Footer "Cookie settings" reopens the bar. The saved choice otherwise lasts forever.
  useEffect(() => {
    const reopen = () => {
      setReopened(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, reopen);
  }, []);

  useEffect(() => {
    if (!visible) return;
    document.documentElement.dataset.cookieBanner = "open";
    return () => {
      delete document.documentElement.dataset.cookieBanner;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !reopened) return;
    panel.current?.focus();
    panel.current?.scrollIntoView({ block: "start" });
  }, [visible, reopened]);

  async function choose(value: "granted" | "denied") {
    setSaving(true);
    writeAnalyticsConsent(value);
    applyChoice(value);
    try {
      const preferences = await nativePreferences();
      await preferences?.set({ key: ANALYTICS_CONSENT_KEY, value });
    } catch {
      // The WebView copy remains available if the native plugin fails.
    } finally {
      setSaving(false);
      setOpen(false);
      setReopened(false);
    }
  }

  if (!visible) return null;

  return (
    <aside
      data-ke="cookie-consent"
      role="region"
      aria-labelledby="ke-cookie-consent-title"
      aria-describedby="ke-cookie-consent-body"
      ref={panel}
      tabIndex={-1}
      className="ke-cookie-consent ke-safe-x shrink-0 [--ke-pad-x:0.75rem] pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]"
    >
      <div className="ke-cookie-consent-panel mx-auto flex max-w-[35rem] flex-wrap items-center gap-2 rounded-xl bg-surface px-3 py-2 ring-1 ring-border">
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
          <Button type="button" role="button" variant="secondary" data-ke="cookie-essential" className="px-3 text-sm" disabled={saving} onClick={() => void choose("denied")}>
            {t("cookieConsentEssential")}
          </Button>
          <Button type="button" role="button" variant="secondary" data-ke="cookie-allow" className="px-3 text-sm" disabled={saving} onClick={() => void choose("granted")}>
            {t("cookieConsentAllowShort")}
          </Button>
        </div>
      </div>
    </aside>
  );
}


async function nativePreferences() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  const { Preferences } = await import("@capacitor/preferences");
  return Preferences;
}

function applyChoice(value: "granted" | "denied" = "granted") {
  if (value === "granted") {
    startPostHog();
    window.dispatchEvent(new Event("kidease:analytics-granted"));
  }
  applyPostHogRecordingGate();
}
