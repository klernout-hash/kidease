import { Link } from "@tanstack/react-router";
import { pipelineByStage, PIPELINE_STAGES, type PipelineCard, type PipelineStage } from "@/lib/crm-pipeline";
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
  const { t } = useCopy();
  const grouped = pipelineByStage(cards);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-2xl">{t("pipelineTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("pipelineLead")}</p>
      </div>
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
