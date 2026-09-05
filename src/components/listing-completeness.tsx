import { listingCompleteness, type CompletenessField } from "@/lib/listing-readiness";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";
import type { Daycare } from "@/lib/types";

const NEED_KEY: Record<CompletenessField, CopyKey> = {
  fees: "completeNeedFees",
  ages: "completeNeedAges",
  hours: "completeNeedHours",
  license: "completeNeedLicense",
  photo: "completeNeedPhoto",
};

export function CompletenessMark({
  ready,
  className,
}: {
  ready?: boolean;
  className?: string;
}) {
  const { t } = useCopy();
  if (ready !== false) return null;
  return <span className={className}>{t("detailsIncomplete")}</span>;
}

export function CompletenessBanner({ item }: { item: Daycare }) {
  const { t } = useCopy();
  const complete = listingCompleteness(item);
  if (complete.ready) return null;
  return (
    <div className="mt-3 rounded-lg bg-surface p-3 text-sm ring-1 ring-border">
      <p className="font-medium">{t("detailsIncomplete")}</p>
      <p className="mt-1 text-muted">{t("detailsIncompleteLead")}</p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted">
        {complete.missing.map((field) => (
          <li key={field}>{t(NEED_KEY[field])}</li>
        ))}
      </ul>
    </div>
  );
}

export function CompletenessChecklist({ item }: { item: Daycare }) {
  const { t } = useCopy();
  const complete = listingCompleteness(item);
  return (
    <div className="mt-4 rounded-lg bg-bg p-4 text-sm ring-1 ring-border">
      <p className="font-medium">{t("completenessTitle")}</p>
      <p className="mt-1 text-muted">{t("completenessLead")}</p>
      <p className="mt-2 text-xs text-subtle">
        {complete.ready ? t("detailsReady") : `${t("detailsIncomplete")} · ${complete.score}/5`}
      </p>
      <ul className="mt-3 space-y-1.5">
        {(["fees", "ages", "hours", "license", "photo"] as CompletenessField[]).map((field) => {
          const ok = !complete.missing.includes(field);
          return (
            <li key={field} className={ok ? "text-muted" : "text-fg"}>
              <span className="mr-2 tabular-nums">{ok ? "✓" : "–"}</span>
              {t(NEED_KEY[field])}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
