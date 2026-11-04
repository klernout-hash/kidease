import { topRatedEnabled } from "@/lib/features";
import { useCopy } from "@/lib/use-copy";

/** Hidden until FEATURE_TOP_RATED_BADGE is on, and only when the centre passed. */
export function TopRatedBadge({ pass }: { pass?: boolean | null }) {
  const { t } = useCopy();
  if (!topRatedEnabled() || pass !== true) return null;
  return (
    <span
      className="inline-flex min-h-11 items-center rounded-full bg-surface px-3 text-xs font-semibold text-fg ring-1 ring-border"
      title={t("topRatedBadgeTip")}
    >
      {t("topRatedBadge")}
    </span>
  );
}
