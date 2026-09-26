import { Link } from "@tanstack/react-router";
import { useCopy } from "@/lib/use-copy";
import { PLUS_YEARLY_CAD, plusPriceCad } from "@/lib/parent-plus";
import { PROVIDER_ADDONS, PROVIDER_PLANS } from "@/lib/provider-plans";

const COPY = {
  en: {
    kicker: "Optional",
    title: "KidEase is free",
    lead: "Search, messages, listings, vacancy, and claim stay free for parents and daycares across Canada. These upgrades are optional and billed in Canadian dollars.",
    parents: "Parents",
    daycares: "Daycares",
    plus: "Parent Plus",
    pro: "Pro",
    network: "Network",
    signParent: "Sign in for Parent Plus",
    signDaycare: "Sign in for centre plans",
  },
  fr: {
    kicker: "Facultatif",
    title: "KidEase est gratuit",
    lead: "La recherche, les messages, la fiche, les places et la réclamation restent gratuits pour les parents et les garderies au Canada. Ces options sont facultatives et facturées en dollars canadiens.",
    parents: "Parents",
    daycares: "Garderies",
    plus: "Plus parents",
    pro: "Pro",
    network: "Réseau",
    signParent: "Connexion pour Plus parents",
    signDaycare: "Connexion pour les forfaits centre",
  },
} as const;

function cad(amount: number, locale: "en" | "fr") {
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function OptionalUpgrades() {
  const { locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";
  const t = COPY[loc];
  const pro = PROVIDER_PLANS.find((plan) => plan.id === "pro");
  const network = PROVIDER_PLANS.find((plan) => plan.id === "network");
  return (
    <section className="ke-gutter mx-auto max-w-6xl py-12" data-ke="optional-upgrades">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">{t.kicker}</p>
      <h2 className="mt-2 font-display text-2xl">{t.title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">{t.lead}</p>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <article className="rounded-xl bg-surface p-5 ring-1 ring-border">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">{t.parents}</p>
          <p className="mt-2 font-medium">{t.plus}</p>
          <p className="mt-1 text-sm text-muted">
            {cad(plusPriceCad("month"), loc)} / {loc === "fr" ? "mois" : "month"} · {cad(PLUS_YEARLY_CAD, loc)} /{" "}
            {loc === "fr" ? "an" : "year"}
          </p>
          <Link
            to="/login"
            search={{ role: "parent", desk: "parent", intent: "in", next: "/parent?tab=payments" }}
            className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary"
          >
            {t.signParent}
          </Link>
        </article>
        <article className="rounded-xl bg-surface p-5 ring-1 ring-border">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">{t.daycares}</p>
          <p className="mt-2 font-medium">{t.pro}</p>
          <p className="mt-1 text-sm text-muted">
            {cad(pro?.monthly ?? 49, loc)} / {loc === "fr" ? "mois" : "month"} · {cad(pro?.yearly ?? 490, loc)} /{" "}
            {loc === "fr" ? "an" : "year"}
          </p>
          <p className="mt-3 font-medium">{t.network}</p>
          <p className="mt-1 text-sm text-muted">
            {cad(network?.monthly ?? 39, loc)} / {loc === "fr" ? "site / mois · 3 sites minimum" : "site / month · 3-site minimum"}
          </p>
          <ul className="mt-3 space-y-1 text-sm text-muted">
            {PROVIDER_ADDONS.map((addon) => (
              <li key={addon.id}>
                {addon.name[loc]} · {cad(addon.amount, loc)}
                {addon.cadence === "once" ? (loc === "fr" ? " une fois" : " once") : loc === "fr" ? " / mois" : " / month"}
              </li>
            ))}
          </ul>
          <Link
            to="/login"
            search={{ role: "provider", desk: "director", intent: "in", next: "/provider/subscription" }}
            className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary"
          >
            {t.signDaycare}
          </Link>
        </article>
      </div>
    </section>
  );
}
