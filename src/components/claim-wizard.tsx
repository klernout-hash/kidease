import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { UploadLimitHint } from "@/components/upload-limit-hint";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";

export type ClaimDeliveryView =
  | { kind: "sent"; channel: "email" | "sms"; mask: string }
  | { kind: "manual"; reason: string };

type Step = 1 | 2 | 3;

function scrollField(node: HTMLElement) {
  node.scrollIntoView({ block: "center", behavior: "smooth" });
}

export function ClaimVerifyWizard({
  centreName,
  delivery,
  busy,
  error,
  submitted,
  feesNote,
  challenge,
  startStep = 1,
  onResend,
  onSubmit,
  onSaveFees,
}: {
  centreName: string;
  delivery: ClaimDeliveryView;
  busy: boolean;
  error: string | null;
  submitted: boolean;
  feesNote: string | null;
  challenge?: ReactNode;
  startStep?: Step | "pending" | "fees";
  onResend: () => void;
  onSubmit: (input: { code: string; license: string; acceptTerms: boolean }) => void;
  onSaveFees: (fees: { infantMonthly: string; toddlerMonthly: string; preschoolMonthly: string }) => void;
}) {
  const { t, locale } = useCopy();
  const [step, setStep] = useState<Step>(startStep === "pending" || startStep === "fees" ? 3 : startStep);
  const [code, setCode] = useState("");
  const [license, setLicense] = useState("");
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [fees, setFees] = useState({ infantMonthly: "", toddlerMonthly: "", preschoolMonthly: "" });
  const showPending = submitted || startStep === "pending" || startStep === "fees";
  const fr = locale === "fr";

  function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_800_000) {
      setLicense("");
      setLicenseError(t("uploadClaimDocTooBig"));
      return;
    }
    setLicenseError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setLicense(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  const progress = showPending ? t("claimPendingTitle") : t("claimProgress").replace("{n}", String(step));

  return (
    <section className="ke-claim-wizard mt-6 space-y-4" data-ke="claim-wizard" aria-labelledby="claim-wizard-title">
      <p className="text-sm font-medium text-primary" data-ke="claim-progress">{progress}</p>
      <h2 id="claim-wizard-title" className="font-display text-2xl">
        {showPending ? t("claimPendingTitle") : step === 1 ? t("claimStepCode") : step === 2 ? t("claimStepLicence") : t("claimStepTerms")}
      </h2>
      <p className="text-sm text-muted">
        {t("verifyLead")} <span className="font-medium text-fg">{centreName}</span>
      </p>
      {error ? (
        <p role="alert" className="text-sm text-danger" data-ke="claim-error">{error}</p>
      ) : null}

      {showPending ? (
        <div className="space-y-4 rounded-xl bg-surface p-5 ring-1 ring-border" data-ke="claim-pending">
          <p className="text-sm">{t("claimPendingBody")}</p>
          <p className="text-sm text-muted">{t("claimNotVerified")}</p>
          <div data-ke="claim-fees">
            <h3 className="text-sm font-medium">{t("claimFeesAfter")}</h3>
            <fieldset className="mt-3 space-y-3">
              <legend className="sr-only">{t("claimFeesAfter")}</legend>
              {(
                [
                  ["infantMonthly", "infantFee"],
                  ["toddlerMonthly", "toddlerFee"],
                  ["preschoolMonthly", "preschoolFee"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-sm">
                  {t(label)}
                  <input
                    inputMode="decimal"
                    value={fees[key]}
                    onChange={(e) => setFees((current) => ({ ...current, [key]: e.target.value }))}
                    onFocus={(e) => scrollField(e.currentTarget)}
                    className="ke-input mt-1 min-h-11 w-full"
                    autoComplete="off"
                  />
                </label>
              ))}
            </fieldset>
            {feesNote ? <p role="status" className="mt-2 text-sm">{feesNote}</p> : null}
            <Button type="button" className="mt-3" disabled={busy} onClick={() => onSaveFees(fees)}>
              {t("claimSaveFees")}
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4 rounded-xl bg-surface p-5 ring-1 ring-border"
          data-ke={`claim-step-${step}`}
          onSubmit={(event) => {
            event.preventDefault();
            if (step === 1) {
              if (delivery.kind === "sent" && code.trim().length < 4) return;
              setStep(2);
              return;
            }
            if (step === 2) {
              if (!license.startsWith("data:image") && !license.startsWith("data:application/pdf")) {
                setLicenseError(t("licensePhoto"));
                return;
              }
              setStep(3);
              return;
            }
            if (!acceptTerms) return;
            onSubmit({ code, license, acceptTerms });
          }}
        >
          {step === 1 ? (
            <div data-ke="claim-step-code">
              {delivery.kind === "sent" ? (
                <>
                  <p className="text-sm">{t("claimCodeSentMask").replace("{mask}", delivery.mask)}</p>
                  <p className="mt-2 text-sm text-muted">{t("claimCodeAlone")}</p>
                  <label className="mt-3 block text-sm">
                    {t("claimCode")}
                    <input
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      onFocus={(e) => scrollField(e.currentTarget)}
                      className="ke-input mt-1 min-h-11 w-full font-mono tracking-widest"
                      autoComplete="one-time-code"
                      inputMode="text"
                      data-ke="claim-code-input"
                    />
                  </label>
                  <button type="button" className="mt-3 min-h-11 text-sm font-medium text-primary underline" onClick={onResend}>
                    {t("claimResend")}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm">
                    {delivery.reason === "channel_held" || delivery.reason === "not_sent"
                      ? t("claimChannelHeld")
                      : t("claimManualLead")}
                  </p>
                  <p className="mt-2 text-sm text-muted">{t("claimCodeAlone")}</p>
                  <p className="mt-3 text-sm">
                    <Link to={localePath("/help", locale)} className="font-medium text-primary underline">
                      {t("claimSupportPath")}
                    </Link>
                  </p>
                </>
              )}
            </div>
          ) : null}

          {step === 2 ? (
            <div data-ke="claim-step-licence">
              <p className="text-sm text-muted">{t("claimReviewExplain")}</p>
              <label className="mt-3 block text-sm font-medium">
                {t("licensePhoto")}
                <input
                  required
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="mt-2 block min-h-11 w-full rounded-xl bg-bg px-3 py-2 text-sm ring-1 ring-border file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-primary file:px-4 file:text-sm file:font-medium file:text-primary-fg"
                  data-ke="claim-license-file"
                  onChange={(e) => readFile(e.target.files?.[0])}
                />
                <UploadLimitHint hint={t("uploadClaimDocHint")} error={licenseError} />
              </label>
              {license.startsWith("data:image") ? (
                <img src={license} alt={t("claimLicenseAlt")} className="mt-3 max-h-40 max-w-full rounded-md object-contain ring-1 ring-border" />
              ) : fileName ? (
                <p className="mt-2 text-sm text-muted">{fileName}</p>
              ) : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div data-ke="claim-step-terms">
              <p className="text-sm text-muted">{t("claimReviewExplain")}</p>
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  required
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="mt-1 size-4"
                />
                <span>
                  {fr ? "J’accepte les " : "I agree to the "}
                  <a href="/provider-terms" target="_blank" rel="noreferrer" className="underline">
                    {fr ? "Conditions des fournisseurs" : "Provider Terms"}
                  </a>
                  {fr
                    ? " et confirme être autorisé à engager ce service de garde. La version, l’heure et l’adresse IP sont enregistrées. Cela n’équivaut pas à une fiche vérifiée."
                    : " and confirm I can bind this child care program. The version, time, and IP address are recorded. This does not verify the listing."}
                </span>
              </label>
              {challenge}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-2">
            {step > 1 ? (
              <Button type="button" variant="secondary" onClick={() => setStep((current) => (current === 3 ? 2 : 1))}>
                {t("back")}
              </Button>
            ) : null}
            <Button type="submit" disabled={busy || (step === 3 && !acceptTerms)} data-ke="claim-next">
              {step === 3 ? t("claimSubmitReview") : t("claimContinue")}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
