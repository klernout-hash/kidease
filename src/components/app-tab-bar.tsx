import { Link, useRouterState } from "@tanstack/react-router";
import { ClipboardCheck, Heart, Menu, MessageCircle, Search } from "lucide-react";
import { useSessionDesks } from "@/components/session-desks";
import { inboxSearch, inboxViewForDesk } from "@/lib/inbox-view";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

/**
 * App-channel bottom tabs. Shared by the full shell and the /menu lite shell
 * so Menu cannot drift to labels-only.
 */
export function AppTabBar() {
  const { t } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tab = useRouterState({ select: (s) => (s.location.search as { tab?: string }).tab });
  const { sticky } = useSessionDesks();

  return (
    <nav
      data-ke="app-tab-bar"
      className="ke-app-only fixed inset-x-0 bottom-0 z-50 hidden border-t border-border bg-surface [[data-channel=app]_&]:block"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 px-0.5 pb-[env(safe-area-inset-bottom)] pt-1">
        <Tab
          to="/"
          label={t("explore")}
          icon={Search}
          active={
            pathname === "/" ||
            pathname === "/fr" ||
            pathname.startsWith("/search") ||
            pathname.startsWith("/fr/search") ||
            pathname.startsWith("/daycare")
          }
        />
        <Tab
          to="/parent"
          search={{ tab: "saved" }}
          label={t("saved")}
          icon={Heart}
          active={pathname.startsWith("/parent") && tab === "saved"}
        />
        <Tab
          to="/parent"
          search={{ tab: "enrolled" }}
          label={t("enrolled")}
          icon={ClipboardCheck}
          active={pathname.startsWith("/parent") && tab === "enrolled"}
        />
        <Tab
          to="/inbox"
          search={inboxSearch(inboxViewForDesk(sticky))}
          label={t("messages")}
          icon={MessageCircle}
          active={pathname.startsWith("/inbox")}
        />
        <Tab to="/menu" label="Menu" icon={Menu} active={pathname.startsWith("/menu")} />
      </div>
    </nav>
  );
}

function Tab({
  to,
  label,
  icon: Icon,
  active,
  search,
}: {
  to: string;
  label: string;
  icon: typeof Search;
  active: boolean;
  search?: Record<string, string>;
}) {
  return (
    <Link
      to={to}
      search={search}
      data-ke="app-tab"
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 text-[11px] font-medium tracking-wide",
        active ? "text-primary" : "text-muted",
      )}
    >
      <Icon
        className="size-5 shrink-0"
        strokeWidth={active ? 2.2 : 1.7}
        fill={active && Icon === Heart ? "currentColor" : "none"}
        aria-hidden
      />
      {label}
    </Link>
  );
}
