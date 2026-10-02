import { formatAttention } from "@/lib/attention";
import { cn } from "@/lib/utils";

export function CountBadge({
  count,
  className,
  marker = "count-badge",
}: {
  count: number;
  className?: string;
  marker?: string;
}) {
  const label = formatAttention(count);
  if (!label) return null;
  return (
    <span
      data-ke={marker}
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold leading-none text-white",
        className,
      )}
    >
      {label}
    </span>
  );
}
