import { Link } from "@tanstack/react-router";
import { MenuRow } from "@/components/menu-row";
import { roleNavItems, type ChromeRole } from "@/lib/role-access";
import { cn } from "@/lib/utils";

export function RoleNavLinks({
  role,
  paid = false,
  appearance = "header",
  onNavigate,
}: {
  role: ChromeRole;
  paid?: boolean;
  appearance?: "header" | "menu" | "drawer";
  onNavigate?: () => void;
}) {
  const items = roleNavItems({ role, paid });
  if (appearance === "header") {
    return (
      <nav
        data-ke="role-nav"
        data-role={role}
        aria-label="KidEase"
        className="hidden min-w-0 items-center gap-0.5 md:flex"
      >
        {items.map((item) => (
          <Link
            key={item.id}
            to={item.to}
            search={item.search}
            data-nav={item.id}
            onClick={onNavigate}
            className={cn(
              "shrink-0 rounded-full px-3 py-2 text-sm font-medium",
              item.id === "upgrade" && !paid && "bg-primary text-primary-fg hover:bg-primary",
              item.id === "upgrade" && paid && "bg-surface text-fg ring-1 ring-border hover:bg-surface",
              item.id !== "upgrade" && "text-fg hover:bg-surface",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav data-ke="role-nav" data-role={role} aria-label="KidEase">
      {items.map((item) => (
        <MenuRow
          key={item.id}
          to={item.to}
          search={item.search}
          label={item.label}
          icon={item.icon}
          appearance={appearance === "drawer" ? "drawer" : "page"}
          marker={item.id}
          emphasis={item.id === "upgrade" && !paid}
          onClick={onNavigate}
        />
      ))}
    </nav>
  );
}
