import { Link } from "@tanstack/react-router";
import { GuestFavoriteBadge } from "@/components/guest-favorite";
import { qualityBreakdown, type QualityIssue, type QualityIssueId } from "@/lib/quality";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";
import type { Daycare } from "@/lib/types";

const ISSUE_KEY: Record<QualityIssueId, CopyKey> = {
  claim_unverified: "qualityIssueClaim",
  license_unverified: "qualityIssueLicense",
  license_expired: "qualityIssueLicenseExpired",
  license_suspended: "qualityIssueLicenseSuspended",
  incomplete_fees: "completeNeedFees",
  incomplete_ages: "completeNeedAges",
  incomplete_hours: "completeNeedHours",
  incomplete_license: "completeNeedLicense",
  incomplete_photo: "completeNeedPhoto",
  vacancy_unknown: "qualityIssueVacancyUnknown",
  vacancy_stale: "qualityIssueVacancyStale",
  reviews_thin: "qualityIssueReviews",
  tours_low: "qualityIssueTours",
  replies_low: "qualityIssueReplies",
};

const CTA_KEY: Record<QualityIssue["cta"], CopyKey> = {
  confirm_spots: "listingHealthConfirmSpots",
  edit_fees: "listingHealthEdit",
  edit_ages: "listingHealthEdit",
  edit_hours: "listingHealthEdit",
  edit_photo: "listingHealthEdit",
  edit_license: "qualityCtaLicense",
  claim: "qualityCtaClaim",
  inbox: "qualityCtaInbox",
};

function jumpTo(anchor?: string) {
  if (!anchor) return;
  const el = document.getElementById(anchor);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const focusable = el.matches("input, textarea, button, select")
    ? el
    : el.querySelector<HTMLElement>("input, textarea, button, select");
  focusable?.focus();
}

export function QualityIssuesPanel({ item }: { item: Daycare }) {
  const { t } = useCopy();
  const breakdown = qualityBreakdown(item);
  const issues = breakdown.issues;

  return (
    <div className="mt-4 rounded-lg bg-bg p-4 text-sm ring-1 ring-border">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-medium">{t("qualityScoreTitle")}</p>
          <p className="mt-1 text-muted">{t("qualityScoreLead")}</p>
        </div>
        <p className="font-display text-3xl tabular-nums leading-none">
          {breakdown.total}
          <span className="ml-1 text-sm font-sans font-normal text-muted">/100</span>
        </p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-ok" style={{ width: `${breakdown.total}%` }} />
      </div>
      <p className="mt-2 text-xs text-subtle">
        {t("qualityTrustPts")}: {breakdown.trust} · {t("qualityCompletePts")}: {breakdown.completeness} ·{" "}
        {t("qualityFreshPts")}: {breakdown.freshness} · {t("qualityReviewPts")}: {breakdown.reviews} ·{" "}
        {t("qualityReplyPts")}: {breakdown.engagement}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {item.guestFavorite ? <GuestFavoriteBadge item={item} /> : null}
        {breakdown.eligibleForFavorite && !item.guestFavorite ? (
          <p className="text-xs text-muted">{t("qualityEligibleHidden")}</p>
        ) : null}
        {!breakdown.eligibleForFavorite ? <p className="text-xs text-muted">{t("qualityNotFavorite")}</p> : null}
      </div>
      {issues.length ? (
        <ul className="mt-3 space-y-2">
          {issues.map((issue) => (
            <li key={issue.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className={issue.severity === "info" ? "text-muted" : "text-fg"}>{t(ISSUE_KEY[issue.id])}</span>
              <IssueCta issue={issue} label={t(CTA_KEY[issue.cta])} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-subtle">{t("qualityNoIssues")}</p>
      )}
      <p className="mt-3 text-xs text-subtle">{t("qualitySoftDemote")}</p>
    </div>
  );
}

function IssueCta({ issue, label }: { issue: QualityIssue; label: string }) {
  if (issue.cta === "claim") {
    return (
      <Link to="/claim" className="rounded-full px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-border hover:bg-surface">
        {label}
      </Link>
    );
  }
  if (issue.cta === "inbox") {
    return (
      <Link to="/inbox" className="rounded-full px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-border hover:bg-surface">
        {label}
      </Link>
    );
  }
  if (issue.cta === "edit_license") {
    return (
      <Link
        to="/provider"
        search={{ desk: "licence" }}
        className="rounded-full px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-border hover:bg-surface"
      >
        {label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className="rounded-full px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-border hover:bg-surface"
      onClick={() => jumpTo(issue.anchor)}
    >
      {label}
    </button>
  );
}
