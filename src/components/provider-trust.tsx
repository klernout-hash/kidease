import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TrustSignals } from "@/components/trust-badge";
import { Field } from "@/components/provider-listing-forms";
import { attestStaffScreening, saveLicenseFields } from "@/lib/server/trust";
import { claimVerificationState, formatAttestedOn } from "@/lib/trust";
import { licenseRecordUrl } from "@/lib/licensing";
import { useCopy } from "@/lib/use-copy";
import type { Daycare } from "@/lib/types";
import type { CopyKey } from "@/lib/copy";

function claimKey(d: Daycare): CopyKey {
  const state = claimVerificationState(d);
  if (state === "verified") return "trustClaimVerified";
  if (state === "declined") return "trustClaimDeclined";
  if (state === "unclaimed") return "trustClaimUnclaimed";
  return "trustClaimReview";
}

export function ProviderTrustChecklist({ daycare, onSaved }: { daycare: Daycare; onSaved: () => void }) {
  const { t, locale } = useCopy();
  const [licenseNumber, setLicenseNumber] = useState(daycare.licenseNumber ?? "");
  const [licenseExpiry, setLicenseExpiry] = useState(daycare.licenseExpiry ?? "");
  const [capacity, setCapacity] = useState(daycare.licensedCapacity ? String(daycare.licensedCapacity) : "");
  const [busy, setBusy] = useState<string | null>(null);
  const attested = Boolean(daycare.staffScreeningAttested);

  return (
    <div className="space-y-5">
      <TrustSignals item={daycare} surface="provider" />
      <ol className="space-y-4">
        <li className="rounded-lg bg-bg p-4 ring-1 ring-border">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">1 · {t("trustChecklistClaim")}</p>
          <p className="mt-1 font-medium">{t(claimKey(daycare))}</p>
          <p className="mt-1 text-sm text-muted">{t("trustClaimReviewTip")}</p>
        </li>
        <li className="rounded-lg bg-bg p-4 ring-1 ring-border">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">2 · {t("trustChecklistLicense")}</p>
          <p className="mt-1 text-sm text-muted">{t("trustLicenseUnverifiedTip")}</p>
          <form
            className="mt-3 grid gap-3 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              setBusy("license");
              void saveLicenseFields({
                data: {
                  daycareId: daycare.id,
                  licenseNumber,
                  licenseExpiry,
                  licensedCapacity: Number(capacity) || 0,
                },
              })
                .then(() => {
                  toast.success(t("saveChanges"));
                  onSaved();
                })
                .catch((err) => toast.error(err instanceof Error ? err.message : t("saveChanges")))
                .finally(() => setBusy(null));
            }}
          >
            <Field label={t("licenceNo")} value={licenseNumber} onChange={setLicenseNumber} />
            <label className="text-sm">
              {t("trustLicenseExpiry")}
              <input
                type="date"
                className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
                value={licenseExpiry}
                onChange={(e) => setLicenseExpiry(e.target.value)}
              />
            </label>
            <label className="text-sm">
              {t("trustCapacity")}
              <input
                type="number"
                min={0}
                className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3 tabular-nums"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </label>
            <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
              <Button type="submit" size="sm" disabled={busy !== null}>
                {t("saveChanges")}
              </Button>
              <a
                href={licenseRecordUrl(daycare.province, daycare.name, licenseNumber)}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                {t("viewLicenceRecord")}
              </a>
            </div>
          </form>
        </li>
        <li className="rounded-lg bg-bg p-4 ring-1 ring-border">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">3 · {t("trustChecklistStaff")}</p>
          <h3 className="mt-1 font-medium">{t("trustAttestTitle")}</h3>
          <p className="mt-1 text-sm text-muted">{t("trustAttestLead")}</p>
          {attested ? (
            <p className="mt-3 rounded-md bg-surface px-3 py-2 text-sm">
              {t("trustAttestDone")}
              {daycare.staffScreeningAttestedAt
                ? ` · ${t("trustAttestDate")} ${formatAttestedOn(daycare.staffScreeningAttestedAt, locale === "fr" ? "fr-CA" : "en-CA")}`
                : ""}
            </p>
          ) : (
            <Button
              className="mt-3"
              size="sm"
              disabled={busy !== null}
              onClick={() => {
                setBusy("attest");
                void attestStaffScreening({ data: { daycareId: daycare.id } })
                  .then(() => {
                    toast.success(t("trustAttestDone"));
                    onSaved();
                  })
                  .catch((err) => toast.error(err instanceof Error ? err.message : t("trustAttestCta")))
                  .finally(() => setBusy(null));
              }}
            >
              {t("trustAttestCta")}
            </Button>
          )}
        </li>
      </ol>
    </div>
  );
}
