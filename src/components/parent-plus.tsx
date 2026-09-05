import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import { PLUS_FEATURES, plusPriceHint, type PlusInterval } from "@/lib/parent-plus";
import { getParentPlus, startParentPlusCheckout, startParentPlusPortal, type ParentPlusState } from "@/lib/server/parent-plus";

function plusMoney(amount: number, locale: "en" | "fr") {
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function ParentPlusPanel() {
  const { t, locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const [state, setState] = useState<ParentPlusState | null>(null);
  const [interval, setInterval] = useState<PlusInterval>("month");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getParentPlus()
      .then((s) => {
        setState(s);
        setInterval(s.interval);
      })
      .catch(() => undefined);
  }, []);

  if (!state) return null;

  const live = state.stripeLive && Boolean(state.prices[interval === "year" ? "plus_yearly" : "plus_monthly"]);
  const current = state.plan === "plus" && (state.status === "active" || !state.stripeLive);

  async function start() {
    setBusy(true);
    try {
      const { url } = await startParentPlusCheckout({ data: { interval } });
      window.location.assign(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start Plus checkout");
    } finally {
      setBusy(false);
    }
  }

  async function portal() {
    setBusy(true);
    try {
      const { url } = await startParentPlusPortal();
      window.location.assign(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open billing portal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-surface p-5 ring-1 ring-border">
      <h3 className="font-display text-xl">{t("parentPlusTitle")}</h3>
      <p className="mt-1 text-sm text-muted">{t("parentPlusLead")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {(["month", "year"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setInterval(id)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm",
              interval === id ? "bg-primary text-primary-fg" : "bg-bg text-muted ring-1 ring-border hover:text-fg",
            )}
          >
            {plusPriceHint(id, loc)}
          </button>
        ))}
      </div>
      <p className="mt-4 font-display text-3xl tabular-nums">
        {plusMoney(interval === "year" ? 59 : 7.99, loc)}
      </p>
      <ul className="mt-3 space-y-1.5 text-sm text-muted">
        {PLUS_FEATURES.map((f) => (
          <li key={f.en}>{f[loc]}</li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        {live ? (
          <Button disabled={busy || current} onClick={() => void start()}>
            {current ? t("parentPlusCurrent") : t("parentPlusSubscribe")}
          </Button>
        ) : (
          <Button disabled>{t("parentPlusSubscribe")}</Button>
        )}
        {state.customerId && state.stripeLive ? (
          <Button variant="secondary" disabled={busy} onClick={() => void portal()}>
            {t("parentPlusManage")}
          </Button>
        ) : null}
      </div>
      {!state.stripeLive ? <p className="mt-3 text-sm text-muted">{t("parentPlusRehearsal")}</p> : null}
      {state.status ? <p className="mt-2 text-xs text-subtle">{state.status}</p> : null}
    </div>
  );
}
