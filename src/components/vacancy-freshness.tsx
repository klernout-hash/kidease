import { vacancyFreshness, vacancyTimestamp } from "@/lib/listing-readiness";
import { useCopy } from "@/lib/use-copy";
import type { Daycare } from "@/lib/types";

function formatAgo(locale: string, age: { unit: "now" | "minute" | "hour" | "day" | "month"; count: number }) {
  if (age.unit === "now") return "";
  const tag = locale === "fr" ? "fr-CA" : "en-CA";
  return new Intl.RelativeTimeFormat(tag, { numeric: "auto" }).format(-age.count, age.unit);
}

export function vacancyLine(
  item: Pick<Daycare, "lastVacancyUpdatedAt" | "spotsUpdatedAt">,
  t: (key: "vacancyUpdated" | "vacancyStale" | "vacancyUpdatedNow" | "availUnknown") => string,
  locale: string,
) {
  const state = vacancyFreshness(vacancyTimestamp(item));
  if (state.kind === "unknown") return { kind: "unknown" as const, text: "" };
  if (state.kind === "stale") return { kind: "stale" as const, text: t("vacancyStale") };
  if (state.age.unit === "now") return { kind: "fresh" as const, text: t("vacancyUpdatedNow") };
  return { kind: "fresh" as const, text: `${t("vacancyUpdated")} ${formatAgo(locale, state.age)}` };
}

export function VacancyFreshness({
  item,
  className,
}: {
  item: Pick<Daycare, "lastVacancyUpdatedAt" | "spotsUpdatedAt">;
  className?: string;
}) {
  const { t, locale } = useCopy();
  const line = vacancyLine(item, t, locale);
  if (line.kind === "unknown" || !line.text) return null;
  return <p className={className}>{line.text}</p>;
}
