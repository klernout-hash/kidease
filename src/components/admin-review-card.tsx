import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
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
import { licenseDocHref, openPrivateDocHref, postPrivateDocForm } from "@/lib/private-docs";
import { isPrivateDocTooBig } from "@/lib/upload-limits";
import { UploadLimitHint } from "@/components/upload-limit-hint";
import { useReauthPrompt, withReauth } from "@/components/reauth-dialog";
import { signedPdfPath } from "@/lib/docusign-packs";
import { approvalHealthSummary, canOfferApprove, licenceFileMissingCopy, type ApprovalHealth } from "@/lib/approve-live";
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
    <dl className="overflow-hidden rounded-lg bg-bg ring-1 ring-border">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-1 gap-0.5 border-t border-border px-2.5 py-1.5 first:border-t-0 sm:grid-cols-[8.5rem_1fr] sm:items-baseline sm:gap-3">
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

function LicenceAttachControl({
  daycareId,
  hasFile,
  disabled,
  boxed,
  onAttached,
}: {
  daycareId: string;
  hasFile: boolean;
  disabled: boolean;
  boxed: boolean;
  onAttached: () => void;
}) {
  const { t } = useCopy();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const reauth = useReauthPrompt();

  return (
    <>
      <label className={cn("block px-2.5 py-2 text-sm", boxed && "border-t border-border")}>
        <span className="font-medium text-fg">{hasFile ? "Replace licence document" : "Attach licence document"}</span>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="mt-1.5 block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary"
          disabled={disabled || saving}
          data-ke="admin-licence-upload"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file || saving) return;
            if (isPrivateDocTooBig(file.size)) {
              const message = t("uploadDocTooBig");
              setError(message);
              toast.error(message);
              return;
            }
            setError(null);
            setSaving(true);
            void withReauth(() => postPrivateDocForm(licenseDocHref(daycareId), {}, file), reauth.prompt)
              .then(() => {
                toast.success("Licence document saved.");
                onAttached();
              })
              .catch((err) => {
                const message = err instanceof Error ? err.message : t("uploadDocTooBig");
                setError(message);
                toast.error(message);
              })
              .finally(() => setSaving(false));
          }}
        />
        <UploadLimitHint hint={saving ? "Saving licence document…" : t("uploadDocHint")} error={error} />
      </label>
      {reauth.dialog}
    </>
  );
}

function ReviewDocuments({
  centre,
  locked,
  onAttached,
  onStraighten,
}: {
  centre: AdminCentreRow;
  locked: boolean;
  onAttached?: () => void;
  onStraighten?: (daycareId: string) => Promise<{ polished: number; keptOriginal: number; skipped: number }>;
}) {
  const [attached, setAttached] = useState(false);
  useEffect(() => {
    setAttached(false);
  }, [centre.daycareId, centre.licensePhoto]);
  const hasFile = Boolean((centre.licensePhoto || "").trim()) || attached;
  const licenceMissing = licenceFileMissingCopy({
    licenseNumber: centre.licenseNumber,
    daycareId: centre.daycareId,
    storefrontPresent: Boolean(centre.storefrontPhoto),
  });
  const bare = !hasFile && !centre.storefrontPhoto;
  const upload = (
    <LicenceAttachControl
      daycareId={centre.daycareId}
      hasFile={hasFile}
      disabled={locked}
      boxed={!bare}
      onAttached={() => {
        setAttached(true);
        onAttached?.();
      }}
    />
  );
  return (
    <div className={bare ? "space-y-2" : "overflow-hidden rounded-lg bg-bg ring-1 ring-border"}>
      {bare ? (
        <p className="ke-empty text-left">
          {licenceFileMissingCopy({
            licenseNumber: centre.licenseNumber,
            daycareId: centre.daycareId,
          })}
        </p>
      ) : hasFile ? (
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between px-3 text-left text-sm font-medium text-primary hover:bg-surface"
          onClick={() => openPrivateDocHref(licenseDocHref(centre.daycareId))}
        >
          View licence document
        </button>
      ) : (
        <p className="px-2.5 py-2 text-sm text-muted">{licenceMissing}</p>
      )}
      {upload}
      {bare ? null : centre.storefrontPhoto ? (
        <figure className="border-t border-border p-2">
          <img
            src={centre.storefrontPhoto}
            alt={`Storefront for ${centre.name}`}
            className="h-16 w-full max-w-[12rem] rounded-md object-cover ring-1 ring-border"
          />
          <figcaption className="mt-1 text-[11px] text-subtle">Storefront</figcaption>
        </figure>
      ) : (
        <p className="border-t border-border px-2.5 py-2 text-sm text-muted">No storefront photo uploaded yet.</p>
      )}
      <StraightenListingPhoto
        daycareId={centre.daycareId}
        storefront={centre.storefrontPhoto}
        disabled={locked}
        onStraighten={onStraighten}
      />
    </div>
  );
}

function StraightenListingPhoto({
  daycareId,
  storefront,
  disabled,
  onStraighten,
}: {
  daycareId: string;
  storefront: string | null;
  disabled: boolean;
  onStraighten?: (daycareId: string) => Promise<{ polished: number; keptOriginal: number; skipped: number }>;
}) {
  const [busy, setBusy] = useState(false);
  if (!onStraighten || !storefront?.startsWith("data:image/")) return null;
  return (
    <div className="border-t border-border px-2.5 py-2" data-ke="admin-straighten-photo">
      <Button
        type="button"
        variant="secondary"
        className="h-11 w-full sm:w-auto"
        disabled={disabled || busy}
        onClick={() => {
          setBusy(true);
          void onStraighten(daycareId)
            .then((res) => {
              if (res.polished > 0) {
                toast.success(
                  res.polished === 1 ? "Listing photo straightened." : `Straightened ${res.polished} listing photos.`,
                );
              } else if (res.keptOriginal > 0) {
                toast.message("Photo kept as uploaded. Straighten did not produce a better frame.");
              } else {
                toast.message("No centre-uploaded listing photo to straighten.");
              }
            })
            .catch((err) => {
              toast.error(err instanceof Error ? err.message : "Could not straighten that photo.");
            })
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Straightening…" : "Straighten photo"}
      </Button>
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
      className="ke-panel px-4 py-5 text-center"
      data-ke={marker === "empty" ? "admin-review-empty" : "admin-review-error"}
      role={tone === "danger" ? "alert" : undefined}
    >
      <p className="font-display text-lg tracking-tight">{title}</p>
      <p className={cn("mx-auto mt-1 max-w-sm text-sm leading-5", tone === "danger" ? "text-danger" : "text-muted")}>{body}</p>
    </div>
  );
}

export function ApprovalHealthNotice({ health }: { health: ApprovalHealth }) {
  const summary = approvalHealthSummary(health);
  return (
    <div
      className={cn(
        "rounded-xl px-3 py-2.5 ring-1",
        health.ok ? "bg-soft text-fg ring-primary/20" : "bg-surface text-fg ring-danger/30",
      )}
      data-ke="approval-health"
      data-ke-approval-ok={health.ok ? "yes" : "no"}
      role={health.ok ? "status" : "alert"}
    >
      <p className="font-display text-base tracking-tight">{summary.title}</p>
      <p className={cn("mt-0.5 text-sm leading-5", health.ok ? "text-fg" : "text-danger")}>{summary.body}</p>
      <ul className="mt-1.5 space-y-0.5 text-sm">
        {health.checks.map((check) => (
          <li key={check.id} data-ke-approval-check={check.id} data-ke-check-ok={check.ok ? "yes" : "no"}>
            <span className={check.ok ? "text-ok" : "font-medium text-danger"}>{check.ok ? "Passed" : "Failed"}</span>
            <span className="text-muted"> · {check.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdminReviewLoading() {
  return (
    <div className="space-y-2" data-ke="admin-review-loading" aria-busy="true">
      {[0, 1].map((row) => (
        <div key={row} className="ke-panel px-3 py-2.5">
          <div className="h-5 w-44 animate-pulse rounded-md bg-surface-2" />
          <div className="mt-2 h-3.5 w-32 animate-pulse rounded-md bg-surface-2" />
          <div className="mt-3 grid grid-cols-3 gap-3 border-y border-border py-2">
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
  onLicenceUploaded,
  onStraighten,
  mode = "decision",
}: {
  centre: AdminCentreRow;
  packs?: AdminPackRow[];
  busy: string | null;
  onDecide: (id: string, decision: Decision) => void;
  onLicense: (id: string, action: LicenseReviewAction) => void;
  onLicenceUploaded?: () => void;
  onStraighten?: (daycareId: string) => Promise<{ polished: number; keptOriginal: number; skipped: number }>;
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
      className="ke-panel px-3 py-2.5 shadow-card sm:px-3.5"
      data-ke="admin-review-card"
      data-ke-review-mode={mode}
      data-ke-claim-kind={kind.id}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg leading-tight tracking-tight">{centre.name}</h3>
          <p className="mt-0.5 text-sm text-muted">{place || "Location not on file"}</p>
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

      <p className="mt-2 text-sm leading-5">
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

      <dl className="mt-3 grid grid-cols-1 divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0" data-ke="admin-review-facts">
        {facts.map((fact) => (
          <div key={fact.id} className="py-1.5 sm:px-3 sm:first:pl-0 sm:last:pr-0">
            <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">{fact.label}</dt>
            <dd className={cn("mt-0.5 text-sm", FACT_TONE[fact.tone])} data-ke-fact={fact.id}>
              {fact.status}
            </dd>
          </div>
        ))}
      </dl>

      {documentsOnFace ? (
        <div className="mt-3" data-ke="admin-review-documents">
          <SectionLabel>Files</SectionLabel>
          <div className="mt-2">
            <ReviewDocuments centre={centre} locked={locked} onAttached={onLicenceUploaded} onStraighten={onStraighten} />
          </div>
        </div>
      ) : null}

      {licenceToolsOnFace ? (
        <div className="mt-3">
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

      <div className="mt-3" data-ke="admin-review-actions">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">Decision</p>
        <div className="mt-1.5 flex flex-col gap-1.5 sm:flex-row sm:items-center" role="group" aria-label={`Decision for ${centre.name}`}>
          {canOfferApprove(status) ? (
            <Button className="w-full sm:w-auto sm:min-w-36" disabled={locked} onClick={() => onDecide(centre.daycareId, "approve")}>
              Approve
            </Button>
          ) : (
            <p className="text-sm font-medium text-primary" data-ke="approve-closed">
              Live — approval is closed
            </p>
          )}
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

      <details className="mt-3 border-t border-border pt-1" data-ke="admin-review-more">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg text-sm marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
          <span className="font-medium">Details</span>
          <span className="text-subtle">Files, trust, and contracts</span>
        </summary>
        <div className="space-y-3 pb-1 pt-2">
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
                <ReviewDocuments centre={centre} locked={locked} onAttached={onLicenceUploaded} onStraighten={onStraighten} />
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
  onLicenceUploaded,
  onStraighten,
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
  onLicenceUploaded?: () => void;
  onStraighten?: (daycareId: string) => Promise<{ polished: number; keptOriginal: number; skipped: number }>;
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
    <section className="mt-6" data-ke="admin-stat-list" data-ke-stat-list={stat}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-subtle">{copy.eyebrow}</p>
          <h2 className="mt-1 font-display text-xl tracking-tight">{copy.title}</h2>
          {stat === "waiting" ? (
            <p className="mt-1.5 text-sm leading-5 text-muted">
              Daycares in this queue are waiting for a decision. Read the licence, screening, and photos, then approve, keep waiting, or decline.
            </p>
          ) : null}
        </div>
        <p className="text-sm tabular-nums text-muted">{countLabel}</p>
      </div>
      <div className="mt-3">
        {loading ? (
          <AdminReviewLoading />
        ) : unavailable ? (
          <AdminReviewNotice title="Queue unavailable" body={error || "This list could not be loaded."} tone="danger" marker="error" />
        ) : rows.length === 0 ? (
          <AdminReviewNotice title={copy.caughtUp || "None"} body={copy.empty} marker="empty" />
        ) : (
          <ul className="space-y-2">
            {rows.map((centre) => (
              <li key={centre.daycareId}>
                <AdminReviewCard
                  centre={centre}
                  packs={contracts.find((row) => row.daycareId === centre.daycareId)?.packs}
                  busy={busy}
                  onDecide={onDecide}
                  onLicense={onLicense}
                  onLicenceUploaded={onLicenceUploaded}
                  onStraighten={onStraighten}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
