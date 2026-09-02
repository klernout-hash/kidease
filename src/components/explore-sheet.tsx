import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SheetSnap = "peek" | "mid" | "full";

const HEIGHT: Record<SheetSnap, string> = {
  peek: "22dvh",
  mid: "52dvh",
  full: "86dvh",
};

const ORDER: SheetSnap[] = ["peek", "mid", "full"];

export function ExploreSheet({
  snap,
  onSnap,
  label,
  children,
}: {
  snap: SheetSnap;
  onSnap: (s: SheetSnap) => void;
  label: string;
  children: ReactNode;
}) {
  const startY = useRef(0);
  const startSnap = useRef<SheetSnap>(snap);

  return (
    <div
      className="ke-sheet pointer-events-auto lg:hidden"
      style={{ height: HEIGHT[snap] }}
    >
      <div
        className="flex cursor-grab touch-none flex-col items-center pb-2 pt-2 active:cursor-grabbing"
        onPointerDown={(e) => {
          startY.current = e.clientY;
          startSnap.current = snap;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => {
          const dy = e.clientY - startY.current;
          let i = ORDER.indexOf(startSnap.current);
          if (dy > 48) i = Math.max(0, i - 1);
          else if (dy < -48) i = Math.min(ORDER.length - 1, i + 1);
          onSnap(ORDER[i]!);
        }}
      >
        <span className="mb-2 h-1 w-10 rounded-full bg-border" />
        <p className="text-[13px] font-semibold text-fg">{label}</p>
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-4", snap === "peek" && "overflow-hidden")}>
        {children}
      </div>
    </div>
  );
}
