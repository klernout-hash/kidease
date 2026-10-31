import { useEffect, useState } from "react";
import { useRouteContext, useRouterState } from "@tanstack/react-router";
import { ChevronDown, Globe } from "lucide-react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { activateLocale, isExtraLocale } from "@/lib/extra-copy";
import { applyDocumentLocale, languageMeta, shippedLanguages } from "@/lib/languages";
import { LOCALE_SYNC_KEY, readLocaleCookie, writeLocaleChoiceCookie } from "@/lib/locale-geo";
import { localeSwitchPath } from "@/lib/locale-path";
import { saveMyLocale } from "@/lib/server/account-prefs";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/types";

function queueLocaleSync() {
  try {
    sessionStorage.setItem(LOCALE_SYNC_KEY, "1");
  } catch {
    /* private mode */
  }
}

/** If a language pick happened before the session was ready, save it once. */
export function LocaleChoiceSync() {
  const { user } = useCurrentUserState();

  useEffect(() => {
    if (!user) return;
    let queued = false;
    try {
      queued = sessionStorage.getItem(LOCALE_SYNC_KEY) === "1";
    } catch {
      return;
    }
    if (!queued) return;
    const locale = readLocaleCookie(document.cookie);
    if (!locale) return;
    void saveMyLocale({ data: { locale } })
      .then(() => {
        try {
          sessionStorage.removeItem(LOCALE_SYNC_KEY);
        } catch {
          /* ignore */
        }
      })
      .catch(() => undefined);
  }, [user]);

  return null;
}

export function LanguageSelect({
  className = "",
  compact = false,
  pill = false,
}: {
  className?: string;
  compact?: boolean;
  /** Bordered control with a globe and a visible chevron. */
  pill?: boolean;
}) {
  const { t, locale } = useCopy();
  const a11yPass = useRouteContext({ from: "__root__", select: (s) => Boolean(s.a11yPass) });
  const [announced, setAnnounced] = useState<string | null>(null);
  const setLocale = useAppStore((s) => s.setLocale);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isPending } = useCurrentUserState();

  return (
    <label
      className={cn(
        "relative inline-flex items-center justify-center overflow-visible",
        pill && "h-11 gap-1.5 rounded-full border border-border bg-surface px-3 text-fg",
        compact ? "h-8" : "h-11 min-w-[7.25rem]",
        className,
      )}
    >
      {pill ? <Globe className="size-4 shrink-0 text-fg" aria-hidden /> : null}
      <span className="sr-only">{t("language")}</span>
      {a11yPass ? (
        <span className="sr-only" aria-live="polite">
          {announced}
        </span>
      ) : null}
      <select
        value={locale}
        onChange={(e) => {
          const next = e.target.value as Locale;
          if (a11yPass) setAnnounced(languageMeta(next).native);
          const apply = () => {
            const dest = localeSwitchPath(pathname, next);
            writeLocaleChoiceCookie(next);
            setLocale(next, { lock: true });
            applyDocumentLocale(next);
            const finish = () => {
              if (dest) window.location.assign(dest);
            };
            if (!user) {
              if (isPending) queueLocaleSync();
              finish();
              return;
            }
            void saveMyLocale({ data: { locale: next } })
              .catch(() => queueLocaleSync())
              .finally(finish);
          };
          // English and French are already in memory. Extra languages wait
          // for their pack so the page does not flash English strings.
          if (!isExtraLocale(next)) {
            void activateLocale(next);
            apply();
            return;
          }
          void activateLocale(next).then((ok) => {
            if (ok) apply();
          });
        }}
        className={cn(
          "ke-lang-select w-full cursor-pointer touch-manipulation rounded-full border-0 bg-transparent text-center font-medium text-muted hover:text-fg",
          pill && "pr-5 text-left text-sm text-fg",
          compact
            ? "ke-header-chrome h-8 min-h-8 px-2.5 text-[11px] leading-none"
            : "h-11 min-h-11 px-3.5 text-[15px]",
        )}
        aria-label={t("language")}
      >
        {shippedLanguages().map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.native}
          </option>
        ))}
      </select>
      <ChevronDown
        className={cn(
          "pointer-events-none absolute text-fg",
          compact ? "right-0.5 size-3" : "right-1.5 size-4",
          pill && "right-2.5",
        )}
        aria-hidden
      />
    </label>
  );
}
