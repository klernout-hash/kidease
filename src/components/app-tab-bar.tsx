import { Link, useRouterState } from "@tanstack/react-router";
import { Building2, ClipboardCheck, ClipboardList, CreditCard, Heart, Map, Menu, MessageCircle, Search } from "lucide-react";
import { useRoleChrome } from "@/components/role-chrome";
import { bottomBarKind } from "@/lib/role-access";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";

/**
 * App-channel bottom tabs. Daycare and parent each have their own five.
 * Guests keep Search / Map / sign-up / Menu. The five lucide icons stay on
 * the bar so Menu cannot drift to labels-only.
 */

export function AppTabBar() {
  const { t } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tab = useRouterState({ select: (s) => (s.location.search as { tab?: string }).tab });
  const desk = useRouterState({ select: (s) => (s.location.search as { desk?: string }).desk });
  const view = useRouterState({ select: (s) => (s.location.search as { view?: string }).view });
  const chrome = useRoleChrome();
  const kind = bottomBarKind({ role: chrome.role, pathname, pending: chrome.pending });
  const plan = chrome.paid ? t("navMyPlan") : t("navUpgrade");

  return (
    <nav
      data-ke="app-tab-bar"
      data-bar={kind}
      className="ke-app-only fixed inset-x-0 bottom-0 z-50 hidden border-t border-border bg-surface [[data-channel=app]_&]:block"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 px-0.5 pb-[env(safe-area-inset-bottom)] pt-1">
        {kind === "daycare" ? (
          <>
            <Tab
              to="/provider"
              label={t("navDesk")}
              icon={Building2}
              active={(pathname === "/provider" || pathname === "/provider/") && !desk}
            />
            <Tab
              to="/provider"
              search={{ desk: "listings" }}
              label={t("navListingShort")}
              icon={ClipboardList}
              active={pathname.startsWith("/provider") && desk === "listings"}
            />
            <Tab
              to="/provider"
              search={{ desk: "requests" }}
              label={t("navEnquiriesShort")}
              icon={ClipboardCheck}
              active={pathname.startsWith("/provider") && desk === "requests"}
            />
            <Tab
              to="/inbox"
              search={{ view: "centre" }}
              label={t("messages")}
              icon={MessageCircle}
              active={pathname.startsWith("/inbox") && view !== "family"}
            />
            <Tab
              to="/provider/subscription"
              label={plan}
              icon={CreditCard}
              marker="upgrade"
              active={pathname.startsWith("/provider/subscription")}
            />
          </>
        ) : null}
        {kind === "parent" ? (
          <>
            <Tab
              to="/"
              label={t("navHome")}
              icon={Building2}
              active={pathname === "/" || pathname.startsWith("/search") || pathname.startsWith("/daycare")}
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
              search={{ tab: "requests" }}
              label={t("navRequestsShort")}
              icon={ClipboardCheck}
              active={pathname.startsWith("/parent") && (tab === "requests" || tab === "enrolled")}
            />
            <Tab
              to="/inbox"
              search={{ view: "family" }}
              label={t("messages")}
              icon={MessageCircle}
              active={pathname.startsWith("/inbox")}
            />
            <Tab
              to="/parent"
              search={{ tab: "payments" }}
              label={plan}
              icon={CreditCard}
              marker="upgrade"
              active={pathname.startsWith("/parent") && tab === "payments"}
            />
          </>
        ) : null}
        {kind === "admin" ? (
          <>
            <Tab to="/parent" label={t("deskParent")} icon={Heart} active={pathname.startsWith("/parent")} />
            <Tab to="/provider" label={t("deskDirector")} icon={Search} active={pathname.startsWith("/provider")} />
            <Tab to="/" label={t("explore")} icon={ClipboardCheck} active={pathname === "/" || pathname.startsWith("/search") || pathname.startsWith("/daycare")} />
            <Tab to="/inbox" label={t("messages")} icon={MessageCircle} active={pathname.startsWith("/inbox")} />
            <Tab to="/menu" label="Menu" icon={Menu} active={pathname.startsWith("/menu")} />
          </>
        ) : null}
        {kind === "guest" ? (
          <>
            <Tab
              to="/"
              label={t("explore")}
              icon={Search}
              active={pathname === "/" || pathname.startsWith("/search") || pathname.startsWith("/daycare")}
            />
            <Tab to="/search" search={{ view: "map" }} label={t("navMap")} icon={Map} active={false} />
            <Tab
              to="/login"
              search={{ role: "parent", desk: "parent", intent: "up", next: "/parent" }}
              label={t("navImParent")}
              icon={ClipboardCheck}
              active={false}
            />
            <Tab
              to="/login"
              search={{ role: "provider", desk: "director", intent: "up", next: "/provider" }}
              label={t("navImDaycare")}
              icon={MessageCircle}
              active={false}
            />
            <Tab to="/menu" label="Menu" icon={Menu} active={pathname.startsWith("/menu")} />
          </>
        ) : null}
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
  marker,
}: {
  to: string;
  label: string;
  icon: typeof Search | typeof Map | typeof Building2 | typeof ClipboardList;
  active: boolean;
  search?: Record<string, string>;
  marker?: string;
}) {
  return (
    <Link
      to={to}
      search={search}
      data-ke="app-tab"
      data-nav={marker}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-[3.35rem] min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden px-0.5 text-center text-[10px] font-medium leading-[1.05] sm:text-[11px]",
        active ? "text-primary" : "text-muted",
      )}
    >
      <Icon
        className="size-5 shrink-0"
        strokeWidth={active ? 2.2 : 1.7}
        fill={active && Icon === Heart ? "currentColor" : "none"}
        aria-hidden
      />
      <span className="line-clamp-2 w-full break-words">{label}</span>
    </Link>
  );
}
