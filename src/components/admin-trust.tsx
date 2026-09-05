import { Link } from "@tanstack/react-router";
import { TrustSignals } from "@/components/trust-badge";
import type { TrustListing } from "@/lib/trust";
import { adapterStatusLabel, JURISDICTIONS, type AdapterStatus } from "@/lib/province-registry";
import type { AdminReportRow } from "@/lib/server/trust";

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
}: {
  jurisdictions: JurisdictionRow[];
  reports: AdminReportRow[];
}) {
  const rows = jurisdictions.length ? jurisdictions : JURISDICTIONS;
  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-2xl">Jurisdictions</h2>
        <p className="mt-1 text-sm text-muted">
          All Canadian provinces and territories. Adapters are stubs except Manitoba manual review. Live scrapers are a follow-up — this list does not pretend a sync ran.
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
                  <p className="mt-1 text-sm text-muted">{j.adapterNotes}</p>
                </div>
                <div className="text-right text-sm">
                  <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted">
                    {adapterStatusLabel((j.adapterStatus as AdapterStatus) || "stub")}
                  </span>
                  {j.registryUrl ? (
                    <p className="mt-2">
                      <a href={j.registryUrl} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                        Official registry
                      </a>
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-subtle">Registry URL not stored — left null rather than guessed.</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="font-display text-2xl">Listing reports</h2>
        <p className="mt-1 text-sm text-muted">Parents and guests can flag a listing. KidEase reviews the licence and claim — this is not an inspection score.</p>
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
    </div>
  );
}

export function AdminLicenseActions({
  item,
  busy,
  onReview,
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
}) {
  return (
    <div className="mt-3 space-y-2">
      <TrustSignals item={item as TrustListing} surface="admin" compact />
      <p className="text-xs text-muted">
        Licence {item.licenseNumber || "not on file"}
        {item.licenseExpiry ? ` · exp ${item.licenseExpiry}` : ""}
        {item.licensedCapacity ? ` · cap ${item.licensedCapacity}` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => onReview("matched")} className="rounded-full bg-ok/15 px-3 py-1.5 text-xs text-ok disabled:opacity-50">
          Mark registry-matched
        </button>
        <button type="button" disabled={busy} onClick={() => onReview("mismatch")} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs disabled:opacity-50">
          Mark mismatch
        </button>
        <button type="button" disabled={busy} onClick={() => onReview("expired")} className="rounded-full bg-danger/10 px-3 py-1.5 text-xs text-danger disabled:opacity-50">
          Mark expired
        </button>
        <button type="button" disabled={busy} onClick={() => onReview("suspended")} className="rounded-full bg-danger/10 px-3 py-1.5 text-xs text-danger disabled:opacity-50">
          Mark suspended
        </button>
        <button type="button" disabled={busy} onClick={() => onReview("unverified")} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs text-muted disabled:opacity-50">
          Clear to unverified
        </button>
      </div>
    </div>
  );
}
