import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

export function PriorityPill({ className }: { className?: string }) {
  const { t } = useCopy();
  return (
    <span
      className={cn(
        "ke-priority-pill inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-fg",
        className,
      )}
    >
      {t("priority")}
    </span>
  );
}
