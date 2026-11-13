import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Slot } from "@radix-ui/react-slot";
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
  const wrap = useRef<HTMLDetailsElement>(null);
  const close = useCallback((restoreFocus = false) => {
    const details = wrap.current;
    if (details) details.open = false;
    setOpen(false);
    if (restoreFocus) details?.querySelector("summary")?.focus();
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrap.current?.open && !wrap.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && wrap.current?.open) {
        close(true);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [close]);

  return (
    <details
      ref={wrap}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }}
      className={cn("relative", className)}
      data-ke="listing-more"
    >
      {compact ? (
        <Button
          variant="secondary"
          size="icon"
          asChild
        >
          <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden" aria-label={t("listingMoreActions")}>
            <MoreHorizontal className="size-5" aria-hidden />
          </summary>
        </Button>
      ) : (
        <Button
          variant="secondary"
          asChild
        >
          <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden">{t("listingMore")}</summary>
        </Button>
      )}
        <div
          role="group"
          aria-label={t("listingMoreActions")}
          className={cn(
            "absolute right-0 z-30 max-h-[min(70dvh,32rem)] min-w-52 overflow-y-auto rounded-xl bg-surface p-1 shadow-card ring-1 ring-border",
            compact ? "bottom-full mb-2" : "mt-2",
          )}
        >
          <div className="flex flex-col" onClick={() => close()}>
            {children}
          </div>
        </div>
    </details>
  );
}

export function ListingMoreItem({
  children,
  className,
  asChild = false,
  ...props
}: ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      {...(asChild ? {} : { type: "button" as const })}
      className={cn(
        "flex min-h-[44px] min-w-[44px] w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium text-fg hover:bg-surface-2",
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}
