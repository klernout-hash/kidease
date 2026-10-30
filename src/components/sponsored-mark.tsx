import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import { FEATURE_SPONSORED_LISTINGS } from "@/lib/sponsored-flag";

/** Paid Featured placement. Shown only when the listing data says the centre paid for it. */
export function SponsoredMark({ show, className }: { show?: boolean; className?: string }) {
  const { t } = useCopy();
  if (!FEATURE_SPONSORED_LISTINGS || !show) return null;
  return (
    <span
      data-ke="sponsored"
      className={cn(
        "inline-flex items-center rounded-full bg-[#1c2438] px-2 py-0.5 text-[11px] font-semibold leading-none text-white shadow-[0_1px_3px_rgba(0,0,0,0.28)]",
        className,
      )}
    >
      {t("sponsored")}
    </span>
  );
}
