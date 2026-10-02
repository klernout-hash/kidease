import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AI_FLAGS } from "@/lib/ai/flags";
import { translateEventProps } from "@/lib/ai/translate";
import { useAiFeatureFlag } from "@/lib/ai/use-ai-flag";
import { capturePostHogEvent } from "@/lib/posthog";
import { draftListingFrench } from "@/lib/server/translate";
import { useCopy } from "@/lib/use-copy";

export function ListingTranslate({
  daycareId,
  value,
  onChange,
}: {
  daycareId: string;
  value: string;
  onChange: (french: string) => void;
}) {
  const on = useAiFeatureFlag(AI_FLAGS.translate);
  const { t } = useCopy();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<"failed" | "empty" | null>(null);
  const [auto, setAuto] = useState(false);
  if (!on) return null;

  async function draft() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await draftListingFrench({ data: { daycareId } });
      if (!res.ok || !res.french) {
        setNotice(!res.ok || res.source === "fallback" ? "failed" : "empty");
        capturePostHogEvent("translate_fallback", translateEventProps({ daycareId }));
        return;
      }
      onChange(res.french.slice(0, 2000));
      setAuto(true);
      capturePostHogEvent("translate_drafted", translateEventProps({ daycareId }));
    } catch {
      setNotice("failed");
      capturePostHogEvent("translate_fallback", translateEventProps({ daycareId }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg bg-bg p-3 ring-1 ring-border" data-ke="listing-translate">
      <h3 className="font-display text-xl">{t("translateFrench")}</h3>
      <p className="mt-1 text-sm text-muted">{t("translateLead")}</p>
      <Button type="button" className="mt-2 min-h-11" disabled={busy} onClick={() => void draft()}>
        {busy ? t("translateWorking") : t("translateCta")}
      </Button>
      {notice === "failed" ? (
        <p className="mt-2 text-sm" role="alert">
          {t("translateFailed")}
        </p>
      ) : null}
      {notice === "empty" ? <p className="mt-2 text-sm">{t("translateEmpty")}</p> : null}
      <label className="mt-3 block text-sm">
        {t("translateFrench")}
        {auto ? <span className="ml-2 font-medium text-muted">{t("translateAuto")}</span> : null}
        <textarea
          className="mt-1 min-h-28 w-full rounded-md border border-border bg-bg px-3 py-2"
          maxLength={2000}
          value={value}
          onChange={(event) => {
            setAuto(false);
            onChange(event.target.value);
          }}
        />
      </label>
      <p className="mt-1 text-xs text-muted">{t("translateSave")}</p>
    </div>
  );
}
