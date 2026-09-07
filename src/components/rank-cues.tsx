import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";
import type { DemandSnapshot } from "@/lib/demand-heat";
import { cn } from "@/lib/utils";

export function MatchCue({
  score,
  compact = false,
}: {
  score?: number;
  compact?: boolean;
}) {
  const { t } = useCopy();
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  return (
    <span
      className={cn("ke-honesty", compact && "text-[11px]")}
      title={t("matchScoreTip")}
    >
      {t("matchScore")} {Math.round(score)}
    </span>
  );
}

export function UrgencyCue({
  score,
  compact = false,
  showZero = false,
}: {
  score?: number;
  compact?: boolean;
  showZero?: boolean;
}) {
  const { t } = useCopy();
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  if (!showZero && score <= 0) return null;
  return (
    <span
      className={cn("ke-honesty", compact && "text-[11px]")}
      title={t("urgencyScoreTip")}
    >
      {t("urgencyScore")} {Math.round(score)}
    </span>
  );
}

const HEAT_KEY: Record<DemandSnapshot["heat"], CopyKey> = {
  unknown: "demandHeatUnknown",
  quiet: "demandHeatQuiet",
  warm: "demandHeatWarm",
  hot: "demandHeatHot",
};

const RISK_KEY: Record<DemandSnapshot["fillRisk"], CopyKey> = {
  unknown: "fillRiskUnknown",
  low: "fillRiskLow",
  watch: "fillRiskWatch",
  high: "fillRiskHigh",
};

const SLA_KEY: Record<DemandSnapshot["sla"], CopyKey> = {
  unknown: "slaUnknown",
  ok: "slaOk",
  slow: "slaSlow",
};

export function DemandCues({ snapshot }: { snapshot?: DemandSnapshot | null }) {
  const { t } = useCopy();
  if (!snapshot) return null;
  const volume =
    snapshot.volume28d == null ? t("demandVolumeUnknown") : `${snapshot.volume28d} / 28d`;
  const reply =
    snapshot.sla === "unknown" || snapshot.replyMedianHours == null
      ? t("slaUnknown")
      : `${snapshot.replyMedianHours}h · n=${snapshot.replySample}`;
  return (
    <div className="mt-4 rounded-lg bg-bg p-4 text-sm ring-1 ring-border">
      <p className="font-medium">{t("demandTitle")}</p>
      <p className="mt-1 text-xs text-muted">{t("demandLead")}</p>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-md bg-surface p-3">
          <dt className="text-muted">{t("demandHeat")}</dt>
          <dd className="mt-1 font-medium">{t(HEAT_KEY[snapshot.heat])}</dd>
          <dd className="mt-0.5 text-xs text-subtle">{volume}</dd>
        </div>
        <div className="rounded-md bg-surface p-3">
          <dt className="text-muted">{t("fillRisk")}</dt>
          <dd className="mt-1 font-medium">{t(RISK_KEY[snapshot.fillRisk])}</dd>
          <dd className="mt-0.5 text-xs text-subtle">
            {snapshot.vacancyAgeDays == null
              ? t("fillRiskUnknown")
              : `${snapshot.vacancyAgeDays}d`}
          </dd>
        </div>
        <div className="rounded-md bg-surface p-3">
          <dt className="text-muted">{t("replySla")}</dt>
          <dd className="mt-1 font-medium">{t(SLA_KEY[snapshot.sla])}</dd>
          <dd className="mt-0.5 text-xs text-subtle">{reply}</dd>
        </div>
      </dl>
      {snapshot.pendingTourOverdue > 0 || snapshot.unrepliedThreads > 0 ? (
        <p className="mt-3 text-xs text-muted">
          {snapshot.pendingTourOverdue > 0
            ? t("slaToursOverdue").replace("{n}", String(snapshot.pendingTourOverdue))
            : null}
          {snapshot.pendingTourOverdue > 0 && snapshot.unrepliedThreads > 0 ? " · " : null}
          {snapshot.unrepliedThreads > 0
            ? t("slaUnreplied").replace("{n}", String(snapshot.unrepliedThreads))
            : null}
        </p>
      ) : null}
    </div>
  );
}
