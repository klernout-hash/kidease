import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useCopy } from "@/lib/use-copy";

export function EarningsSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useCopy();
  const startY = useRef(0);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-fg/40" data-ke="earnings-sheet">
      <button type="button" className="absolute inset-0" aria-label={t("close")} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="ke-screen-enter relative max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-[1.5rem] bg-bg px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3"
        onPointerDown={(event) => {
          startY.current = event.clientY;
        }}
        onPointerUp={(event) => {
          if (event.clientY - startY.current > 72) onClose();
        }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" aria-hidden />
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            data-ke="earnings-sheet-close"
            className="ke-press grid size-11 place-items-center rounded-full touch-manipulation hover:bg-surface"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
