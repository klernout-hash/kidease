import { Link } from "@tanstack/react-router";
import { AdminLicenseActions } from "@/components/admin-trust";
import { CentrePackChips } from "@/components/admin-contracts";
import { ListingStatusBadge } from "@/components/listing-status-badge";
import { TrustSignals } from "@/components/trust-badge";
import { Button } from "@/components/ui/button";
import {
  reviewCardLayout,
  reviewClaimKind,
  reviewDecisionFacts,
  type ReviewCardMode,
  type ReviewFactTone,
} from "@/lib/admin-review-card";
import { ADMIN_CENTRE_STAT_COPY, type AdminCentreListStat } from "@/lib/admin-stat-filter";
import { licenseDocHref, openPrivateDocHref } from "@/lib/private-docs";
import { listingStatusFromClaim } from "@/lib/listing-status";
import type { AdminCentreRow, Decision } from "@/lib/server/admin-centres";
import type { AdminContractRow, AdminPackRow } from "@/lib/server/contracts";
import type { LicenseReviewAction } from "@/lib/server/trust";
import type { TrustListing } from "@/lib/trust";
import { cn } from "@/lib/utils";

const FACT_TONE: Record<ReviewFactTone, string> = {
  ready: "text-ok",
  missing: "text-warn",
  attention: "text-danger",
};

function formatWhen(value: string | null | undefined) {
  if (!value) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleString("en-CA", {
    timeZone: "America/Winnipeg",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function ReviewDocuments({ centre }: { centre: AdminCentreRow }) {
  if (!centre.licensePhoto && !centre.storefrontPhoto) {
    return <p className="text-sm text-muted">No licence or storefront file on this claim yet.</p>;
  }
  return (
    <div className="flex flex-wrap items-start gap-4">
      {centre.licensePhoto ? (
        <div className="space-y-1">
          <button
            type="button"
            className="rounded-lg bg-bg px-3 py-2 text-left text-sm font-medium text-primary ring-1 ring-border hover:underline"
            onClick={() => openPrivateDocHref(licenseDocHref(centre.daycareId))}
          >
            View licence document
          </button>
          <p className="text-[11px] text-subtle">Licence file</p>
        </div>
      ) : (
        <p className="text-sm text-muted">No licence file uploaded yet.</p>
      )}
      {centre.storefrontPhoto ? (
        <figure className="space-y-1">
          <img
            src={centre.storefrontPhoto}
            alt={`Storefront for ${centre.name}`}
            className="h-24 w-36 rounded-lg object-cover ring-1 ring-border"
          />
          <figcaption className="text-[11px] text-subtle">Storefront</figcaption>
        </figure>
      ) : (
        <p className="text-sm text-muted">No storefront photo uploaded yet.</p>
      )}
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

  return (
    <article
      className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-border sm:p-5"
      data-ke="admin-review-card"
      data-ke-review-mode={mode}
      data-ke-claim-kind={kind.id}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-xl leading-tight">{centre.name}</h3>
          <p className="mt-1 text-sm text-muted">{place || "Location not on file"}</p>
          <p className="mt-0.5 text-sm text-fg">
            {contactName}
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status !== "waiting" ? (
            <ListingStatusBadge claimStatus={centre.claimStatus} live={centre.live} claimedAt={centre.claimedAt} />
          ) : null}
          <span className="rounded-full bg-soft px-2.5 py-1 text-xs font-medium text-primary">{kind.label}</span>
          {centre.isTest ? (
            <span className="rounded-full bg-warn/15 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-warn">
              QA test
            </span>
          ) : null}
        </div>
      </header>

      <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3" data-ke="admin-review-facts">
        {facts.map((fact) => (
          <div key={fact.id} className="rounded-xl bg-bg px-3 py-2.5">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">{fact.label}</dt>
            <dd className={cn("mt-1 text-sm font-medium", FACT_TONE[fact.tone])} data-ke-fact={fact.id}>
              {fact.status}
            </dd>
          </div>
        ))}
      </dl>

      {documentsOnFace ? (
        <div className="mt-4" data-ke="admin-review-documents">
          <ReviewDocuments centre={centre} />
        </div>
      ) : null}

      {licenceToolsOnFace ? (
        <AdminLicenseActions
          item={centre}
          busy={locked}
          showSignals={false}
          onReview={(action) => onLicense(centre.daycareId, action)}
        />
      ) : null}

      <div
        className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3"
        data-ke="admin-review-actions"
        role="group"
        aria-label={`Decision for ${centre.name}`}
      >
        <Button className="w-full" disabled={locked} onClick={() => onDecide(centre.daycareId, "approve")}>
          Approve
        </Button>
        <Button
          variant="secondary"
          className="w-full"
          disabled={locked || status === "declined"}
          onClick={() => onDecide(centre.daycareId, "waiting")}
        >
          {status === "waiting" ? "Keep waiting" : "Waiting"}
        </Button>
        <Button
          variant={status === "declined" ? "danger" : "secondary"}
          className={cn("w-full", status === "declined" ? "" : "text-danger")}
          disabled={locked || status === "declined"}
          onClick={() => onDecide(centre.daycareId, "decline")}
        >
          Decline
        </Button>
      </div>

      <details className="mt-4 border-t border-border pt-3" data-ke="admin-review-more">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-1 text-sm marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
          <span className="font-medium text-primary">More</span>
          <span className="text-xs text-subtle">Contracts, payments, registry</span>
        </summary>
        <div className="mt-4 space-y-4">
          {centre.address ? <p className="text-sm text-muted">{centre.address}</p> : null}
          {centre.phone ? <p className="text-sm text-muted">{centre.phone}</p> : null}
          {reviewed ? (
            <p className="text-xs text-subtle">
              Reviewed {reviewed}
              {centre.reviewNote ? ` · ${centre.reviewNote}` : ""}
            </p>
          ) : null}
          {documentsOnFace ? null : (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">Files</p>
              <div className="mt-2">
                <ReviewDocuments centre={centre} />
              </div>
            </div>
          )}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">Trust</p>
            <div className="mt-2">
              <TrustSignals item={centre as TrustListing} surface="admin" compact />
            </div>
          </div>
          {packs?.length ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">Contracts</p>
              <div className="mt-2">
                <CentrePackChips packs={packs} />
              </div>
            </div>
          ) : null}
          {licenceToolsOnFace ? null : (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">Registry</p>
              <AdminLicenseActions
                item={centre}
                busy={locked}
                showSignals={false}
                onReview={(action) => onLicense(centre.daycareId, action)}
              />
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
  error,
  contracts,
  busy,
  onDecide,
  onLicense,
}: {
  stat: AdminCentreListStat;
  rows: AdminCentreRow[];
  unavailable: boolean;
  error: string | null;
  contracts: AdminContractRow[];
  busy: string | null;
  onDecide: (id: string, decision: Decision) => void;
  onLicense: (id: string, action: LicenseReviewAction) => void;
}) {
  const copy = ADMIN_CENTRE_STAT_COPY[stat];
  const countLabel = unavailable
    ? "Unavailable"
    : rows.length === 0
      ? copy.caughtUp || "None"
      : stat === "waiting"
        ? `${rows.length} daycare${rows.length === 1 ? "" : "s"}`
        : `${rows.length} to review`;
  const mode: ReviewCardMode = "decision";

  return (
    <section className="mt-8" data-ke="admin-stat-list" data-ke-stat-list={stat}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">{copy.eyebrow}</p>
          <h2 className="mt-1 font-display text-2xl">{copy.title}</h2>
        </div>
        <p className="text-sm text-muted">{countLabel}</p>
      </div>
      {stat === "waiting" ? (
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Daycares in this queue are waiting for a decision. Licence, screening, and photos are the status on the card. Contracts, payments, and registry tools are under More.
        </p>
      ) : null}
      {unavailable ? (
        <p className="mt-5 rounded-2xl bg-surface px-5 py-8 text-sm text-danger ring-1 ring-danger/20" role="alert">
          {error}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-surface px-5 py-8 text-sm text-muted ring-1 ring-border">{copy.empty}</p>
      ) : (
        <ul className="mt-5 space-y-4">
          {rows.map((centre) => (
            <li key={centre.daycareId}>
              <AdminReviewCard
                centre={centre}
                packs={contracts.find((row) => row.daycareId === centre.daycareId)?.packs}
                busy={busy}
                onDecide={onDecide}
                onLicense={onLicense}
                mode={mode}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
