import { Link } from "@tanstack/react-router";
import { TourCountSummary } from "@/components/tour-count-summary";
import { pipelineByStage, PIPELINE_STAGES, type PipelineCard, type PipelineStage } from "@/lib/crm-pipeline";
import { summarizeTourCounts } from "@/lib/tour-counts";
import { pipelineCopy } from "@/lib/pipeline-copy";
import { tourOutcomeCounts } from "@/lib/pipeline-features";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";

const STAGE_KEY: Record<PipelineStage, CopyKey> = {
  inquiry: "pipelineInquiry",
  tour_pending: "pipelineTourPending",
  tour_accepted: "pipelineTourAccepted",
  enrol_open: "pipelineEnrolOpen",
  enrolled: "pipelineEnrolled",
};

export function CentrePipeline({ cards }: { cards: PipelineCard[] }) {
  const { t, locale } = useCopy();
  const grouped = pipelineByStage(cards);
  const counts = summarizeTourCounts({
    requests: cards
      .filter((card) => card.kind === "tour")
      .map((card) => ({ status: card.tourStatus, kind: "tour" as const })),
  });

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-2xl">{t("pipelineTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("pipelineLead")}</p>
      </div>
      <TourCountSummary counts={counts} locale={locale} />
      <TourOutcomeSummary statuses={cards.filter((card) => card.kind === "tour").map((card) => card.tourStatus)} />
      <div className="grid gap-3 md:grid-cols-5">
        {PIPELINE_STAGES.map((stage) => (
          <div key={stage} className="rounded-xl bg-surface p-3 ring-1 ring-border">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">
              {t(STAGE_KEY[stage])}
              <span className="ml-1 tabular-nums text-muted">{grouped[stage].length}</span>
            </p>
            <ul className="mt-2 space-y-2">
              {grouped[stage].length === 0 ? (
                <li className="text-xs text-subtle">{t("pipelineEmpty")}</li>
              ) : (
                grouped[stage].slice(0, 8).map((card) => <PipelineRow key={`${card.kind}-${card.id}`} card={card} />)
              )}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function TourOutcomeSummary({ statuses }: { statuses: (string | null | undefined)[] }) {
  const { locale } = useCopy();
  const pc = pipelineCopy(locale);
  const outcome = tourOutcomeCounts(statuses);
  const rows = [
    ["attended", pc.attended, String(outcome.attended)],
    ["no-show", pc.noShow, String(outcome.noShow)],
    ["rate", pc.noShowRate, outcome.noShowRate == null ? "–" : `${outcome.noShowRate} %`],
  ] as const;
  return (
    <div data-ke="tour-outcomes">
      <p className="text-sm font-medium">{pc.tourOutcomesTitle}</p>
      <dl className="mt-1 grid gap-2 sm:grid-cols-3">
        {rows.map(([key, label, value]) => (
          <div key={key} className="rounded-lg bg-surface px-3 py-2 ring-1 ring-border">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums text-fg">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted">{pc.tourOutcomesLead}</p>
    </div>
  );
}

function PipelineRow({ card }: { card: PipelineCard }) {
  const { t } = useCopy();
  const title = card.parentName || t("parentLabel");
  return (
    <li>
      {card.conversationId ? (
        <Link to="/inbox/$id" params={{ id: card.conversationId }} className="block rounded-lg px-2 py-1.5 hover:bg-bg">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-muted">
            {card.daycareName}
            {card.childName ? ` · ${card.childName}` : ""}
          </p>
        </Link>
      ) : (
        <div className="rounded-lg px-2 py-1.5">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-muted">
            {card.daycareName}
            {card.childName ? ` · ${card.childName}` : ""}
          </p>
        </div>
      )}
    </li>
  );
}
