import { Link, useRouterState } from "@tanstack/react-router";
import { Building2, Calendar, ClipboardCheck, ClipboardList, Heart, Home, LifeBuoy, Menu, MessageCircle, Search } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { CountBadge } from "@/components/count-badge";
import { useSessionDesks } from "@/components/session-desks";
import { useRoleChrome } from "@/components/role-chrome";
import { attentionForItem } from "@/lib/attention";
import { highlightDesk, parseDeskQuery } from "@/lib/desks";
import { bottomBarKindInShell } from "@/lib/native-admin";
import { bottomBarKind } from "@/lib/role-access";
import { hapticLight, isNative } from "@/lib/native";
import { useNativeHidesAdmin } from "@/lib/use-native-shell";
import { nativeStoreTabs, type NativeStoreTabId } from "@/lib/native-store-tabs";
import { deskHrefForLocale, inboxListPath, menuDeskPath, parentDeskPath, providerDeskPath, supportDeskPath } from "@/lib/desk-nav";
import { allows, type StaffGrants } from "@/lib/staff-permissions";
import { localePath, stripLocalePrefix } from "@/lib/locale-path";
import { governmentHomePath } from "@/lib/sign-out-target";
import { useCopy } from "@/lib/use-copy";
import { useAirbnbUi } from "@/lib/use-airbnb-ui";
import { cn } from "@/lib/utils";

/**
 * Phone tab bar. The last tab is Menu for every role.
 * Daycare: Today, Calendar, Listings, Messages, Menu.
 * Parent: Search, Saved, Requests, Inbox, Menu.
 * Signed out: Search, Saved, Menu.
 */

export function AppTabBar() {
  const { t, locale } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bare = stripLocalePrefix(pathname);
  const tab = useRouterState({ select: (s) => (s.location.search as { tab?: string }).tab });
  const desk = useRouterState({ select: (s) => (s.location.search as { desk?: string }).desk });
  const view = useRouterState({ select: (s) => (s.location.search as { view?: string }).view });
  const chrome = useRoleChrome();
  const { session, sticky } = useSessionDesks();
  const hideAdmin = useNativeHidesAdmin();
  const airbnb = useAirbnbUi();
  const kind = bottomBarKindInShell(
    bottomBarKind({
      role: chrome.role,
      pathname,
      pending: chrome.pending,
      highlightedDesk: highlightDesk(pathname, sticky, parseDeskQuery(desk)),
    }),
    hideAdmin,
  );
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(isNative());
  }, []);
  // One bar only: if a nested Shell mounts a second AppTabBar, the later one renders nothing.
  const [primary, setPrimary] = useState(true);
  useEffect(() => {
    const owner = (window as { __keTabBarOwner?: object }).__keTabBarOwner;
    const me = {};
    if (owner) {
      setPrimary(false);
      return;
    }
    (window as { __keTabBarOwner?: object }).__keTabBarOwner = me;
    return () => {
      if ((window as { __keTabBarOwner?: object }).__keTabBarOwner === me) delete (window as { __keTabBarOwner?: object }).__keTabBarOwner;
    };
  }, []);
  // Keyboard open (visual viewport shrinks): hide the bar rather than lifting it mid-screen.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const check = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      if (covered > 120 || (typing && covered > 40)) root.dataset.keyboard = "open";
      else delete root.dataset.keyboard;
    };
    check();
    vv.addEventListener("resize", check);
    vv.addEventListener("scroll", check);
    window.addEventListener("focusin", check);
    window.addEventListener("focusout", check);
    return () => {
      vv.removeEventListener("resize", check);
      vv.removeEventListener("scroll", check);
      window.removeEventListener("focusin", check);
      window.removeEventListener("focusout", check);
      delete root.dataset.keyboard;
    };
  }, []);
  const storeTabs = native ? nativeStoreTabs(kind) : null;
  const daycareGrants = session?.centreOwner ? null : session?.centreGrants;
  const daycareTabs = kind === "daycare" && !storeTabs ? daycareTabCount(daycareGrants, session?.hostListing === true) : 0;
  const requestBadge = attentionForItem(session?.attention, "bookings");
  const menuActive = bare === "/menu" || bare.startsWith("/menu/");

  if (!primary) return null;

  return (
    <>
      <nav
        data-ke="app-tab-bar"
        data-bar={storeTabs ? "store" : kind}
        className="ke-app-only fixed inset-x-0 bottom-0 z-50 hidden border-t border-border bg-surface pb-[var(--ke-safe-bottom,env(safe-area-inset-bottom))] pl-[var(--ke-safe-left,env(safe-area-inset-left))] pr-[var(--ke-safe-right,env(safe-area-inset-right))] [[data-channel=app]_&]:block"
      >
        <div
          className={cn(
            "mx-auto grid max-w-lg gap-x-[8px] px-1 pt-1 md:max-w-3xl",
            storeTabs
              ? "grid-cols-4"
              : daycareTabs > 0 && daycareTabs !== 5
                ? "grid-cols-[repeat(var(--ke-tab-cols),minmax(0,1fr))]"
              : airbnb && kind === "parent"
                ? "grid-cols-5"
              : airbnb && kind === "guest"
                ? "grid-cols-4"
                : kind === "guest"
                  ? "grid-cols-3"
                  : "grid-cols-5",
          )}
          // A CSS variable, not an inline grid template, so the side rail (styles.css) can stack the same tabs.
          style={daycareTabs > 0 && daycareTabs !== 5 ? ({ "--ke-tab-cols": daycareTabs } as CSSProperties) : undefined}
        >
          {storeTabs
            ? storeTabs.map((item) => (
                <Tab
                  key={item.id}
                  to={deskHrefForLocale(item.to, pathname)}
                  search={item.search}
                  label={t(item.id === "search" ? "search" : item.id === "saved" ? "saved" : item.id === "messages" ? "messages" : "account")}
                  icon={item.id === "search" ? Search : item.id === "saved" ? Heart : item.id === "messages" ? MessageCircle : Menu}
                  active={storeTabActive(item.id, pathname, tab)}
                  onClick={() => {
                    void hapticLight();
                  }}
                />
              ))
            : null}
          {!storeTabs && kind === "daycare" ? (
            <DaycareTabs
              pathname={pathname}
              bare={bare}
              desk={desk}
              view={view}
              menuActive={menuActive}
              hostListing={session?.hostListing === true}
              grants={session?.centreOwner ? null : session?.centreGrants}
            />
          ) : null}
          {kind === "parent" && !storeTabs && !airbnb ? (
            <>
              <Tab
                to={localePath("/search", locale)}
                label={t("search")}
                icon={Search}
                marker="search"
                active={bare === "/search" || bare.startsWith("/search/")}
              />
              <Tab
                to={parentDeskPath(pathname)}
                search={{ tab: "saved" }}
                label={t("saved")}
                icon={Heart}
                marker="saved"
                active={bare.startsWith("/parent") && tab === "saved"}
              />
              <Tab
                to={parentDeskPath(pathname)}
                search={{ tab: "requests" }}
                label={t("navRequestsShort")}
                icon={ClipboardCheck}
                marker="bookings"
                badge={requestBadge}
                active={bare.startsWith("/parent") && (tab === "requests" || tab === "enrolled" || tab === "waitlists" || tab === "tours")}
              />
              <Tab
                to={inboxListPath(pathname)}
                search={{ view: "family" }}
                label={t("inbox")}
                icon={MessageCircle}
                marker="messages"
                active={bare.startsWith("/inbox")}
              />
              <MenuTab active={menuActive} />
            </>
          ) : null}
          {kind === "parent" && !storeTabs && airbnb ? (
            <>
              <Tab
                to={localePath("/", locale)}
                label={t("explore")}
                icon={Search}
                marker="explore"
                active={bare === "/" || bare.startsWith("/search") || bare.startsWith("/daycare")}
              />
              <Tab
                to={parentDeskPath(pathname)}
                search={{ tab: "saved" }}
                label={t("saved")}
                icon={Heart}
                marker="saved"
                active={bare.startsWith("/parent") && tab === "saved"}
              />
              <Tab
                to={parentDeskPath(pathname)}
                search={{ tab: "requests" }}
                label={t("navRequestsShort")}
                icon={ClipboardCheck}
                marker="bookings"
                badge={requestBadge}
                active={bare.startsWith("/parent") && (tab === "requests" || tab === "enrolled" || tab === "waitlists" || tab === "tours")}
              />
              <Tab
                to={inboxListPath(pathname)}
                search={{ view: "family" }}
                label={t("messages")}
                icon={MessageCircle}
                marker="messages"
                active={bare.startsWith("/inbox")}
              />
              <MenuTab active={menuActive} />
            </>
          ) : null}
          {kind === "admin" && !storeTabs ? (
            <>
              <Tab to="/admin" search={{ tab: "queue" }} label={t("navHome")} icon={Home} marker="queue" active={pathname.startsWith("/admin") && (!tab || tab === "queue")} />
              <Tab to="/admin" search={{ tab: "verify" }} label={t("navReview")} icon={ClipboardCheck} marker="verify" active={pathname.startsWith("/admin") && tab === "verify"} />
              <Tab to="/admin" search={{ tab: "mail" }} label={t("messages")} icon={MessageCircle} marker="mail" active={pathname.startsWith("/admin") && tab === "mail"} />
              <Tab to={supportDeskPath(pathname)} label={t("support")} icon={LifeBuoy} marker="support" active={bare.startsWith("/support")} />
              <MenuTab active={menuActive} />
            </>
          ) : null}
          {kind === "government" && !storeTabs ? (
            <>
              <Tab to={governmentHomePath(pathname, locale)} label={locale === "fr" ? "Bureau" : "Desk"} icon={Building2} marker="gov" active={bare.startsWith("/gov")} />
              <Tab to={localePath("/search", locale)} label={locale === "fr" ? "Fiches" : "Listings"} icon={Search} marker="listings" active={bare === "/search" || bare.startsWith("/search/") || bare.startsWith("/daycare")} />
              <Tab to="/account" search={{ tab: "profile" }} label={t("account")} icon={Menu} marker="account" active={bare.startsWith("/account")} />
            </>
          ) : null}
          {kind === "guest" && !storeTabs && !airbnb ? (
            <>
              <Tab
                to={localePath("/search", locale)}
                label={t("search")}
                icon={Search}
                marker="search"
                active={bare === "/search" || bare.startsWith("/search/") || bare === "/"}
              />
              <Tab
                to={localePath("/login", locale)}
                search={{ next: "/parent?tab=saved" }}
                label={t("saved")}
                icon={Heart}
                marker="saved"
                active={false}
              />
              <MenuTab active={menuActive} />
            </>
          ) : null}
          {kind === "guest" && !storeTabs && airbnb ? (
            <>
              <Tab
                to={localePath("/", locale)}
                label={t("explore")}
                icon={Search}
                marker="explore"
                active={bare === "/" || bare.startsWith("/search") || bare.startsWith("/daycare")}
              />
              <Tab
                to={localePath("/login", locale)}
                search={{ next: "/parent?tab=saved" }}
                label={t("saved")}
                icon={Heart}
                marker="saved"
                active={false}
              />
              <Tab
                to={localePath("/login", locale)}
                search={{ next: "/inbox" }}
                label={t("messages")}
                icon={MessageCircle}
                marker="messages"
                active={false}
              />
              <MenuTab active={menuActive} />
            </>
          ) : null}
        </div>
      </nav>
    </>
  );
}

function daycareTabCount(grants: StaffGrants | null | undefined, hostListing: boolean): number {
  return daycareTabPlan(grants, hostListing).length;
}

function daycareTabPlan(
  grants: StaffGrants | null | undefined,
  hostListing: boolean,
): Array<"today" | "calendar" | "listings" | "messages" | "menu"> {
  const show = (area: "calendar" | "listing" | "messages" | "requests") => !grants || allows(grants, area, "view");
  const plan: Array<"today" | "calendar" | "listings" | "messages" | "menu"> = ["today"];
  if (hostListing ? show("calendar") : show("requests")) plan.push("calendar");
  if (show("listing")) plan.push("listings");
  if (show("messages")) plan.push("messages");
  plan.push("menu");
  return plan;
}

function DaycareTabs({
  pathname,
  bare,
  desk,
  view,
  menuActive,
  hostListing,
  grants,
}: {
  pathname: string;
  bare: string;
  desk?: string;
  view?: string;
  menuActive: boolean;
  hostListing: boolean;
  grants: StaffGrants | null | undefined;
}) {
  const { t } = useCopy();
  const calendarDesk = hostListing ? "calendar" : "tours";
  const plan = daycareTabPlan(grants, hostListing);
  return (
    <>
      {plan.includes("today") ? (
        <Tab
          to={providerDeskPath(pathname)}
          search={{ desk: "today" }}
          label={t("todayHome")}
          icon={Building2}
          marker="today"
          active={(bare === "/provider" || bare === "/provider/") && (!desk || desk === "today")}
        />
      ) : null}
      {plan.includes("calendar") ? (
        <Tab
          to={providerDeskPath(pathname)}
          search={{ desk: calendarDesk }}
          label={t("navCalendar")}
          icon={Calendar}
          marker="calendar"
          active={bare.startsWith("/provider") && desk === calendarDesk}
        />
      ) : null}
      {plan.includes("listings") ? (
        <Tab
          to={providerDeskPath(pathname)}
          search={{ desk: "listings" }}
          label={t("deskNavListings")}
          icon={ClipboardList}
          marker="listings"
          active={bare.startsWith("/provider") && desk === "listings"}
        />
      ) : null}
      {plan.includes("messages") ? (
        <Tab
          to={inboxListPath(pathname)}
          search={{ view: "centre" }}
          label={t("messages")}
          icon={MessageCircle}
          marker="messages"
          active={bare.startsWith("/inbox") && view !== "family"}
        />
      ) : null}
      <MenuTab active={menuActive} />
    </>
  );
}

function storeTabActive(id: NativeStoreTabId, pathname: string, tab: string | undefined): boolean {
  const bare = stripLocalePrefix(pathname);
  if (id === "search") {
    return bare === "/" || bare.startsWith("/search") || bare.startsWith("/daycare");
  }
  if (id === "saved") return bare.startsWith("/parent") && tab === "saved";
  if (id === "messages") return bare.startsWith("/inbox");
  return bare === "/menu" || pathname.startsWith("/account");
}

function MenuTab({ active }: { active: boolean }) {
  const { t } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return <Tab to={menuDeskPath(pathname)} search={{}} label={t("navMenu")} icon={Menu} marker="menu" active={active} />;
}

function Tab({
  to,
  label,
  icon: Icon,
  active,
  search,
  marker,
  badge = 0,
  onClick,
}: {
  to: string;
  label: string;
  icon: typeof Search;
  active: boolean;
  search?: Record<string, string>;
  marker?: string;
  badge?: number;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      search={search}
      onClick={onClick}
      data-ke="app-tab"
      data-nav={marker}
      aria-current={active ? "page" : undefined}
      className={cn(
        "ke-press relative flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 overflow-hidden px-0.5 text-center text-[0.72rem] font-medium leading-[1.15] tracking-[-0.01em] touch-manipulation",
        active ? "text-primary" : "text-muted",
      )}
    >
      <span
        className={cn(
          "absolute left-1/2 top-0 h-0.5 w-6 -translate-x-1/2 rounded-full",
          active ? "bg-primary" : "bg-transparent",
        )}
        aria-hidden
      />
      <span className="relative">
        <Icon
          className="size-5 shrink-0"
          strokeWidth={active ? 2.2 : 1.7}
          fill={active && Icon === Heart ? "currentColor" : "none"}
          aria-hidden
        />
        <CountBadge count={badge} className="absolute -right-2.5 -top-1.5" />
      </span>
      <span className="line-clamp-1 w-full">{label}</span>
    </Link>
  );
}
