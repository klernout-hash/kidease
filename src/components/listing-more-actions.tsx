import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

export function ListingMoreActions({
  children,
  compact = false,
  className,
}: {
  children: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useCopy();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className={cn("relative", className)} data-ke="listing-more">
      {compact ? (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={t("listingMoreActions")}
          onClick={() => setOpen((v) => !v)}
        >
          <MoreHorizontal className="size-5" />
        </Button>
      ) : (
        <Button
          type="button"
          variant="secondary"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((v) => !v)}
        >
          {t("listingMore")}
        </Button>
      )}
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 min-w-52 rounded-[14px] bg-surface p-1 shadow-card ring-1 ring-border"
        >
          <div className="flex flex-col" onClick={() => setOpen(false)}>
            {children}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ListingMoreItem({
  children,
  className,
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        "flex min-h-11 w-full items-center gap-2 rounded-[10px] px-3 text-left text-sm font-medium text-fg hover:bg-surface-2",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
