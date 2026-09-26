import { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import { confirmSuccess } from "@/lib/success-confirm";
import { publicPayMessage } from "@/lib/stripe-public-error";
import { CheckoutReturnNote, readUpgradeReturn, useUpgradeCelebration } from "@/components/checkout-return";
import { Button } from "@/components/ui/button";
import { DaycareAddons } from "@/components/daycare-addons";
import { useCopy } from "@/lib/use-copy";
import {
  PROVIDER_COMPARE,
  PROVIDER_PLANS,
  type ProviderAddonId,
  type ProviderInterval,
  type ProviderPlanId,
} from "@/lib/provider-plans";
import {
  getProviderSubscription,
  saveProviderSubscription,
  postCentreJob,
  startProviderAddonCheckout,
  startProviderBillingPortal,
  startProviderCheckout,
  type ProviderSubscriptionState,
} from "@/lib/server/provider-subscriptions";
import { openStripeCheckout } from "@/lib/wallets";
import { getProvider } from "@/lib/server/family";
import { DirectorProStrip } from "@/components/director-pro-strip";
import { PayCtas, useShowPayCtas } from "@/components/pay-chrome";
import { useSessionDesks } from "@/components/session-desks";
import { checkoutCtaLabel, daycareUpgradePlan, paidPlanVisible, visibleYearlySavings } from "@/lib/upgrade-plans";
import { BillingIntervalToggle } from "@/components/billing-interval-toggle";
import { UpgradePlanCard } from "@/components/upgrade-plan-card";

const COPY = {
  en: {
    eyebrow: "Daycare SaaS",
    title: "Subscription",
    lead: "Centre plans for listing, inquiries, and multi-site tools are optional. KidEase is free for every centre — vacancy, claim, and licence stay open. This is not parent Plus or a family bill.",
    pendingPortal: "Manage billing",
    monthly: "Monthly",
    yearly: "Yearly",
    yearlySave: "Pro saves two months",
    subscribe: "Subscribe",
    current: "Current plan",
    compare: "Compare",
    checkout: "Open Stripe checkout",
    addonSelect: "Select",
    addonRemove: "Remove",
    portal: "Manage billing",
    networkNeed: "Network is priced for 3 or more sites.",
    sites: (n: number) => (n === 1 ? "1 listed site" : `${n} listed sites`),
    status: "Stripe status",
    entitled: "Active entitlements",
    entitledFree: "Free basics — listing, vacancy, claim, licence.",
    blocked: "Checkout is blocked until this plan’s Stripe price ID is set on Vercel.",
    savedFree: "You are on Free. Listing tools stay on.",
    portalCard: "Open the Stripe customer portal to update the card or cancel.",
    portalWait: "The portal appears after the first live checkout creates a Stripe customer on this profile.",
    portalOff: "Card payments are not live yet. Centre plan checkout is not charged.",
  },
  fr: {
    eyebrow: "SaaS garderie",
    title: "Abonnement",
    lead: "Les forfaits centre pour la fiche, les demandes et plusieurs sites sont facultatifs. KidEase est gratuit pour chaque centre — places, réclamation et permis restent ouverts. Ce n’est pas Plus parents ni une facture famille.",
    pendingPortal: "Gérer la facturation",
    monthly: "Mensuel",
    yearly: "Annuel",
    yearlySave: "Pro : deux mois offerts",
    subscribe: "S’abonner",
    current: "Forfait actuel",
    compare: "Comparer",
    checkout: "Ouvrir le checkout Stripe",
    addonSelect: "Choisir",
    addonRemove: "Retirer",
    portal: "Gérer la facturation",
    networkNeed: "Réseau est tarifé pour 3 sites ou plus.",
    sites: (n: number) => (n === 1 ? "1 site listé" : `${n} sites listés`),
    status: "Statut Stripe",
    entitled: "Droits actifs",
    entitledFree: "Base gratuite — fiche, places, réclamation, permis.",
    blocked: "Le checkout reste fermé tant que l’identifiant de prix Stripe n’est pas sur Vercel.",
    savedFree: "Vous êtes sur Gratuit. Les outils de fiche restent ouverts.",
    portalCard: "Ouvrez le portail Stripe pour changer la carte ou annuler.",
    portalWait: "Le portail apparaît après le premier paiement en direct, quand Stripe crée un client sur ce profil.",
    portalOff: "Les paiements par carte ne sont pas encore en direct. Le forfait centre n’est pas facturé.",
  },
};

function subscriptionError(err: unknown, fallback: string, plansOff: string) {
  const message = publicPayMessage(err, fallback);
  if (message === "Plans are not offered on this site yet. Listing and claim stay free.") return plansOff;
  return message;
}

function priceReady(state: ProviderSubscriptionState, plan: ProviderPlanId, interval: ProviderInterval) {
  if (plan === "free") return false;
  return paidPlanVisible(plan, interval, state.prices);
}

export function ProviderSubscriptionPanel() {
  const { locale, t: tx } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const t = COPY[loc];
  const showPay = useShowPayCtas();
  const { session } = useSessionDesks();
  const adminPreview = session?.role === "admin";
  const showCheckout = showPay || adminPreview;
  const [state, setState] = useState<ProviderSubscriptionState | null>(null);
  const [interval, setInterval] = useState<ProviderInterval>("year");
  const [addons, setAddons] = useState<ProviderAddonId[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [week, setWeek] = useState({ views: 0, requests: 0 });
  const [centreId, setCentreId] = useState("");
  const [jobRole, setJobRole] = useState("");
  const [jobNote, setJobNote] = useState("");
  const payReturn = useMemo(
    () => (typeof window === "undefined" ? null : readUpgradeReturn(window.location.search)),
    [],
  );

  const applyState = useCallback((s: ProviderSubscriptionState) => {
    setState(s);
    if (s.entitlements.paid) setInterval(s.interval);
    setAddons(s.addons);
    setCentreId((current) => current || s.centres[0]?.id || s.jobPostCentreId || "");
    setLoadError(false);
  }, []);

  const reloadSubscription = useCallback(() => {
    void getProviderSubscription()
      .then(applyState)
      .catch(() => setLoadError(true));
  }, [applyState]);

  const returnPhase = useUpgradeCelebration({
    ret: payReturn,
    locale: loc,
    confirmedSessionId: state?.catalogCheckoutSessionId,
    entitledPlan: state?.entitlements.entitledPlan,
    subscriptionStatus: state?.subscriptionStatus,
    featuredCityStatus: state?.featuredCityStatus,
    claimBoostPaymentId: state?.claimBoostPaymentId,
    jobPostPaymentIds: state?.jobPostPaymentIds,
    reload: reloadSubscription,
  });

  useEffect(() => {
    reloadSubscription();
    void getProvider()
      .then((res) => {
        setWeek({
          views: res.stats.reduce((sum, s) => sum + (s.weekViews ?? 0), 0),
          requests: res.stats.reduce((sum, s) => sum + (s.weekRequests ?? 0), 0),
        });
      })
      .catch(() => undefined);
  }, [reloadSubscription]);

  if (loadError) {
    return (
      <p className="rounded-xl bg-surface px-5 py-8 text-sm text-muted ring-1 ring-border">
        {tx("plansLoadFailed")}
      </p>
    );
  }
  if (!state) {
    return <p className="rounded-xl bg-surface px-5 py-8 text-sm text-muted ring-1 ring-border">{tx("plansLoading")}</p>;
  }
  const current = state;

  async function persist(next: { plan: ProviderPlanId; interval: ProviderInterval; addons: ProviderAddonId[] }) {
    setBusy(true);
    try {
      const saved = await saveProviderSubscription({ data: next });
      setState(saved);
      setInterval(saved.interval);
      setAddons(saved.addons);
      confirmSuccess({ variant: "toast", title: next.plan === "free" ? t.savedFree : tx("planCheckoutRehearsal") });
    } catch (err) {
      toast.error(subscriptionError(err, tx("planSaveFailed"), tx("plansNotOffered")));
    } finally {
      setBusy(false);
    }
  }

  async function subscribe(plan: ProviderPlanId) {
    const next = { plan, interval, addons };
    if (plan === "free") {
      if (current.stripeLive && current.customerId && current.subscriptionStatus) {
        toast.error(
          loc === "fr"
            ? "Pour quitter Pro ou Réseau, ouvrez Gérer la facturation. KidEase ne marque pas le centre gratuit tant que Stripe facture encore."
            : "To leave Pro or Network, open Manage billing. KidEase will not mark this centre free while Stripe is still charging.",
        );
        return;
      }
      await persist(next);
      return;
    }
    if (!current.stripeLive) {
      await persist(next);
      return;
    }
    if (!priceReady(current, plan, interval)) {
      toast.error(t.blocked);
      return;
    }
    setBusy(true);
    try {
      const result = await startProviderCheckout({ data: next });
      if (result.url) {
        await openStripeCheckout(result.url);
        return;
      }
      const saved = await getProviderSubscription();
      setState(saved);
      confirmSuccess({ variant: "toast", title: tx("planSaved") });
    } catch (err) {
      toast.error(subscriptionError(err, tx("planCheckoutFailed"), tx("plansNotOffered")));
    } finally {
      setBusy(false);
    }
  }

  async function payAddon(addon: ProviderAddonId) {
    setBusy(true);
    try {
      const result = await startProviderAddonCheckout({ data: { addon, centreId: centreId || null } });
      if (result.url) {
        await openStripeCheckout(result.url);
        return;
      }
    } catch (err) {
      toast.error(subscriptionError(err, tx("planAddonFailed"), tx("plansNotOffered")));
    } finally {
      setBusy(false);
    }
  }

  async function postJob() {
    const target = centreId || state?.jobPostCentreId || state?.centres[0]?.id || "";
    if (!target) {
      toast.error(loc === "fr" ? "Choisissez un centre. Rien n’a été publié." : "Choose a centre. Nothing was posted.");
      return;
    }
    setBusy(true);
    try {
      await postCentreJob({ data: { centreId: target, role: jobRole, note: jobNote } });
      setJobRole("");
      setJobNote("");
      const saved = await getProviderSubscription();
      applyState(saved);
      confirmSuccess({
        variant: "modal",
        title: loc === "fr" ? "L’offre est sur la page du centre" : "The opening is on the centre page",
      });
    } catch (err) {
      toast.error(subscriptionError(err, loc === "fr" ? "L’offre n’a pas été publiée." : "The opening was not posted.", tx("plansNotOffered")));
    } finally {
      setBusy(false);
    }
  }

  async function openPortal() {
    setBusy(true);
    try {
      const { url } = await startProviderBillingPortal();
      await openStripeCheckout(url);
    } catch (err) {
      toast.error(publicPayMessage(err, tx("planPortalFailed")));
    } finally {
      setBusy(false);
    }
  }

  const liveCheckout = state.stripeLive && state.checkoutLive;
  const visiblePlans = PROVIDER_PLANS.filter((plan) => paidPlanVisible(plan.id, interval, state.prices));

  if (!showCheckout) {
    return (
      <section className="space-y-4 rounded-xl bg-surface p-5 ring-1 ring-border" data-ke="plans-not-offered">
        <h2 className="font-display text-2xl">{t.title}</h2>
        <p className="text-sm text-muted">{tx("plansNotOffered")}</p>
      </section>
    );
  }

  return (
    <section className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">{t.eyebrow}</p>
        <h2 className="mt-2 inline-flex items-center gap-2 font-display text-2xl">
          <CreditCard className="size-6 text-primary" strokeWidth={1.8} />
          {t.title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">{t.lead}</p>
        {returnPhase ? (
          <div className="mt-3">
            <CheckoutReturnNote phase={returnPhase} locale={loc} />
          </div>
        ) : null}
        <PayCtas>
        <div className="mt-4">
          <DirectorProStrip views={week.views} requests={week.requests} />
        </div>
        </PayCtas>
        {state.ghost ? (
          <p className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">{tx("planGhostPreview")}</p>
        ) : null}
        <p className="mt-3 text-sm text-muted">
          {liveCheckout ? tx("planCheckoutLive") : tx("planCheckoutRehearsal")}
        </p>
        <p className="mt-2 text-sm">
          <span className="font-medium">{t.entitled}: </span>
          <span className="capitalize">{state.entitlements.entitledPlan}</span>
          {!state.entitlements.paid ? ` — ${t.entitledFree}` : null}
        </p>
        {!state.entitlements.paid ? (
          <p className="mt-3 rounded-xl bg-bg p-4 text-sm text-muted ring-1 ring-border">{t.savedFree}</p>
        ) : null}
        <p className="mt-1 text-xs text-subtle">{t.sites(state.siteCount)}</p>
        {state.subscriptionStatus ? (
          <p className="mt-1 text-xs text-subtle">
            {t.status}: {state.subscriptionStatus}
          </p>
        ) : null}
      </div>

      <BillingIntervalToggle
        interval={interval}
        onChange={setInterval}
        savePercents={visibleYearlySavings(
          PROVIDER_PLANS.map((plan) => plan.id),
          state.prices,
        )}
        locale={loc}
      />

      <div className={visiblePlans.length > 2 ? "grid gap-4 lg:grid-cols-3" : "grid gap-4 sm:grid-cols-2"}>
        {visiblePlans.map((plan) => {
          const entitled = state.entitlements.entitledPlan === plan.id;
          const selected = state.plan === plan.id;
          const current = entitled || (selected && !state.stripeLive);
          const canCharge = plan.id !== "free" && state.stripeLive && priceReady(state, plan.id, interval);
          const blockedPaid = plan.id !== "free" && state.stripeLive && !priceReady(state, plan.id, interval);
          const copy = daycareUpgradePlan(plan.id);
          return (
            <UpgradePlanCard
              key={plan.id}
              plan={copy}
              locale={loc}
              interval={interval}
              monthly={plan.monthly}
              yearly={plan.yearly}
              perSite={plan.perSite}
              cta={
                <>
                  {plan.id === "network" && state.siteCount < plan.minSites ? (
                    <p className="mb-3 text-xs text-subtle">{t.networkNeed}</p>
                  ) : null}
                  <Button
                    className="min-h-11 w-full"
                    variant={plan.id === "pro" && !(current || !state.entitlements.paid) ? "primary" : current || !state.entitlements.paid ? "secondary" : "secondary"}
                    disabled={busy || (current && !canCharge) || (plan.id === "network" && state.siteCount < plan.minSites)}
                    onClick={() => void subscribe(plan.id)}
                  >
                    {blockedPaid
                      ? t.blocked
                      : current && !canCharge
                        ? t.current
                        : interval === "year" && canCharge
                          ? checkoutCtaLabel({
                              planName: plan.name[loc],
                              interval,
                              monthly: plan.monthly,
                              yearly: plan.yearly,
                              locale: loc,
                            })
                          : canCharge
                            ? t.checkout
                            : t.subscribe}
                  </Button>
                </>
              }
            />
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-border">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <caption className="sr-only">{t.compare}</caption>
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-[0.12em] text-subtle">
              <th className="px-4 py-3 font-medium">{t.compare}</th>
              {visiblePlans.map((p) => (
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
                {visiblePlans.map((p) => (
                  <td key={p.id} className="px-4 py-3 text-muted">
                    {row[p.id][loc]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {state.centres.length > 1 ? (
        <label className="block text-sm">
          <span className="text-muted">{loc === "fr" ? "Centre pour les options" : "Centre for add-ons"}</span>
          <select
            className="mt-1 min-h-11 w-full rounded-xl bg-surface px-3 ring-1 ring-border"
            data-ke="addon-centre"
            value={centreId}
            onChange={(event) => setCentreId(event.target.value)}
          >
            {state.centres.map((centre) => (
              <option key={centre.id} value={centre.id}>
                {centre.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <DaycareAddons
        locale={loc}
        flags={state.prices}
        action={(addon) => {
          const on = addons.includes(addon.id);
          const featuredLive =
            addon.id === "featured_city" &&
            (state.featuredCityStatus === "active" || state.featuredCityStatus === "trialing");
          const owned =
            addon.id === "featured_city"
              ? featuredLive
              : addon.id === "claim_boost"
                ? Boolean(state.claimBoostPaidAt)
                : state.jobPostCredits > 0;
          const status = !owned
            ? null
            : addon.id === "job_post"
              ? loc === "fr"
                ? `${state.jobPostCredits} crédit${state.jobPostCredits === 1 ? "" : "s"}`
                : `${state.jobPostCredits} credit${state.jobPostCredits === 1 ? "" : "s"}`
              : loc === "fr"
                ? "Actif"
                : "On";
          return (
            <div className="flex items-center gap-2">
              {status ? <span className="text-xs font-medium text-ok">{status}</span> : null}
              <Button
                type="button"
                size="sm"
                disabled={busy || featuredLive}
                variant={on || owned ? "secondary" : "primary"}
                onClick={() => {
                  if (state.stripeLive) {
                    void payAddon(addon.id);
                    return;
                  }
                  const next = on ? addons.filter((id) => id !== addon.id) : [...addons, addon.id];
                  setAddons(next);
                  void persist({ plan: current.plan, interval, addons: next });
                }}
              >
                {state.stripeLive ? t.checkout : on ? t.addonRemove : t.addonSelect}
              </Button>
            </div>
          );
        }}
      />

      {state.jobPostCredits > 0 ? (
        <form
          className="rounded-xl bg-surface px-4 py-4 ring-1 ring-border"
          data-ke="centre-job-form"
          onSubmit={(event) => {
            event.preventDefault();
            void postJob();
          }}
        >
          <p className="text-sm font-medium">
            {loc === "fr" ? "Utiliser un crédit d’offre" : "Use a job-post credit"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {loc === "fr"
              ? "Cela publie une offre sur la page de ce centre et retire un crédit."
              : "This posts one opening on this centre page and uses one credit."}
          </p>
          <label className="mt-3 block text-sm">
            <span className="text-muted">{loc === "fr" ? "Poste" : "Role"}</span>
            <input
              className="mt-1 min-h-11 w-full rounded-xl bg-bg px-3 ring-1 ring-border"
              value={jobRole}
              maxLength={80}
              required
              onChange={(event) => setJobRole(event.target.value)}
            />
          </label>
          <label className="mt-3 block text-sm">
            <span className="text-muted">{loc === "fr" ? "Note" : "Note"}</span>
            <textarea
              className="mt-1 min-h-20 w-full rounded-xl bg-bg px-3 py-2 ring-1 ring-border"
              value={jobNote}
              maxLength={280}
              onChange={(event) => setJobNote(event.target.value)}
            />
          </label>
          <Button type="submit" className="mt-3" disabled={busy}>
            {loc === "fr" ? "Publier l’offre" : "Post opening"}
          </Button>
        </form>
      ) : null}

      <div className="rounded-xl bg-surface px-5 py-5 ring-1 ring-border">
        {state.customerId && state.stripeLive ? (
          <Button disabled={busy} className="min-h-11 w-full sm:w-auto" onClick={() => void openPortal()}>
            {t.portal}
          </Button>
        ) : (
          <Button disabled className="min-h-11 w-full sm:w-auto">
            {liveCheckout ? t.portal : t.checkout}
          </Button>
        )}
        <p className="mt-3 text-sm text-muted">
          {state.stripeLive ? (state.customerId ? t.portalCard : t.portalWait) : t.portalOff}
        </p>
      </div>
    </section>
  );
}
