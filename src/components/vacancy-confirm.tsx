import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { vacancyFreshness, vacancyTimestamp } from "@/lib/listing-readiness";
import { refreshVacancy } from "@/lib/server/claims";
import { useCopy } from "@/lib/use-copy";
import type { Daycare } from "@/lib/types";

function formatStamp(iso: string, locale: string) {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(ts);
}

function lastConfirmedLabel(
  item: Pick<Daycare, "lastVacancyUpdatedAt" | "spotsUpdatedAt">,
  t: (key: "vacancyLastConfirmed" | "vacancyNeverConfirmed") => string,
  locale: string,
) {
  const at = vacancyTimestamp(item);
  const state = vacancyFreshness(at);
  if (state.kind === "unknown" || !at) return t("vacancyNeverConfirmed");
  const stamp = formatStamp(at, locale);
  return stamp ? `${t("vacancyLastConfirmed")} ${stamp}` : t("vacancyNeverConfirmed");
}

/**
 * Centre-desk confirm loop. Stamps last_vacancy_updated_at only — never invents
 * open-spot counts. That timestamp is what parent “recently confirmed” filters use.
 */
export function VacancyConfirmLoop({
  listings,
  onConfirmed,
}: {
  listings: Array<Pick<Daycare, "id" | "name" | "nameFr" | "lastVacancyUpdatedAt" | "spotsUpdatedAt">>;
  onConfirmed: () => void | Promise<void>;
}) {
  const { t, locale } = useCopy();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!listings.length) return null;

  return (
    <section className="mb-8 rounded-xl bg-surface p-5 ring-1 ring-border">
      <h2 className="font-display text-2xl">{t("vacancyConfirmTitle")}</h2>
      <p className="mt-1 text-sm text-muted">{t("vacancyRefreshLead")}</p>
      <ul className="mt-4 space-y-3">
        {listings.map((d) => {
          const name = locale === "fr" && d.nameFr ? d.nameFr : d.name;
          return (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-bg px-4 py-3 ring-1 ring-border"
            >
              <div className="min-w-0">
                <p className="font-medium">{name}</p>
                <p className="mt-0.5 text-sm text-muted">{lastConfirmedLabel(d, t, locale)}</p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={busyId === d.id}
                onClick={() => {
                  setBusyId(d.id);
                  void refreshVacancy({ data: { daycareId: d.id } })
                    .then(() => {
                      toast.success(t("vacancyRefreshed"));
                      return onConfirmed();
                    })
                    .catch((err) => toast.error(err instanceof Error ? err.message : "Error"))
                    .finally(() => setBusyId(null));
                }}
              >
                {t("vacancyRefresh")}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
