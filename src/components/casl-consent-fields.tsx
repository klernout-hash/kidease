import { caslStatement, type CaslPrefs } from "@/lib/casl";
import { useCopy } from "@/lib/use-copy";

export type CaslConsentFieldsValue = CaslPrefs;

export function CaslConsentFields({
  value,
  onChange,
  showSms = true,
  showEmailService = true,
  showEmailCommercial = true,
}: {
  value: CaslConsentFieldsValue;
  onChange: (next: CaslConsentFieldsValue) => void;
  showSms?: boolean;
  showEmailService?: boolean;
  showEmailCommercial?: boolean;
}) {
  const { t, locale } = useCopy();
  const loc = locale === "fr" ? "fr" : "en";

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{t("caslLegend")}</legend>
      <p className="text-[13px] text-muted">{t("caslNotRequired")}</p>
      {showSms ? (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={value.smsService}
            onChange={(e) => onChange({ ...value, smsService: e.target.checked })}
          />
          <span>
            <span className="font-medium">{t("caslSmsLabel")}</span>
            <span className="mt-1 block text-[12px] text-muted">{caslStatement(loc, "smsService")}</span>
          </span>
        </label>
      ) : null}
      {showEmailService ? (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={value.emailService}
            onChange={(e) => onChange({ ...value, emailService: e.target.checked })}
          />
          <span>
            <span className="font-medium">{t("caslEmailServiceLabel")}</span>
            <span className="mt-1 block text-[12px] text-muted">{caslStatement(loc, "emailService")}</span>
          </span>
        </label>
      ) : null}
      {showEmailCommercial ? (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={value.emailCommercial}
            onChange={(e) => onChange({ ...value, emailCommercial: e.target.checked })}
          />
          <span>
            <span className="font-medium">{t("caslEmailCommercialLabel")}</span>
            <span className="mt-1 block text-[12px] text-muted">{caslStatement(loc, "emailCommercial")}</span>
          </span>
        </label>
      ) : null}
      <p className="text-[12px] text-subtle">{t("caslWithdrawHint")}</p>
    </fieldset>
  );
}
