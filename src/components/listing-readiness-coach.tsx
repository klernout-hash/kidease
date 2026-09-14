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
  const { t } = useCopy();
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
              <CoachLink href={row.href} className="ml-2 text-primary underline-offset-4 hover:underline">
                {t(DESK_KEY[row.href.desk])}
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
