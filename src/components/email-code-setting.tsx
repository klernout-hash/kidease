import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getEmailCodePreference, setParentEmailCode } from "@/lib/server/second-factor";
import { useCopy } from "@/lib/use-copy";

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
  const [state, setState] = useState<{ prompt: boolean; locked: boolean; graceEndsAt: number | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getEmailCodePreference()
      .then((row) => {
        if (!cancelled) {
          setState({ prompt: row.providerPrompt, locked: row.providerLocked, graceEndsAt: row.graceEndsAt });
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
  const date = state.graceEndsAt
    ? new Date(state.graceEndsAt).toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { month: "long", day: "numeric" })
    : "";
  const message = state.locked || !date ? t("healthCodeLocked") : t("healthCodePrompt").replace("{date}", date);
  return (
    <section className="mb-4 rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="health-second-factor">
      <p className="text-sm">{message}</p>
      <Button type="button" className="mt-3 min-h-11" asChild>
        <Link to="/verify-2fa" search={{ next: "/provider" }}>
          {t("healthCodeAction")}
        </Link>
      </Button>
    </section>
  );
}
