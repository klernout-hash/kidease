import { Link } from "@tanstack/react-router";
import { MenuRow } from "@/components/menu-row";
import { roleNavItems, type ChromeRole } from "@/lib/role-access";
import type { CopyKey } from "@/lib/copy";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

const NAV_KEY: Record<string, CopyKey> = {
  home: "navHome",
  search: "search",
  saved: "saved",
  requests: "navRequests",
  messages: "messages",
  upgrade: "navUpgrade",
  account: "account",
  desk: "navDesk",
  listing: "navListing",
  enquiries: "navEnquiries",
  jobs: "navJobs",
  queue: "navApprovals",
  support: "navSupport",
  map: "navMap",
  "parent-signup": "navImParent",
  "daycare-signup": "navImDaycare",
  signin: "signIn",
};

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
  const { t } = useCopy();
  const items = roleNavItems({ role, paid }).map((item) => ({
    ...item,
    label: item.id === "upgrade" ? t(paid ? "navMyPlan" : "navUpgrade") : NAV_KEY[item.id] ? t(NAV_KEY[item.id]) : item.label,
  }));
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
