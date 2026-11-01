import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

/** Small blue verified check. The words stay in the accessible name and tooltip. */
export function VerifiedCheck({ className }: { className?: string }) {
  const { t } = useCopy();
  const label = t("verifiedCheckLabel");
  const [open, setOpen] = useState(false);
  return (
    <span className="pointer-events-auto relative inline-flex">
      <button
        type="button"
        className={cn(
          "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-primary touch-manipulation",
          className,
        )}
        data-ke="verified-check"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        onBlur={() => setOpen(false)}
      >
        <BadgeCheck className="size-4" aria-hidden strokeWidth={2} />
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-30 mt-1.5 w-64 rounded-lg bg-fg px-3 py-2 text-left text-xs font-normal leading-5 text-surface shadow-lift"
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
