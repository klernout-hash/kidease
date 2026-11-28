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
  const [tabsBottom, setTabsBottom] = useState(0);
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

  // N-39: a slim bar pinned above the bottom tabs. The page reserves the bar's
  // height (--ke-cookie-h, see styles.css), so the last cards are never hidden.
  useEffect(() => {
    const node = panel.current;
    if (!visible || !node) return;
    const root = document.documentElement;
    const measure = () => {
      const tabs = document.querySelector<HTMLElement>('[data-ke="app-tab-bar"]');
      const box = tabs?.getBoundingClientRect();
      // A bottom bar is wider than tall; the tablet side rail is not, and needs no offset.
      const atBottom = box && box.height > 0 && box.width > box.height && box.bottom >= window.innerHeight - 1;
      setTabsBottom(atBottom ? Math.round(box.height) : 0);
      root.style.setProperty("--ke-cookie-h", `${Math.ceil(node.getBoundingClientRect().height)}px`);
    };
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty("--ke-cookie-h");
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !reopened) return;
    panel.current?.focus();
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
      style={{ bottom: tabsBottom, paddingBottom: tabsBottom ? "0.375rem" : undefined }}
      className="ke-cookie-consent ke-safe-x fixed inset-x-0 z-40 [--ke-pad-x:0.75rem] pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5"
    >
      <div className="ke-cookie-consent-panel mx-auto flex max-w-[48rem] flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface px-3 py-1 shadow-card ring-1 ring-border">
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
