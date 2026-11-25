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
        <ConsentRow
          entry="sms-entry"
          checked={value.smsService}
          onChange={(checked) => onChange({ ...value, smsService: checked })}
          label={t("caslSmsLabel")}
          statement={caslStatement(loc, "smsService")}
        />
      ) : null}
      {showEmailService ? (
        <ConsentRow
          checked={value.emailService}
          onChange={(checked) => onChange({ ...value, emailService: checked })}
          label={t("caslEmailServiceLabel")}
          statement={caslStatement(loc, "emailService")}
        />
      ) : null}
      {showEmailCommercial ? (
        <ConsentRow
          checked={value.emailCommercial}
          onChange={(checked) => onChange({ ...value, emailCommercial: checked })}
          label={t("caslEmailCommercialLabel")}
          statement={caslStatement(loc, "emailCommercial")}
        />
      ) : null}
      <p className="text-[12px] text-subtle">{t("caslWithdrawHint")}</p>
    </fieldset>
  );
}

/**
 * One consent checkbox (#1014 item 9c). QA could only toggle these from the
 * label text, not the 16px box. No overlay or CSS rule was found that blocks
 * the input, so the box itself is bigger (20px) and sits in a 44px hit zone
 * (CONSENT_BOX_ZONE) inside the label: a tap on or around the box toggles it.
 */
export const CONSENT_ROW = "flex min-h-11 cursor-pointer touch-manipulation items-start gap-2 text-sm";
export const CONSENT_BOX_ZONE = "-my-1.5 -ml-3 flex size-11 shrink-0 items-center justify-center";
export const CONSENT_BOX = "size-5 shrink-0 cursor-pointer touch-manipulation accent-primary";

function ConsentRow({
  entry,
  checked,
  onChange,
  label,
  statement,
}: {
  entry?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  statement: string;
}) {
  return (
    <label className={CONSENT_ROW} data-ke={entry}>
      <span className={CONSENT_BOX_ZONE} data-ke="casl-box-zone">
        <input
          type="checkbox"
          className={CONSENT_BOX}
          autoComplete="off"
          autoCorrect="off"
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
      </span>
      <span className="pt-2">
        <span className="font-medium">{label}</span>
        <span className="mt-1 block text-[12px] text-muted">{statement}</span>
      </span>
    </label>
  );
}
