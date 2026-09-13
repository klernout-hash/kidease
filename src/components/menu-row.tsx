import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { menuIcon, type MenuIconId } from "@/lib/menu-icons";
import { cn } from "@/lib/utils";

const rowClass =
  "flex min-h-14 items-center justify-between gap-3 border-b border-border px-1 text-[15px] text-fg last:border-b-0";
const drawerClass =
  "flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-fg hover:bg-surface";

export function MenuGlyph({ id, className }: { id: MenuIconId; className?: string }) {
  const Icon = menuIcon(id);
  return <Icon className={cn("size-5 shrink-0 text-muted", className)} strokeWidth={1.7} aria-hidden />;
}

export function MenuRow({
  to,
  search,
  label,
  href,
  icon,
  badge,
  appearance = "page",
  onClick,
}: {
  to?: string;
  search?: Record<string, string>;
  label: string;
  href?: string;
  icon: MenuIconId;
  badge?: ReactNode;
  appearance?: "page" | "drawer";
  onClick?: () => void;
}) {
  const className = appearance === "drawer" ? drawerClass : rowClass;
  const trailing =
    appearance === "page" ? (
      <span className="flex items-center gap-2">
        {badge}
        <span className="ke-menu-chevron" aria-hidden />
      </span>
    ) : (
      badge
    );
  const inner = (
    <>
      <span className="flex min-w-0 items-center gap-3">
        <MenuGlyph id={icon} />
        <span className="truncate">{label}</span>
      </span>
      {trailing}
    </>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" onClick={onClick} className={className}>
        {inner}
      </a>
    );
  }
  return (
    <Link to={to ?? "/"} search={search} onClick={onClick} className={className}>
      {inner}
    </Link>
  );
}
