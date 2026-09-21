import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AdminLicenseActions } from "@/components/admin-trust";
import { ListingStatusBadge } from "@/components/listing-status-badge";
import { Button } from "@/components/ui/button";
import { ds } from "@/lib/docusign-copy";
import {
  reviewCardLayout,
  reviewClaimKind,
  reviewDecisionFacts,
  trustDetailRow,
  type ReviewCardMode,
  type ReviewFactTone,
} from "@/lib/admin-review-card";
import { ADMIN_CENTRE_STAT_COPY, type AdminCentreListStat } from "@/lib/admin-stat-filter";
import { licenseDocHref, openPrivateDocHref } from "@/lib/private-docs";
import { signedPdfPath } from "@/lib/docusign-packs";
import { listingStatusFromClaim } from "@/lib/listing-status";
import type { AdminCentreRow, Decision } from "@/lib/server/admin-centres";
import type { AdminContractRow, AdminPackRow } from "@/lib/server/contracts";
import type { LicenseReviewAction } from "@/lib/server/trust";
import { trustBadgesFor, type TrustListing } from "@/lib/trust";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

const FACT_TONE: Record<ReviewFactTone, string> = {
  ready: "font-medium text-fg",
  missing: "text-muted",
  attention: "font-medium text-danger",
};

function formatWhen(value: string | null | undefined) {
  if (!value) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleString("en-CA", {
    timeZone: "America/Winnipeg",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DetailTable({ rows }: { rows: { label: string; value: string; extra?: ReactNode }[] }) {
  if (!rows.length) return null;
  return (
    <dl className="overflow-hidden rounded-xl bg-bg ring-1 ring-border">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-1 gap-0.5 border-t border-border px-3 py-2.5 first:border-t-0 sm:grid-cols-[9.5rem_1fr] sm:items-baseline sm:gap-4">
          <dt className="text-sm text-muted">{row.label}</dt>
          <dd className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm text-fg">
            <span>{row.value}</span>
            {row.extra}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ReviewDocuments({ centre }: { centre: AdminCentreRow }) {
  if (!centre.licensePhoto && !centre.storefrontPhoto) {
    return <p className="rounded-xl bg-bg px-3 py-3 text-sm text-muted ring-1 ring-border">No licence or storefront file on this claim yet.</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl bg-bg ring-1 ring-border">
      {centre.licensePhoto ? (
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between px-3 text-left text-sm font-medium text-primary hover:bg-surface"
          onClick={() => openPrivateDocHref(licenseDocHref(centre.daycareId))}
        >
          View licence document
        </button>
      ) : (
        <p className="px-3 py-3 text-sm text-muted">No licence file uploaded yet.</p>
      )}
      {centre.storefrontPhoto ? (
        <figure className="border-t border-border p-3">
          <img
            src={centre.storefrontPhoto}
            alt={`Storefront for ${centre.name}`}
            className="h-28 w-full max-w-xs rounded-lg object-cover ring-1 ring-border"
          />
          <figcaption className="mt-2 text-xs text-subtle">Storefront</figcaption>
        </figure>
      ) : (
        <p className="border-t border-border px-3 py-3 text-sm text-muted">No storefront photo uploaded yet.</p>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <h4 className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">{children}</h4>;
}

export function AdminReviewNotice({
  title,
  body,
  tone = "neutral",
  marker,
}: {
  title: string;
  body: string;
  tone?: "neutral" | "danger";
  marker: "empty" | "error";
}) {
  return (
    <div
      className="rounded-2xl bg-surface px-6 py-12 text-center ring-1 ring-border"
      data-ke={marker === "empty" ? "admin-review-empty" : "admin-review-error"}
      role={tone === "danger" ? "alert" : undefined}
    >
      <p className="font-display text-2xl tracking-tight">{title}</p>
      <p className={cn("mx-auto mt-2 max-w-sm text-sm leading-6", tone === "danger" ? "text-danger" : "text-muted")}>{body}</p>
    </div>
  );
}

export function AdminReviewLoading() {
  return (
    <div className="space-y-4" data-ke="admin-review-loading" aria-busy="true">
      {[0, 1].map((row) => (
        <div key={row} className="rounded-2xl bg-surface p-5 ring-1 ring-border sm:p-6">
          <div className="h-7 w-52 animate-pulse rounded-md bg-surface-2" />
          <div className="mt-3 h-4 w-36 animate-pulse rounded-md bg-surface-2" />
          <div className="mt-6 grid grid-cols-3 gap-4 border-y border-border py-4">
            <div className="h-8 animate-pulse rounded-md bg-surface-2" />
            <div className="h-8 animate-pulse rounded-md bg-surface-2" />
            <div className="h-8 animate-pulse rounded-md bg-surface-2" />
          </div>
          <div className="mt-4 h-11 w-full animate-pulse rounded-full bg-surface-2 sm:w-40" />
        </div>
      ))}
      <p className="sr-only">Loading daycares waiting for review</p>
    </div>
  );
}

export function AdminReviewCard({
  centre,
  packs,
  busy,
  onDecide,
  onLicense,
  mode = "decision",
}: {
  centre: AdminCentreRow;
  packs?: AdminPackRow[];
  busy: string | null;
  onDecide: (id: string, decision: Decision) => void;
  onLicense: (id: string, action: LicenseReviewAction) => void;
  mode?: ReviewCardMode;
}) {
  const { t, locale } = useCopy();
  const layout = reviewCardLayout(mode);
  const kind = reviewClaimKind(centre);
  const facts = reviewDecisionFacts(centre);
  const status = listingStatusFromClaim(centre.claimStatus, {
    live: centre.live,
    claimedAt: centre.claimedAt,
  });
  const locked = busy !== null;
  const place = [centre.city, centre.province].filter(Boolean).join(", ");
  const contactName = centre.providerName?.trim() || "No contact name";
  const email = centre.providerEmail || centre.contactEmail || "";
  const submitted = formatWhen(centre.submittedAt);
  const reviewed = formatWhen(centre.reviewedAt);
  const documentsOnFace = layout.face.includes("documents");
  const licenceToolsOnFace = layout.face.includes("licence-tools");
  const trustRows = trustBadgesFor(centre as TrustListing, "admin").map((badge) =>
    trustDetailRow(badge.id, t(badge.labelKey)),
  );
  const contractRows = (packs || []).map((pack) => {
    const label = pack.packKind === "enrolment_pack" ? ds(locale, "packEnrolment") : ds(locale, "packAgreement");
    const value = pack.status === "none" ? ds(locale, "statusNone") : pack.status;
    const extra =
      pack.hasSignedPdf && pack.contractId ? (
        <a className="text-sm font-medium text-primary underline-offset-4 hover:underline" href={signedPdfPath(pack.contractId)}>
          PDF
        </a>
      ) : null;
    return { label, value, extra };
  });

  return (
    <article
      className="rounded-2xl bg-surface px-5 py-5 shadow-card ring-1 ring-border sm:px-6 sm:py-6"
      data-ke="admin-review-card"
      data-ke-review-mode={mode}
      data-ke-claim-kind={kind.id}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-display text-[1.65rem] leading-none tracking-tight">{centre.name}</h3>
          <p className="mt-2 text-sm text-muted">{place || "Location not on file"}</p>
        </div>
        <div className="shrink-0 pt-1 text-right">
          <p className="text-xs font-medium tracking-wide text-primary">{kind.label}</p>
          {status !== "waiting" ? (
            <div className="mt-2">
              <ListingStatusBadge claimStatus={centre.claimStatus} live={centre.live} claimedAt={centre.claimedAt} />
            </div>
          ) : null}
          {centre.isTest ? <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-warn">QA test</p> : null}
        </div>
      </header>

      <p className="mt-4 text-sm leading-6">
        <span className="font-medium">{contactName}</span>
        <span className="text-muted"> · </span>
        {email ? (
          <a href={`mailto:${email}`} className="text-primary underline-offset-4 hover:underline">
            {email}
          </a>
        ) : (
          <span className="text-muted">No email on file</span>
        )}
      </p>
      {submitted ? <p className="mt-1 text-xs text-subtle">Submitted {submitted}</p> : null}

      <dl className="mt-6 grid grid-cols-1 divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0" data-ke="admin-review-facts">
        {facts.map((fact) => (
          <div key={fact.id} className="py-3 sm:px-4 sm:py-3.5 sm:first:pl-0 sm:last:pr-0">
            <dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">{fact.label}</dt>
            <dd className={cn("mt-1 text-sm", FACT_TONE[fact.tone])} data-ke-fact={fact.id}>
              {fact.status}
            </dd>
          </div>
        ))}
      </dl>

      {documentsOnFace ? (
        <div className="mt-6" data-ke="admin-review-documents">
          <SectionLabel>Files</SectionLabel>
          <div className="mt-2">
            <ReviewDocuments centre={centre} />
          </div>
        </div>
      ) : null}

      {licenceToolsOnFace ? (
        <div className="mt-6">
          <SectionLabel>Registry</SectionLabel>
          <div className="mt-2">
            <AdminLicenseActions
              item={centre}
              busy={locked}
              showSignals={false}
              onReview={(action) => onLicense(centre.daycareId, action)}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-6" data-ke="admin-review-actions">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">Decision</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center" role="group" aria-label={`Decision for ${centre.name}`}>
          <Button className="w-full sm:w-auto sm:min-w-36" disabled={locked} onClick={() => onDecide(centre.daycareId, "approve")}>
            Approve
          </Button>
          <Button
            variant="secondary"
            className="w-full sm:w-auto sm:min-w-36"
            disabled={locked || status === "declined"}
            onClick={() => onDecide(centre.daycareId, "waiting")}
          >
            {status === "waiting" ? "Keep waiting" : "Waiting"}
          </Button>
          <Button
            variant={status === "declined" ? "danger" : "secondary"}
            className={cn("w-full sm:ml-auto sm:w-auto sm:min-w-28", status === "declined" ? "" : "text-danger")}
            disabled={locked || status === "declined"}
            onClick={() => onDecide(centre.daycareId, "decline")}
          >
            Decline
          </Button>
        </div>
      </div>

      <details className="mt-5 border-t border-border pt-2" data-ke="admin-review-more">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg text-sm marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
          <span className="font-medium">Details</span>
          <span className="text-subtle">Files, trust, and contracts</span>
        </summary>
        <div className="space-y-6 pb-1 pt-4">
          {centre.address || centre.phone || reviewed ? (
            <div className="space-y-1 text-sm leading-6 text-muted">
              {centre.address ? <p>{centre.address}</p> : null}
              {centre.phone ? <p>{centre.phone}</p> : null}
              {reviewed ? (
                <p className="text-xs text-subtle">
                  Reviewed {reviewed}
                  {centre.reviewNote ? ` · ${centre.reviewNote}` : ""}
                </p>
              ) : null}
            </div>
          ) : null}
          {documentsOnFace ? null : (
            <div>
              <SectionLabel>Files</SectionLabel>
              <div className="mt-2">
                <ReviewDocuments centre={centre} />
              </div>
            </div>
          )}
          <div data-ke="admin-review-trust">
            <SectionLabel>Trust</SectionLabel>
            <div className="mt-2">
              <DetailTable rows={trustRows} />
            </div>
          </div>
          <div data-ke="admin-review-contracts">
            <SectionLabel>Contracts</SectionLabel>
            <div className="mt-2">
              {contractRows.length ? (
                <DetailTable rows={contractRows} />
              ) : (
                <p className="text-sm text-muted">No contract packs on this centre.</p>
              )}
            </div>
          </div>
          {licenceToolsOnFace ? null : (
            <div>
              <SectionLabel>Registry</SectionLabel>
              <div className="mt-2">
                <AdminLicenseActions
                  item={centre}
                  busy={locked}
                  showSignals={false}
                  onReview={(action) => onLicense(centre.daycareId, action)}
                />
              </div>
            </div>
          )}
          <p>
            <Link
              to="/daycare/$slug"
              params={{ slug: centre.slug }}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              View listing
            </Link>
          </p>
        </div>
      </details>
    </article>
  );
}

export function AdminCentreStatList({
  stat,
  rows,
  unavailable,
  loading,
  error,
  contracts,
  busy,
  onDecide,
  onLicense,
}: {
  stat: AdminCentreListStat;
  rows: AdminCentreRow[];
  unavailable: boolean;
  loading?: boolean;
  error: string | null;
  contracts: AdminContractRow[];
  busy: string | null;
  onDecide: (id: string, decision: Decision) => void;
  onLicense: (id: string, action: LicenseReviewAction) => void;
}) {
  const copy = ADMIN_CENTRE_STAT_COPY[stat];
  const countLabel = loading || unavailable
    ? "—"
    : rows.length === 0
      ? copy.caughtUp || "None"
      : stat === "waiting"
        ? `${rows.length} daycare${rows.length === 1 ? "" : "s"}`
        : `${rows.length} to review`;

  return (
    <section className="mt-10" data-ke="admin-stat-list" data-ke-stat-list={stat}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">{copy.eyebrow}</p>
          <h2 className="mt-2 font-display text-3xl tracking-tight">{copy.title}</h2>
          {stat === "waiting" ? (
            <p className="mt-3 text-sm leading-6 text-muted">
              Daycares in this queue are waiting for a decision. Read the licence, screening, and photos, then approve, keep waiting, or decline.
            </p>
          ) : null}
        </div>
        <p className="text-sm tabular-nums text-muted">{countLabel}</p>
      </div>
      <div className="mt-6">
        {loading ? (
          <AdminReviewLoading />
        ) : unavailable ? (
          <AdminReviewNotice title="Queue unavailable" body={error || "This list could not be loaded."} tone="danger" marker="error" />
        ) : rows.length === 0 ? (
          <AdminReviewNotice title={copy.caughtUp || "None"} body={copy.empty} marker="empty" />
        ) : (
          <ul className="space-y-4">
            {rows.map((centre) => (
              <li key={centre.daycareId}>
                <AdminReviewCard
                  centre={centre}
                  packs={contracts.find((row) => row.daycareId === centre.daycareId)?.packs}
                  busy={busy}
                  onDecide={onDecide}
                  onLicense={onLicense}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
