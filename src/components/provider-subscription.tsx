import { useEffect, useState } from "react";
import { Check, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";
import { cn, money } from "@/lib/utils";
import {
  planPriceCad,
  planPriceHint,
  PROVIDER_ADDONS,
  PROVIDER_CHECKOUT_LIVE_MESSAGE,
  PROVIDER_CHECKOUT_REHEARSAL_MESSAGE,
  PROVIDER_COMPARE,
  PROVIDER_PLANS,
  PROVIDER_SUBSCRIPTION_GHOST_MESSAGE,
  type ProviderAddonId,
  type ProviderInterval,
  type ProviderPlanId,
} from "@/lib/provider-plans";
import {
  getProviderSubscription,
  saveProviderSubscription,
  startProviderAddonCheckout,
  startProviderBillingPortal,
  startProviderCheckout,
  type ProviderSubscriptionState,
} from "@/lib/server/provider-subscriptions";

const COPY = {
  en: {
    eyebrow: "Daycare SaaS",
    title: "Subscription",
    lead: "Centre plans for listing, inquiries, and multi-site tools. This is not parent Plus or family payments.",
    monthly: "Monthly",
    yearly: "Yearly",
    yearlySave: "Pro saves two months",
    subscribe: "Subscribe",
    current: "Current plan",
    compare: "Compare",
    addons: "Add-ons",
    addonsLead: "Pay with Stripe Checkout when live keys and price IDs are set.",
    addonsRehearsal: "Shown now — pay later when live checkout is on.",
    once: "one-time",
    perMonth: "/ month",
    checkout: "Open Stripe checkout",
    portal: "Manage billing",
    networkNeed: "Network is priced for 3 or more sites.",
    sites: (n: number) => (n === 1 ? "1 listed site" : `${n} listed sites`),
    status: "Stripe status",
  },
  fr: {
    eyebrow: "SaaS garderie",
    title: "Abonnement",
    lead: "Forfaits centre pour la fiche, les demandes et plusieurs sites. Ce n’est pas Plus parents ni les paiements famille.",
    monthly: "Mensuel",
    yearly: "Annuel",
    yearlySave: "Pro : deux mois offerts",
    subscribe: "S’abonner",
    current: "Forfait actuel",
    compare: "Comparer",
    addons: "Options",
    addonsLead: "Paiement Stripe Checkout lorsque les clés et les prix sont en place.",
    addonsRehearsal: "Affichées maintenant — paiement plus tard, quand le checkout en direct sera prêt.",
    once: "unique",
    perMonth: "/ mois",
    checkout: "Ouvrir le checkout Stripe",
    portal: "Gérer la facturation",
    networkNeed: "Réseau est tarifé pour 3 sites ou plus.",
    sites: (n: number) => (n === 1 ? "1 site listé" : `${n} sites listés`),
    status: "Statut Stripe",
  },
};

function priceReady(state: ProviderSubscriptionState, plan: ProviderPlanId, interval: ProviderInterval) {
  if (plan === "free") return false;
  if (plan === "pro") return interval === "year" ? Boolean(state.prices.pro_yearly) : Boolean(state.prices.pro_monthly);
  if (plan === "network") return Boolean(state.prices.network_monthly);
  return false;
}

export function ProviderSubscriptionPanel() {
  const { locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const t = COPY[loc];
  const [state, setState] = useState<ProviderSubscriptionState | null>(null);
  const [interval, setInterval] = useState<ProviderInterval>("month");
  const [addons, setAddons] = useState<ProviderAddonId[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    void getProviderSubscription()
      .then((s) => {
        setState(s);
        setInterval(s.interval);
        setAddons(s.addons);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, []);

  if (loadError) {
    return (
      <p className="rounded-xl bg-surface px-5 py-8 text-sm text-muted ring-1 ring-border">
        Could not load centre plans. This tab is a staff preview until FEATURE_PROVIDER_SUBSCRIPTIONS is on.
      </p>
    );
  }
  if (!state) {
    return <p className="rounded-xl bg-surface px-5 py-8 text-sm text-muted ring-1 ring-border">Loading plans…</p>;
  }
  const current = state;

  async function persist(next: { plan: ProviderPlanId; interval: ProviderInterval; addons: ProviderAddonId[] }) {
    setBusy(true);
    try {
      const saved = await saveProviderSubscription({ data: next });
      setState(saved);
      setInterval(saved.interval);
      setAddons(saved.addons);
      toast.success(PROVIDER_CHECKOUT_REHEARSAL_MESSAGE);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save plan");
    } finally {
      setBusy(false);
    }
  }

  async function subscribe(plan: ProviderPlanId) {
    const next = { plan, interval, addons };
    if (!current.stripeLive || !priceReady(current, plan, interval) || plan === "free") {
      await persist(next);
      return;
    }
    setBusy(true);
    try {
      const result = await startProviderCheckout({ data: next });
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      const saved = await getProviderSubscription();
      setState(saved);
      toast.success("Plan saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start checkout");
    } finally {
      setBusy(false);
    }
  }

  async function payAddon(addon: ProviderAddonId) {
    setBusy(true);
    try {
      const result = await startProviderAddonCheckout({ data: { addon } });
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start add-on checkout");
    } finally {
      setBusy(false);
    }
  }

  async function openPortal() {
    setBusy(true);
    try {
      const { url } = await startProviderBillingPortal();
      window.location.assign(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open billing portal");
    } finally {
      setBusy(false);
    }
  }

  const liveCheckout = state.stripeLive && state.checkoutLive;

  return (
    <section className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">{t.eyebrow}</p>
        <h2 className="mt-2 inline-flex items-center gap-2 font-display text-2xl">
          <CreditCard className="size-6 text-primary" strokeWidth={1.8} />
          {t.title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">{t.lead}</p>
        {state.ghost ? (
          <p className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">{PROVIDER_SUBSCRIPTION_GHOST_MESSAGE}</p>
        ) : null}
        <p className="mt-3 text-sm text-muted">
          {liveCheckout ? PROVIDER_CHECKOUT_LIVE_MESSAGE : PROVIDER_CHECKOUT_REHEARSAL_MESSAGE}
        </p>
        <p className="mt-1 text-xs text-subtle">{t.sites(state.siteCount)}</p>
        {state.subscriptionStatus ? (
          <p className="mt-1 text-xs text-subtle">
            {t.status}: {state.subscriptionStatus}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["month", "year"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setInterval(id)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm",
              interval === id ? "bg-primary text-primary-fg" : "bg-surface text-muted ring-1 ring-border hover:text-fg",
            )}
          >
            {id === "month" ? t.monthly : t.yearly}
          </button>
        ))}
        {interval === "year" ? <span className="text-xs text-subtle">{t.yearlySave}</span> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {PROVIDER_PLANS.map((plan) => {
          const current = state.plan === plan.id && (plan.id === "free" || state.subscriptionStatus === "active" || !state.stripeLive);
          const price = planPriceCad(plan, interval, state.siteCount);
          const hint = planPriceHint(plan, interval, loc);
          const canCharge = plan.id !== "free" && state.stripeLive && priceReady(state, plan.id, interval);
          return (
            <article
              key={plan.id}
              className={cn(
                "flex flex-col rounded-xl bg-surface p-5 ring-1",
                current ? "ring-2 ring-primary" : "ring-border",
              )}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">{plan.name[loc]}</p>
              <p className="mt-2 font-display text-3xl tabular-nums">{money(price, loc)}</p>
              <p className="mt-1 text-xs text-subtle">{hint}</p>
              <p className="mt-3 text-sm text-muted">{plan.tagline[loc]}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {plan.features.map((f) => (
                  <li key={f.en} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={2} />
                    <span>{f[loc]}</span>
                  </li>
                ))}
              </ul>
              {plan.id === "network" && state.siteCount < plan.minSites ? (
                <p className="mt-3 text-xs text-subtle">{t.networkNeed}</p>
              ) : null}
              <Button
                className="mt-5 w-full"
                variant={current ? "secondary" : "primary"}
                disabled={busy || (current && !canCharge)}
                onClick={() => void subscribe(plan.id)}
              >
                {current && !canCharge ? t.current : canCharge ? t.checkout : t.subscribe}
              </Button>
            </article>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-border">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <caption className="sr-only">{t.compare}</caption>
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-[0.12em] text-subtle">
              <th className="px-4 py-3 font-medium">{t.compare}</th>
              {PROVIDER_PLANS.map((p) => (
                <th key={p.id} className="px-4 py-3 font-medium">
                  {p.name[loc]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PROVIDER_COMPARE.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <th className="px-4 py-3 font-medium text-fg">{row.label[loc]}</th>
                <td className="px-4 py-3 text-muted">{row.free[loc]}</td>
                <td className="px-4 py-3 text-muted">{row.pro[loc]}</td>
                <td className="px-4 py-3 text-muted">{row.network[loc]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="font-display text-xl">{t.addons}</h3>
        <p className="mt-1 text-sm text-muted">{state.stripeLive ? t.addonsLead : t.addonsRehearsal}</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {PROVIDER_ADDONS.map((addon) => {
            const on = addons.includes(addon.id);
            const ready = Boolean(state.prices[addon.id] || state.paymentLinks[addon.id]);
            return (
              <li key={addon.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (state.stripeLive && ready) {
                      void payAddon(addon.id);
                      return;
                    }
                    const next = on ? addons.filter((id) => id !== addon.id) : [...addons, addon.id];
                    setAddons(next);
                    void persist({ plan: current.plan, interval, addons: next });
                  }}
                  className={cn(
                    "h-full w-full rounded-xl px-4 py-4 text-left ring-1",
                    on ? "bg-primary/5 ring-2 ring-primary" : "bg-surface ring-border hover:ring-primary/40",
                  )}
                >
                  <p className="font-medium">{addon.name[loc]}</p>
                  <p className="mt-1 font-display text-2xl tabular-nums">
                    {money(addon.amount, loc)}
                    <span className="ml-1 text-xs font-sans font-normal text-subtle">
                      {addon.cadence === "once" ? t.once : t.perMonth}
                    </span>
                  </p>
                  <p className="mt-2 text-sm text-muted">{addon.blurb[loc]}</p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-xl bg-surface px-5 py-5 ring-1 ring-border">
        {state.customerId && state.stripeLive ? (
          <Button disabled={busy} className="w-full sm:w-auto" onClick={() => void openPortal()}>
            {t.portal}
          </Button>
        ) : (
          <Button disabled className="w-full sm:w-auto">
            {liveCheckout ? t.portal : t.checkout}
          </Button>
        )}
        <p className="mt-3 text-sm text-muted">
          {state.stripeLive
            ? state.customerId
              ? "Open the Stripe customer portal to update the card or cancel."
              : "The portal appears after the first live checkout creates a Stripe customer on this profile."
            : "Internal ledger only. Centre plan checkout is not charged."}
        </p>
      </div>
    </section>
  );
}
