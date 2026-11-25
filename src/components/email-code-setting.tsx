import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getEmailCodePreference, setParentEmailCode } from "@/lib/server/second-factor";
import { useCopy } from "@/lib/use-copy";
import {
  HEALTH_BANNER_SNOOZE_KEY,
  healthBannerCanSnooze,
  healthBannerVisible,
} from "@/lib/second-factor-policy";

function readBannerSnooze(): number | null {
  try {
    const raw = window.localStorage.getItem(HEALTH_BANNER_SNOOZE_KEY);
    const at = raw ? Number(raw) : NaN;
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

function writeBannerSnooze(at: number): void {
  try {
    window.localStorage.setItem(HEALTH_BANNER_SNOOZE_KEY, String(at));
  } catch {
    /* private mode: the banner hides for this visit only */
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
    graceEndsAt: number | null;
    snoozedAt: number | null;
    checkedAt: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getEmailCodePreference()
      .then((row) => {
        if (!cancelled) {
          setState({
            prompt: row.providerPrompt,
            locked: row.providerLocked,
            graceEndsAt: row.graceEndsAt,
            snoozedAt: readBannerSnooze(),
            checkedAt: Date.now(),
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

  if (!state?.prompt) return null;
  if (!healthBannerVisible({ prompt: state.prompt, locked: state.locked, snoozedAt: state.snoozedAt, now: state.checkedAt })) {
    return null;
  }
  const canSnooze = healthBannerCanSnooze({ prompt: state.prompt, locked: state.locked });
  const date = state.graceEndsAt
    ? new Date(state.graceEndsAt).toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { month: "long", day: "numeric" })
    : "";
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
        {canSnooze ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            data-ke="health-second-factor-snooze"
            onClick={() => {
              const at = Date.now();
              writeBannerSnooze(at);
              setState((prev) => (prev ? { ...prev, snoozedAt: at, checkedAt: at } : prev));
            }}
          >
            {t("healthCodeSnooze")}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
