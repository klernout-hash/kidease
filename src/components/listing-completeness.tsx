import { ListingHealthPanel } from "@/components/listing-health";
import { listingCompleteness, photoFreshness, photoTimestamp, type CompletenessField } from "@/lib/listing-readiness";
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

const CARD_NEED_KEY: Record<CompletenessField, CopyKey> = {
  fees: "cardNeedFees",
  ages: "cardNeedAges",
  hours: "cardNeedHours",
  license: "cardNeedLicense",
  photo: "cardNeedPhoto",
};

/** Quiet parent-facing hint. Uses the first missing fact — never invents one. */
export function parentIncompleteLabel(
  item: Pick<Daycare, "detailsReady" | "completenessMissing" | "lastPhotoUpdatedAt">,
  t: (key: CopyKey) => string,
): string | null {
  if (item.detailsReady !== false) {
    if (photoFreshness(photoTimestamp(item)).kind === "stale") return t("cardPhotoStale");
    return null;
  }
  const first = item.completenessMissing?.[0];
  if (first) return t(CARD_NEED_KEY[first]);
  return t("detailsIncomplete");
}

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
    <div className="text-sm">
      <p className="font-medium">{t("detailsIncomplete")}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
        {complete.missing.map((field) => (
          <li key={field}>{t(NEED_KEY[field])}</li>
        ))}
      </ul>
    </div>
  );
}

export function CompletenessChecklist({ item }: { item: Daycare }) {
  return <ListingHealthPanel item={item} />;
}
