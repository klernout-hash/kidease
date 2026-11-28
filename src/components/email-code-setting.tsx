import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getEmailCodePreference, setParentEmailCode } from "@/lib/server/second-factor";
import { useCopy } from "@/lib/use-copy";
import {
  formatDeadlineDay,
  HEALTH_BANNER_HIDDEN_KEY,
  healthBannerCanHide,
  healthBannerMode,
} from "@/lib/second-factor-policy";

function readBannerHidden(): string | null {
  try {
    return window.localStorage.getItem(HEALTH_BANNER_HIDDEN_KEY);
  } catch {
    return null;
  }
}

function writeBannerHidden(day: string | null): void {
  try {
    if (day) window.localStorage.setItem(HEALTH_BANNER_HIDDEN_KEY, day);
    else window.localStorage.removeItem(HEALTH_BANNER_HIDDEN_KEY);
  } catch {
    /* private mode: the choice lasts for this visit only */
  }
}

export function EmailCodeSetting() {
  const { t } = useCopy();
  const [optedIn, setOptedIn] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getEmailCodePreference()
      .then((row) => {
        if (!cancelled) setOptedIn(row.optedIn);
      })
      .catch(() => {
        if (!cancelled) setNote(t("accountPasswordFailed"));
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function toggle() {
    setBusy(true);
    setNote(null);
    try {
      const next = !optedIn;
      const saved = await setParentEmailCode({ data: { enabled: next } });
      setOptedIn(saved.optedIn);
      setNote(saved.optedIn ? t("emailCodeSavedOn") : t("emailCodeSavedOff"));
    } catch {
      setNote(t("accountPasswordFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 space-y-3 rounded-xl bg-surface p-5 shadow-card ring-1 ring-border" data-ke="email-code-setting">
      <h2 className="font-display text-lg tracking-[-0.02em]">{t("emailCodeTitle")}</h2>
      <p className="text-[13px] text-muted">{t("emailCodeLead")}</p>
      <Button type="button" variant={optedIn ? "outline" : "primary"} className="min-h-11 w-full" disabled={!ready || busy} onClick={() => void toggle()}>
        {optedIn ? t("emailCodeOff") : t("emailCodeOn")}
      </Button>
      {optedIn ? (
        <Button type="button" variant="outline" className="min-h-11 w-full" asChild>
          <Link to="/verify-2fa" search={{ next: "/account" }}>
            {t("healthCodeAction")}
          </Link>
        </Button>
      ) : null}
      {note ? <p className="text-sm">{note}</p> : null}
    </section>
  );
}

export function HealthSecondFactorBanner() {
  const { t, locale } = useCopy();
  const [state, setState] = useState<{
    prompt: boolean;
    locked: boolean;
    deadlineDay: string | null;
    hiddenFor: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getEmailCodePreference()
      .then((row) => {
        if (!cancelled) {
          setState({
            prompt: row.providerPrompt,
            locked: row.providerLocked,
            deadlineDay: row.graceEndsDay ?? null,
            hiddenFor: readBannerHidden(),
          });
        }
      })
      .catch(() => {
        if (!cancelled) setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return null;
  const mode = healthBannerMode(state);
  if (mode === "none") return null;
  // N-25: the server picks the day; every device shows that same day.
  const date = formatDeadlineDay(state.deadlineDay, locale);
  const setHidden = (day: string | null) => {
    writeBannerHidden(day);
    setState((prev) => (prev ? { ...prev, hiddenFor: day } : prev));
  };

  if (mode === "folded") {
    return (
      <div
        className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface px-4 py-2 text-sm ring-1 ring-border"
        data-ke="health-second-factor-folded"
      >
        <span>{t("healthCodeFolded").replace("{date}", date)}</span>
        <Link
          to="/verify-2fa"
          search={{ next: "/provider" }}
          className="inline-flex min-h-11 items-center font-medium underline underline-offset-4"
        >
          {t("healthCodeAction")}
        </Link>
        <button
          type="button"
          className="inline-flex min-h-11 touch-manipulation items-center text-muted underline underline-offset-4"
          data-ke="health-second-factor-show"
          onClick={() => setHidden(null)}
        >
          {t("healthCodeShow")}
        </button>
      </div>
    );
  }

  const canHide = healthBannerCanHide(state);
  const message = state.locked || !date ? t("healthCodeLocked") : t("healthCodePrompt").replace("{date}", date);
  return (
    <section className="mb-4 rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="health-second-factor">
      <p className="text-sm">{message}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" className="min-h-11" asChild>
          <Link to="/verify-2fa" search={{ next: "/provider" }}>
            {t("healthCodeAction")}
          </Link>
        </Button>
        {canHide ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            data-ke="health-second-factor-hide"
            onClick={() => setHidden(state.deadlineDay)}
          >
            {t("healthCodeHide")}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
