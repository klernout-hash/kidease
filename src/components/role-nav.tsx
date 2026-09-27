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
              "shrink-0 rounded-full px-2.5 py-2 text-sm font-medium text-fg hover:bg-surface",
              item.id === "upgrade" && "text-primary",
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
          onClick={onNavigate}
        />
      ))}
    </nav>
  );
}
