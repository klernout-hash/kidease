import { Award } from "lucide-react";
import { useState } from "react";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

export function GuestFavoriteBadge({
  item,
  compact = false,
  surface = "light",
  className,
}: {
  item: { guestFavorite?: boolean };
  compact?: boolean;
  surface?: "light" | "photo";
  className?: string;
}) {
  const { t } = useCopy();
  const [open, setOpen] = useState(false);
  if (!item.guestFavorite) return null;
  const label = t("guestFavorite");
  const tip = t("guestFavoriteTip");
  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        type="button"
        className={cn(
          "inline-flex items-center gap-1 rounded-full font-semibold leading-none",
          compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
          surface === "photo"
            ? "bg-white/92 text-[#222] shadow-[0_1px_2px_rgba(0,0,0,0.08)] ring-1 ring-black/5 backdrop-blur-[8px]"
            : "bg-[#222] text-white",
        )}
        aria-label={`${label}. ${tip}`}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onBlur={() => setOpen(false)}
      >
        <Award className={compact ? "size-3" : "size-3.5"} strokeWidth={2} />
        {label}
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-30 mt-1.5 w-64 rounded-lg bg-fg px-3 py-2 text-left text-xs font-normal leading-5 text-surface shadow-lift"
        >
          {tip}
        </span>
      ) : null}
    </span>
  );
}
