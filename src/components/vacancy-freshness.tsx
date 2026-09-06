import { vacancyFreshness, vacancyTimestamp } from "@/lib/listing-readiness";
import { useCopy } from "@/lib/use-copy";
import type { Daycare } from "@/lib/types";

function formatAgo(locale: string, age: { unit: "now" | "minute" | "hour" | "day" | "month"; count: number }) {
  if (age.unit === "now") return "";
  const tag = locale === "fr" ? "fr-CA" : "en-CA";
  return new Intl.RelativeTimeFormat(tag, { numeric: "auto" }).format(-age.count, age.unit);
}

type VacancyCopyKey = "vacancyUpdated" | "vacancyStale" | "vacancyUpdatedNow" | "vacancyLastConfirmed" | "availUnknown";

export function vacancyLine(
  item: Pick<Daycare, "lastVacancyUpdatedAt" | "spotsUpdatedAt">,
  t: (key: VacancyCopyKey) => string,
  locale: string,
) {
  const state = vacancyFreshness(vacancyTimestamp(item));
  if (state.kind === "unknown") return { kind: "unknown" as const, text: "", detail: "" };
  if (state.kind === "stale") {
    const ago = formatAgo(locale, state.age);
    return {
      kind: "stale" as const,
      text: t("vacancyStale"),
      detail: ago ? `${t("vacancyLastConfirmed")} ${ago}` : t("vacancyStale"),
    };
  }
  if (state.age.unit === "now") {
    return { kind: "fresh" as const, text: t("vacancyUpdatedNow"), detail: t("vacancyUpdatedNow") };
  }
  const text = `${t("vacancyUpdated")} ${formatAgo(locale, state.age)}`;
  return { kind: "fresh" as const, text, detail: text };
}

export function VacancyFreshness({
  item,
  className,
  lead,
}: {
  item: Pick<Daycare, "lastVacancyUpdatedAt" | "spotsUpdatedAt">;
  className?: string;
  lead?: boolean;
}) {
  const { t, locale } = useCopy();
  const line = vacancyLine(item, t, locale);
  if (line.kind === "unknown" || !line.text) return null;
  return (
    <div className={className}>
      <p>{line.kind === "stale" ? line.detail : line.text}</p>
      {lead && line.kind === "stale" ? <p className="mt-1 text-muted">{t("vacancyStaleLead")}</p> : null}
    </div>
  );
}
