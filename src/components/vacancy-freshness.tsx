import {
  photoFreshness,
  photoTimestamp,
  vacancyFreshness,
  vacancyPublicWindow,
  vacancyTimestamp,
} from "@/lib/listing-readiness";
import { useCopy } from "@/lib/use-copy";
import type { Daycare } from "@/lib/types";

function formatAgo(locale: string, age: { unit: "now" | "minute" | "hour" | "day" | "month"; count: number }) {
  if (age.unit === "now") return "";
  const tag = locale === "fr" ? "fr-CA" : "en-CA";
  return new Intl.RelativeTimeFormat(tag, { numeric: "auto" }).format(-age.count, age.unit);
}

type VacancyCopyKey =
  | "vacancyUpdated"
  | "vacancyStale"
  | "vacancyUpdatedNow"
  | "vacancyLastConfirmed"
  | "vacancyNotConfirmed"
  | "vacancyMayBeOutOfDate"
  | "availUnknown";

export function vacancyLine(
  item: Pick<Daycare, "lastVacancyUpdatedAt" | "spotsUpdatedAt">,
  t: (key: VacancyCopyKey) => string,
  locale: string,
) {
  const at = vacancyTimestamp(item);
  const window = vacancyPublicWindow(at);
  if (window === "unknown") {
    return { kind: "unknown" as const, text: t("vacancyNotConfirmed"), detail: t("vacancyNotConfirmed") };
  }
  const state = vacancyFreshness(at);
  const confirmed =
    state.kind === "unknown" || state.age.unit === "now"
      ? t("vacancyUpdatedNow")
      : `${t("vacancyUpdated")} ${formatAgo(locale, state.age)}`;
  if (window === "out_of_date") {
    return {
      kind: "stale" as const,
      text: `${confirmed}. ${t("vacancyMayBeOutOfDate")}`,
      detail: t("vacancyMayBeOutOfDate"),
    };
  }
  return { kind: "fresh" as const, text: confirmed, detail: confirmed };
}

export function photoLine(
  item: Pick<Daycare, "lastPhotoUpdatedAt">,
  t: (key: "photoUpdated" | "photoStale") => string,
  locale: string,
) {
  const state = photoFreshness(photoTimestamp(item));
  if (state.kind === "unknown" || !state.age) return { kind: "unknown" as const, text: "" };
  const ago = formatAgo(locale, state.age);
  if (state.kind === "stale") {
    return { kind: "stale" as const, text: ago ? `${t("photoStale")} · ${ago}` : t("photoStale") };
  }
  return { kind: "fresh" as const, text: ago ? `${t("photoUpdated")} ${ago}` : t("photoUpdated") };
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
  if (!line.text) return null;
  return (
    <div className={className} data-ke="vacancy-confirmed">
      <p>{line.text}</p>
      {lead && line.kind === "stale" ? <p className="mt-1 text-muted">{t("vacancyOutOfDateLead")}</p> : null}
    </div>
  );
}
