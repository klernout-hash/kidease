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
import { useCopy } from "@/lib/use-copy";

/**
 * Website-only cookie banner. Hidden in the Capacitor native shell.
 * Essential = required cookies only. Allow = load PostHog + masked replay.
 */
export function CookieConsentBanner() {
  const { t } = useCopy();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!shouldShowAnalyticsConsentBanner()) return;
    return scheduleAnalyticsConsentBannerReveal(() => setOpen(true));
  }, []);

  function choose(value: "granted" | "denied") {
    writeAnalyticsConsent(value);
    if (value === "granted") startPostHog();
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
      className="ke-cookie-consent fixed inset-x-0 bottom-0 z-[60] px-[clamp(1rem,4vw,2rem)] py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] [[data-channel=app]_&]:bottom-[calc(5.25rem+env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto max-w-3xl rounded-xl bg-surface/95 p-3 shadow-lift ring-1 ring-border backdrop-blur-md">
        <div className="flex items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Cookie className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p id="ke-cookie-consent-title" className="text-xs font-semibold text-fg">
              {t("cookieConsentTitle")}
            </p>
            <p id="ke-cookie-consent-body" className="mt-0.5 text-[11px] leading-4 text-muted">
              {t("cookieConsentBody")}{" "}
              <Link to="/cookies" className="font-medium text-primary underline-offset-4 hover:underline">
                {t("cookies")}
              </Link>
              {" · "}
              <Link to="/privacy" className="font-medium text-primary underline-offset-4 hover:underline">
                {t("privacy")}
              </Link>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => choose("denied")}
              >
                {t("cookieConsentEssential")}
              </Button>
              <Button type="button" size="sm" onClick={() => choose("granted")}>
                {t("cookieConsentAllow")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
