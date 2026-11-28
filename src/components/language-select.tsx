import { useEffect, useState } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { ChevronDown, Globe } from "lucide-react";
import { useFrCaPack } from "@/components/fr-ca-boot";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { activateLocale, isExtraLocale } from "@/lib/extra-copy";
import { applyDocumentLocale, languageMeta, shippedLanguages } from "@/lib/languages";
import { LOCALE_SYNC_KEY, readLocaleCookie, writeLocaleChoiceCookie } from "@/lib/locale-geo";
import { localeSwitchHref } from "@/lib/locale-path";
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

export function useLanguageChoice() {
  const setLocale = useAppStore((s) => s.setLocale);
  const { user, isPending } = useCurrentUserState();
  const [changing, setChanging] = useState(false);
  const [appliedLocale, setAppliedLocale] = useState<Locale | null>(null);

  async function choose(next: Locale) {
    setChanging(true);
    let navigating = false;
    try {
      if (isExtraLocale(next) && !await activateLocale(next)) return;
      if (!isExtraLocale(next)) void activateLocale(next);
      const dest = localeSwitchHref(window.location.pathname, window.location.search, next);
      writeLocaleChoiceCookie(next);
      setLocale(next, { lock: true });
      applyDocumentLocale(next);
      setAppliedLocale(next);
      if (user) {
        await saveMyLocale({ data: { locale: next } }).catch(queueLocaleSync);
      } else if (isPending) {
        queueLocaleSync();
      }
      if (dest) {
        window.location.assign(dest);
        navigating = true;
      }
    } finally {
      if (!navigating) {
        setAppliedLocale(null);
        setChanging(false);
      }
    }
  }

  return { choose, changing, appliedLocale };
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
  const frCa = useFrCaPack();
  const { choose, changing, appliedLocale } = useLanguageChoice();

  return (
    <label
      className={cn(
        "relative inline-flex items-center justify-center overflow-visible",
        pill && "h-11 gap-1.5 rounded-full border border-border bg-surface px-3 text-fg",
        compact ? "h-8" : "h-11 min-h-[44px] min-w-[7.25rem]",
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
        value={appliedLocale ?? locale}
        disabled={changing}
        onChange={(e) => {
          const next = e.target.value as Locale;
          if (a11yPass) setAnnounced(languageMeta(next).native);
          void choose(next);
        }}
        className={cn(
          "ke-lang-select w-full cursor-pointer touch-manipulation rounded-full border-0 bg-transparent text-center font-medium text-muted hover:text-fg",
          pill && "pr-5 text-left text-sm text-fg",
          compact
            ? "ke-header-chrome h-8 min-h-8 px-2.5 text-[11px] leading-none"
            : "h-11 min-h-[44px] px-3.5 text-[15px]",
        )}
        aria-label={t("language")}
      >
        {shippedLanguages().map((lang) => (
          <option key={lang.code} value={lang.code}>
            {frCa && lang.code === "fr" ? "Français (Canada)" : lang.native}
            {lang.code === "ar" ? (locale === "fr" ? " (bêta)" : " (beta)") : ""}
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
