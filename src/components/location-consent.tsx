import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";

export function LocationConsentCard({
  onAllow,
  onLater,
}: {
  onAllow: () => void;
  onLater: () => void;
}) {
  const { t } = useCopy();
  return (
    <div className="rounded-xl bg-surface p-4 shadow-lift ring-1 ring-border">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <MapPin className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">{t("locationConsentTitle")}</p>
          <p className="mt-1 text-sm text-muted">{t("locationConsentBody")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" className="h-10 rounded-full px-4" onClick={onAllow}>
              {t("locationConsentAllow")}
            </Button>
            <button type="button" className="h-10 rounded-full px-4 text-sm font-medium text-muted" onClick={onLater}>
              {t("locationConsentLater")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
