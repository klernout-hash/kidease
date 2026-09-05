import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TurnstileField, useTurnstileToken } from "@/components/turnstile-field";
import { reportListing } from "@/lib/server/trust";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";

const REASONS: Array<{ id: string; key: CopyKey }> = [
  { id: "license", key: "trustReasonLicense" },
  { id: "unlicensed", key: "trustReasonUnlicensed" },
  { id: "ownership", key: "trustReasonOwnership" },
  { id: "photo", key: "trustReasonPhoto" },
  { id: "other", key: "trustReasonOther" },
];

export function ListingReport({ daycareId, centreName }: { daycareId: string; centreName: string }) {
  const { t } = useCopy();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("license");
  const [detail, setDetail] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const { token, onToken } = useTurnstileToken();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted underline-offset-4 hover:text-fg hover:underline"
      >
        {t("trustReport")}
      </button>
    );
  }

  return (
    <form
      className="mt-3 space-y-3 rounded-lg bg-surface p-4 text-sm ring-1 ring-border"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void reportListing({
          data: {
            daycareId,
            reason,
            detail: `${centreName}: ${detail}`.trim(),
            name,
            email,
            turnstileToken: token,
          },
        })
          .then(() => {
            toast.success(t("trustReportSent"));
            setOpen(false);
            setDetail("");
          })
          .catch((err) => toast.error(err instanceof Error ? err.message : t("trustReport")))
          .finally(() => setBusy(false));
      }}
    >
      <p className="font-medium">{t("trustReport")}</p>
      <p className="text-muted">{t("trustReportLead")}</p>
      <label className="block">
        {t("trustReportReason")}
        <select
          className="ke-input mt-1"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {REASONS.map((r) => (
            <option key={r.id} value={r.id}>
              {t(r.key)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        {t("trustReportDetail")}
        <textarea
          className="ke-textarea mt-1 min-h-20"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          {t("name")}
          <input className="ke-input mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="block">
          {t("email")}
          <input type="email" className="ke-input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
      </div>
      <TurnstileField onToken={onToken} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {t("submit")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("close")}
        </Button>
      </div>
    </form>
  );
}
