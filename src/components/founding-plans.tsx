import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOUNDING_FREE_FEATURES, FOUNDING_PAGE, foundingLocale } from "@/lib/founding-period";
import { localePath } from "@/lib/locale-path";
import { formatPlanCad } from "@/lib/upgrade-plans";
import { useCopy } from "@/lib/use-copy";

/** Public plans while SUBSCRIPTIONS_ENABLED is off. No prices beyond the free tier. */
export function FoundingPlans({ embedded = false }: { embedded?: boolean }) {
  const { locale } = useCopy();
  const loc = foundingLocale(locale);
  const copy = FOUNDING_PAGE[loc];
  const price = formatPlanCad(0, loc);
  return (
    <section className={embedded ? "space-y-6" : "ke-gutter mx-auto max-w-3xl py-10"} data-ke="founding-plans">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle">{copy.kicker}</p>
      {embedded ? (
        <h2 className="mt-2 font-display text-[clamp(1.75rem,4vw,2.5rem)] leading-tight">{copy.title}</h2>
      ) : (
        <h1 className="mt-2 font-display text-[clamp(1.75rem,4vw,2.5rem)] leading-tight">{copy.title}</h1>
      )}
      <p className="mt-3 max-w-2xl text-base text-muted">{copy.lead}</p>

      <div className="mt-8 rounded-2xl bg-surface p-4 ring-1 ring-border sm:p-5">
        <h2 className="font-display text-xl">{copy.parentsTitle}</h2>
        <p className="mt-2 text-sm text-muted">{copy.parentsBody}</p>
        <Link to={localePath("/search", locale)} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary">
          {copy.parentsCta}
        </Link>
      </div>

      <article
        data-ke="plan-card"
        data-plan="free"
        className="mt-4 flex flex-col rounded-2xl bg-surface p-4 ring-1 ring-primary/40 sm:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="font-display text-xl">{copy.daycareTitle}</h2>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{copy.daycarePill}</span>
        </div>
        <p className="mt-3 font-display text-3xl tabular-nums leading-none">
          {price}
          <span className={`${copy.priceUnit.startsWith("/") ? "" : "ml-1 "}text-sm font-normal text-muted`}>{copy.priceUnit}</span>
        </p>
        <p className="mt-1 text-sm font-medium">{copy.daycareName}</p>
        <p className="mt-3 text-sm text-muted">{copy.daycareBody}</p>
        <ul className="mt-4 space-y-2 text-sm">
          {FOUNDING_FREE_FEATURES.map((feature) => (
            <li key={feature.en} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={2} aria-hidden />
              <span>{feature[loc]}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 rounded-xl bg-bg p-4 ring-1 ring-border">
          <h3 className="text-sm font-semibold">{copy.foundingTitle}</h3>
          <p className="mt-1 text-sm text-muted">{copy.foundingBody}</p>
        </div>
        <Button asChild className="mt-5 min-h-11 w-full touch-manipulation sm:w-auto">
          <Link to="/claim">{copy.claim}</Link>
        </Button>
      </article>
    </section>
  );
}
