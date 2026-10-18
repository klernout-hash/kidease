import { Link } from "@tanstack/react-router";
import { PARENT_SMS_CONSENT_TEXT, PARENT_SMS_FROM_DISPLAY, PARENT_SMS_TERMS_URL } from "@/lib/parent-sms-consent";
import { useCopy } from "@/lib/use-copy";

export function ParentSmsFields({
  phone,
  onPhone,
  consent,
  onConsent,
}: {
  phone: string;
  onPhone: (value: string) => void;
  consent: boolean;
  onConsent: (value: boolean) => void;
}) {
  const { t, locale } = useCopy();
  const phoneLabel = locale === "fr" ? "Téléphone mobile (facultatif)" : "Mobile phone (optional)";
  const fromLine =
    locale === "fr"
      ? `Les textos viennent du ${PARENT_SMS_FROM_DISPLAY}.`
      : `Texts come from ${PARENT_SMS_FROM_DISPLAY}.`;

  return (
    <div className="space-y-3" data-ke="parent-sms">
      <label className="block text-sm" htmlFor="parent-mobile">
        {phoneLabel}
        <input
          id="parent-mobile"
          name="mobile"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          className="ke-input mt-1"
          value={phone}
          onChange={(event) => onPhone(event.target.value)}
          onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
          maxLength={32}
          placeholder="204-555-0100"
          data-ke="parent-mobile"
        />
      </label>
      <div data-ke="parent-sms-consent">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm" htmlFor="parent-sms-checkbox">
          <span className="grid min-h-11 min-w-11 shrink-0 place-items-center">
            <input
              id="parent-sms-checkbox"
              name="smsConsent"
              type="checkbox"
              className="size-5 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              autoComplete="off"
              checked={consent}
              onChange={(event) => onConsent(event.target.checked)}
              aria-describedby="parent-sms-links"
              data-ke="parent-sms-checkbox"
            />
          </span>
          <span className="pt-2.5">{PARENT_SMS_CONSENT_TEXT}</span>
        </label>
        <p id="parent-sms-links" className="mt-1 flex flex-wrap items-center gap-x-2 pl-2 text-sm">
          <a
            href={PARENT_SMS_TERMS_URL}
            className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4"
          >
            {t("terms")}
          </a>
          <span aria-hidden="true" className="text-subtle">
            ·
          </span>
          {locale === "fr" ? (
            <Link
              to="/fr/privacy"
              className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4"
            >
              {t("privacy")}
            </Link>
          ) : (
            <Link
              to="/privacy"
              className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4"
            >
              {t("privacy")}
            </Link>
          )}
        </p>
        <p className="pl-2 text-[13px] text-muted">{fromLine}</p>
      </div>
    </div>
  );
}
