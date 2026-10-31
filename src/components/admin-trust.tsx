import { Link } from "@tanstack/react-router";
import { TrustSignals } from "@/components/trust-badge";
import type { TrustListing } from "@/lib/trust";
import { licenceCoveragePercent } from "@/lib/license-status";
import { adapterStatusHint, adapterStatusLabel, adapterStatusTone, JURISDICTIONS, type AdapterStatus } from "@/lib/province-registry";
import type { LicenceCoverageRow } from "@/lib/server/trust";
import type { AdminReportRow } from "@/lib/server/trust";
import { SafetyReviewQueue } from "@/components/safety-review-queue";

type JurisdictionRow = {
  code: string;
  nameEn: string;
  nameFr: string;
  registryUrl: string | null;
  subsidyUrl?: string | null;
  adapterStatus: string;
  adapterNotes: string;
  lastSyncAt?: string | null;
};

export function AdminTrustPanel({
  jurisdictions,
  reports,
  coverage = [],
}: {
  jurisdictions: JurisdictionRow[];
  reports: AdminReportRow[];
  coverage?: LicenceCoverageRow[];
}) {
  const rows = jurisdictions.length ? jurisdictions : JURISDICTIONS;
  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-2xl">Jurisdictions</h2>
        <p className="mt-1 text-sm text-muted">
          All Canadian provinces and territories. Manitoba can match a licence against the bundled KidEase catalogue. Ontario, Alberta, British Columbia, Saskatchewan, and Québec have documented adapter stubs that fail closed to operator manual review: not live registry matches. Other jurisdictions stay adapter stubs. This list does not pretend a scrape ran.
        </p>
        <ul className="mt-5 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
          {rows.map((j) => (
            <li key={j.code} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {j.nameEn}
                    <span className="ml-2 text-sm font-normal text-muted">{j.code}</span>
                  </p>
                  <p className="text-sm text-muted">{j.nameFr}</p>
                  <p className="mt-1 text-sm text-muted">{j.adapterNotes.replace(/^TODO:\s*/i, "")}</p>
                  <p className="mt-1 text-xs text-subtle">{adapterStatusHint((j.adapterStatus as AdapterStatus) || "stub")}</p>
                </div>
                <div className="text-right text-sm">
                  <span
                    className={
                      adapterStatusTone((j.adapterStatus as AdapterStatus) || "stub") === "ok"
                        ? "rounded-full bg-ok/15 px-2.5 py-1 text-xs text-ok"
                        : "rounded-full bg-warn/15 px-2.5 py-1 text-xs text-warn"
                    }
                  >
                    {adapterStatusLabel((j.adapterStatus as AdapterStatus) || "stub")}
                  </span>
                  {j.registryUrl ? (
                    <p className="mt-2">
                      <a href={j.registryUrl} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                        Official registry
                      </a>
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-subtle">Registry URL not stored: left null rather than guessed.</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-display text-2xl">Licence verified coverage</h2>
        <p className="mt-1 text-sm text-muted">
          Public listings whose licence was checked by KidEase staff or the centre, with a date on file. A catalogue match is not counted. This does not remove any listing.
        </p>
        <div className="mt-5 overflow-x-auto rounded-xl bg-surface ring-1 ring-border">
          <table className="w-full min-w-[20rem] text-sm">
            <thead className="bg-surface-2 text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Province</th>
                <th className="px-4 py-2 font-medium">Listings</th>
                <th className="px-4 py-2 font-medium">Verified</th>
                <th className="px-4 py-2 font-medium">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {coverage.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-muted" colSpan={4}>
                    No coverage rows yet.
                  </td>
                </tr>
              ) : (
                coverage.map((row) => {
                  const share = licenceCoveragePercent(row);
                  return (
                    <tr key={row.province}>
                      <td className="px-4 py-2 font-medium">{row.province}</td>
                      <td className="px-4 py-2 tabular-nums">{row.listings}</td>
                      <td className="px-4 py-2 tabular-nums">{row.verified}</td>
                      <td className="px-4 py-2 tabular-nums">{share == null ? "n/a" : `${share}%`}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2 className="font-display text-2xl">Listing reports</h2>
        <p className="mt-1 text-sm text-muted">Parents and guests can flag a listing. KidEase reviews the licence and claim: this is not an inspection score.</p>
        <ul className="mt-5 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
          {reports.length === 0 ? (
            <li className="px-5 py-8 text-center text-muted">No listing reports yet.</li>
          ) : (
            reports.map((r) => (
              <li key={r.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-sm text-muted">
                      {[r.city, r.province].filter(Boolean).join(", ")} · {r.reason}
                    </p>
                    {r.detail ? <p className="mt-1 text-sm">{r.detail}</p> : null}
                    <p className="mt-1 text-xs text-subtle">
                      {r.reporterName || "—"} · {r.reporterEmail || "no email"}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted">
                    <p>{new Date(r.createdAt).toLocaleString("en-CA")}</p>
                    <Link to="/daycare/$slug" params={{ slug: r.slug }} className="text-primary underline-offset-4 hover:underline">
                      View listing
                    </Link>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
      <SafetyReviewQueue />
    </div>
  );
}

export function AdminLicenseActions({
  item,
  busy,
  onReview,
  showSignals = true,
}: {
  item: {
    daycareId: string;
    licenseNumber?: string | null;
    licenseStatus?: string | null;
    registryMatchState?: string | null;
    licenseExpiry?: string | null;
    licensedCapacity?: number | null;
    licenseVerifiedAt?: string | null;
    staffScreeningAttested?: boolean;
    staffScreeningAttestedAt?: string | null;
    claimStatus?: string | null;
    claimedAt?: string | null;
    live?: boolean;
  };
  busy: boolean;
  onReview: (action: "matched" | "mismatch" | "expired" | "suspended" | "unverified") => void;
  /** Trust chips (payments, screening, claim) stay off the decision face unless asked. */
  showSignals?: boolean;
}) {
  const actions: { id: "matched" | "mismatch" | "expired" | "suspended" | "unverified"; label: string; tone?: string }[] = [
    { id: "matched", label: "Mark registry-matched" },
    { id: "mismatch", label: "Mark mismatch" },
    { id: "expired", label: "Mark expired", tone: "text-danger" },
    { id: "suspended", label: "Mark suspended", tone: "text-danger" },
    { id: "unverified", label: "Clear to unverified", tone: "text-muted" },
  ];
  const meta = [
    item.licenseNumber || "not on file",
    item.licenseExpiry ? `exp ${item.licenseExpiry}` : "",
    item.licensedCapacity ? `cap ${item.licensedCapacity}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="overflow-hidden rounded-xl bg-bg ring-1 ring-border" data-ke="admin-registry-menu">
      {showSignals ? (
        <div className="border-b border-border px-3 py-3">
          <TrustSignals item={item as TrustListing} surface="admin" compact />
        </div>
      ) : null}
      <p className="border-b border-border px-3 py-2.5 text-sm text-muted">Licence {meta}</p>
      <div className="divide-y divide-border">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={busy}
            onClick={() => onReview(action.id)}
            className={`flex min-h-11 w-full items-center justify-between px-3 text-left text-sm hover:bg-surface disabled:opacity-50 ${action.tone || "text-fg"}`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
