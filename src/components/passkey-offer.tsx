import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";

export function PasskeyOffer({
  busy,
  error,
  onEnable,
  onLater,
}: {
  busy: boolean;
  error: string | null;
  onEnable: () => void;
  onLater: () => void;
}) {
  const { t } = useCopy();
  return (
    <div
      className="mt-6 space-y-3"
      role="dialog"
      aria-labelledby="passkey-offer-title"
      data-ke="passkey-offer"
    >
      <h2 id="passkey-offer-title" className="font-display text-xl">
        {t("passkeyOfferTitle")}
      </h2>
      <p className="text-sm text-muted">{t("passkeyOfferLead")}</p>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="button" size="lg" className="w-full min-h-12" disabled={busy} onClick={onEnable}>
        {busy ? t("openingDesk") : t("passkeyOfferOn")}
      </Button>
      <Button type="button" variant="secondary" size="lg" className="w-full min-h-12" disabled={busy} onClick={onLater}>
        {t("passkeyOfferLater")}
      </Button>
    </div>
  );
}
