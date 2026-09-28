import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { MenuGlyph } from "@/components/menu-row";
import type { MenuIconId } from "@/lib/menu-icons";
import { cn } from "@/lib/utils";

/** Facebook-style row that expands settings or help instead of dumping every link. */
export function MenuAccordion({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: MenuIconId;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className="border-b border-border" data-ke="menu-accordion" data-open={open ? "1" : "0"}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-14 w-full items-center justify-between gap-3 px-1 text-left text-[15px] font-medium text-fg"
      >
        <span className="flex min-w-0 items-center gap-3">
          <MenuGlyph id={icon} />
          <span className="truncate">{title}</span>
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-muted transition-transform", open && "rotate-180")} strokeWidth={1.7} aria-hidden />
      </button>
      {open ? (
        <div id={panelId} className="pb-2 pl-8">
          {children}
        </div>
      ) : null}
    </section>
  );
}
