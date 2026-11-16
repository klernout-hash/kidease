import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  COACH_FOCUS_ANCHOR,
  listingCoachDesksForListings,
  listingVerifiedCoach,
  type ListingCoachFocus,
  type ListingCoachHref,
  type ListingVerifiedInput,
  type VerifiedBlocker,
  type VerifiedNice,
} from "@/lib/listing-verified";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";

const BLOCKER_KEY: Record<VerifiedBlocker, CopyKey> = {
  license: "completeNeedLicense",
  province: "listingCoachNeedProvince",
  hours: "completeNeedHours",
  ages: "completeNeedAges",
  capacity: "listingCoachNeedCapacity",
  fees: "completeNeedFees",
  photo: "completeNeedPhoto",
  screening: "listingCoachNeedScreening",
};

const NICE_KEY: Record<VerifiedNice, CopyKey> = {
  subsidy: "listingCoachNeedSubsidy",
  policies: "listingCoachNeedPolicies",
  vacancy: "listingCoachNeedVacancy",
};

const DESK_KEY: Record<ListingCoachHref["desk"], CopyKey> = {
  licence: "listingCoachOpenLicence",
  listings: "listingCoachOpenListing",
  screening: "listingCoachOpenScreening",
};

export function jumpToCoachFocus(focus?: ListingCoachFocus) {
  if (!focus) return;
  const id = COACH_FOCUS_ANCHOR[focus];
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const focusable = el.matches("input, textarea, button, select")
    ? el
    : el.querySelector<HTMLElement>("input, textarea, button, select");
  focusable?.focus();
}

function CoachLink({
  href,
  className,
  children,
}: {
  href: ListingCoachHref;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to="/provider"
      search={{ desk: href.desk, focus: href.focus }}
      className={className}
      onClick={() => jumpToCoachFocus(href.focus)}
    >
      {children}
    </Link>
  );
}

export function ListingReadinessCoach({
  item,
  variant = "card",
}: {
  item: ListingVerifiedInput;
  variant?: "card" | "editor";
}) {
  const { t, locale } = useCopy();
  const coach = listingVerifiedCoach(item);

  return (
    <div
      className={
        variant === "editor"
          ? "rounded-lg bg-bg p-4 text-sm ring-1 ring-border"
          : "mt-4 rounded-lg bg-bg p-4 text-sm ring-1 ring-border"
      }
    >
      <p className="font-medium">{coach.verified ? t("listingVerified") : t("listingVerifiedPending")}</p>
      <p className="mt-1 text-muted">{coach.verified ? t("listingVerifiedLead") : t("listingVerifiedPendingLead")}</p>
      <p className="mt-2 text-xs text-subtle">{t("listingVerifiedNotHealth")}</p>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">{t("listingCoachBlockers")}</p>
      <ul className="mt-2 space-y-1.5">
        {coach.blockers.map((row) => (
          <li key={row.id} className={row.done ? "text-muted" : "text-fg"}>
            <span className="mr-2 tabular-nums">{row.done ? "✓" : "–"}</span>
            {t(BLOCKER_KEY[row.id as VerifiedBlocker])}
            {row.done ? null : (
            <CoachLink href={row.href} className="ml-2 inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline">
              {row.id === "capacity" ? (locale === "fr" ? "Indiquer la capacité" : "Set capacity") : t(DESK_KEY[row.href.desk])}
            </CoachLink>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">{t("listingCoachNice")}</p>
      <ul className="mt-2 space-y-1.5">
        {coach.nice.map((row) => (
          <li key={row.id} className={row.done ? "text-muted" : "text-fg"}>
            <span className="mr-2 tabular-nums">{row.done ? "✓" : "–"}</span>
            {t(NICE_KEY[row.id as VerifiedNice])}
            {row.done ? null : (
              <CoachLink href={row.href} className="ml-2 text-primary underline-offset-4 hover:underline">
                {t("listingHealthEdit")}
              </CoachLink>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SetupProgress({ listings }: { listings: ListingVerifiedInput[] }) {
  const { t } = useCopy();
  const coaches = listings.map((listing) => listingVerifiedCoach(listing));
  const steps = coaches.flatMap((coach) => [...coach.blockers, ...coach.nice]);
  if (!steps.length) return null;
  const done = steps.filter((step) => step.done).length;
  const percent = Math.round((done / steps.length) * 100);
  if (percent >= 100) return null;
  const next = coaches.map((coach) => coach.next).find((step) => step && !step.done) ?? null;
  const nextLabel = next?.id === "fees"
    ? t("setupNextFees")
    : next
      ? t(next.kind === "blocker" ? BLOCKER_KEY[next.id as VerifiedBlocker] : NICE_KEY[next.id as VerifiedNice])
      : "";
  return (
    <details className="rounded-xl border border-border bg-surface p-4" data-ke="setup-progress">
      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{t("setupReady").replace("{n}", String(percent))}</span>
        {nextLabel ? <span className="text-sm text-muted">{nextLabel}</span> : null}
      </summary>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <ul className="mt-3 space-y-2 text-sm">
        {coaches.flatMap((coach) => coach.blockers.filter((step) => !step.done)).map((step) => (
          <li key={step.id}>
            <CoachLink href={step.href} className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline">
              {t(BLOCKER_KEY[step.id])}
            </CoachLink>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function ActionRequiredBanner({ listings }: { listings: ListingVerifiedInput[] }) {
  const { t } = useCopy();
  const pending = listings.filter((listing) => !listingVerifiedCoach(listing).verified);
  if (!pending.length) return null;
  const hrefs = listingCoachDesksForListings(pending);

  return (
    <div className="rounded-xl bg-primary/8 px-5 py-4 ring-1 ring-primary/20">
      <p className="font-medium">{t("todayActionRequired")}</p>
      <p className="mt-1 text-sm text-muted">{t("todayActionRequiredLead")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {hrefs.map((href) => (
          <Button key={`${href.desk}:${href.focus ?? ""}`} size="sm" variant="secondary" asChild>
            <CoachLink href={href}>{t(DESK_KEY[href.desk])}</CoachLink>
          </Button>
        ))}
      </div>
    </div>
  );
}
