import { listingHealth, vacancyFreshness, HEALTH_FIELDS, HEALTH_FIELD_ANCHOR, type HealthField } from "@/lib/listing-readiness";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";
import type { Daycare } from "@/lib/types";
import { vacancyLine } from "@/components/vacancy-freshness";

const NEED_KEY: Record<HealthField, CopyKey> = {
  fees: "completeNeedFees",
  ages: "completeNeedAges",
  photo: "completeNeedPhoto",
  hours: "completeNeedHours",
  vacancy: "healthNeedVacancy",
};

function jumpToField(field: HealthField) {
  const id = HEALTH_FIELD_ANCHOR[field];
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const focusable = el.matches("input, textarea, button, select")
    ? el
    : el.querySelector<HTMLElement>("input, textarea, button, select");
  focusable?.focus();
}

export function ListingHealthPanel({ item }: { item: Daycare }) {
  const { t, locale } = useCopy();
  const health = listingHealth(item);
  const vacancy = vacancyFreshness(health.vacancyAt);
  const vacancyAge = vacancyLine(item, t, locale);

  return (
    <div className="mt-4 rounded-lg bg-bg p-4 text-sm ring-1 ring-border">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-medium">{t("listingHealthTitle")}</p>
          <p className="mt-1 text-muted">{t("listingHealthLead")}</p>
        </div>
        <p className="font-display text-3xl tabular-nums leading-none">
          {health.percent}
          <span className="ml-1 text-sm font-sans font-normal text-muted">% {t("listingHealthComplete")}</span>
        </p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-ok" style={{ width: `${health.percent}%` }} />
      </div>
      <p className="mt-2 text-xs text-subtle">
        {health.missing.length === 0
          ? t("listingHealthReady")
          : `${health.score}/${health.total}`}
      </p>
      <ul className="mt-3 space-y-2">
        {HEALTH_FIELDS.map((field) => {
          const ok = !health.missing.includes(field);
          const vacancyDetail =
            field === "vacancy"
              ? ok
                ? vacancy.kind === "unknown"
                  ? t("healthNeedVacancy")
                  : vacancyAge.detail || vacancyAge.text || t("healthNeedVacancy")
                : t("healthNeedVacancyMissing")
              : null;
          return (
            <li key={field} className="flex flex-wrap items-center justify-between gap-2">
              <span className={ok ? "text-muted" : "text-fg"}>
                <span className="mr-2 tabular-nums">{ok ? "✓" : "–"}</span>
                {t(NEED_KEY[field])}
                {vacancyDetail ? <span className="mt-0.5 block pl-6 text-xs text-subtle">{vacancyDetail}</span> : null}
              </span>
              {ok && field !== "vacancy" ? null : (
                <button
                  type="button"
                  className="rounded-full px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-border hover:bg-surface"
                  onClick={() => jumpToField(field)}
                >
                  {field === "vacancy" ? t("listingHealthConfirmSpots") : t("listingHealthEdit")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
