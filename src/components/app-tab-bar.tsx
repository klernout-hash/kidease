import { Link, useRouterState } from "@tanstack/react-router";
import { Building2, Calendar, ClipboardCheck, ClipboardList, Heart, Home, LifeBuoy, Menu, MessageCircle, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RoleSwitchPill } from "@/components/role-switch-pill";
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
import { localePath, stripLocalePrefix } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";
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
  const barRef = useRef<HTMLElement>(null);
  useEffect(() => {
    setNative(isNative());
  }, []);
  useEffect(() => {
    const el = barRef.current;
    const vv = window.visualViewport;
    if (!vv || !el) return;
    const pin = () => {
      const lift = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      el.style.bottom = lift > 0 ? `${lift}px` : "";
    };
    pin();
    vv.addEventListener("resize", pin);
    vv.addEventListener("scroll", pin);
    window.addEventListener("orientationchange", pin);
    return () => {
      vv.removeEventListener("resize", pin);
      vv.removeEventListener("scroll", pin);
      window.removeEventListener("orientationchange", pin);
      el.style.bottom = "";
    };
  }, []);
  const storeTabs = native ? nativeStoreTabs(kind) : null;
  const requestBadge = attentionForItem(session?.attention, "bookings");
  const menuActive = bare === "/menu" || bare.startsWith("/menu/");

  return (
    <>
      <RoleSwitchPill />
      <nav
        ref={barRef}
        data-ke="app-tab-bar"
        data-bar={storeTabs ? "store" : kind}
        className="ke-app-only fixed inset-x-0 bottom-0 z-50 hidden border-t border-slate-200/80 bg-surface/95 pb-[env(safe-area-inset-bottom)] pb-[var(--ke-safe-bottom,env(safe-area-inset-bottom))] pl-[var(--ke-safe-left,env(safe-area-inset-left))] pr-[var(--ke-safe-right,env(safe-area-inset-right))] backdrop-blur-md dark:border-white/15 [[data-channel=app]_&]:block"
      >
        <div
          className={cn(
            "mx-auto grid max-w-lg px-1 pt-1 md:max-w-3xl",
            storeTabs ? "grid-cols-4" : kind === "guest" ? "grid-cols-3" : "grid-cols-5",
          )}
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
            <>
              <Tab
                to={providerDeskPath(pathname)}
                search={{ desk: "today" }}
                label={t("todayHome")}
                icon={Building2}
                marker="today"
                active={(bare === "/provider" || bare === "/provider/") && (!desk || desk === "today")}
              />
              <Tab
                to={providerDeskPath(pathname)}
                search={{ desk: "tours" }}
                label={t("navCalendar")}
                icon={Calendar}
                marker="calendar"
                active={bare.startsWith("/provider") && desk === "tours"}
              />
              <Tab
                to={providerDeskPath(pathname)}
                search={{ desk: "listings" }}
                label={t("deskNavListings")}
                icon={ClipboardList}
                marker="listings"
                active={bare.startsWith("/provider") && desk === "listings"}
              />
              <Tab
                to={inboxListPath(pathname)}
                search={{ view: "centre" }}
                label={t("messages")}
                icon={MessageCircle}
                marker="messages"
                active={bare.startsWith("/inbox") && view !== "family"}
              />
              <MenuTab active={menuActive} />
            </>
          ) : null}
          {kind === "parent" && !storeTabs ? (
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
                active={bare.startsWith("/parent") && (tab === "requests" || tab === "enrolled")}
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
          {kind === "admin" && !storeTabs ? (
            <>
              <Tab to="/admin" search={{ tab: "queue" }} label={t("navHome")} icon={Home} marker="queue" active={pathname.startsWith("/admin") && (!tab || tab === "queue")} />
              <Tab to="/admin" search={{ tab: "verify" }} label={t("navReview")} icon={ClipboardCheck} marker="verify" active={pathname.startsWith("/admin") && tab === "verify"} />
              <Tab to="/admin" search={{ tab: "mail" }} label={t("messages")} icon={MessageCircle} marker="mail" active={pathname.startsWith("/admin") && tab === "mail"} />
              <Tab to={supportDeskPath(pathname)} label={t("support")} icon={LifeBuoy} marker="support" active={bare.startsWith("/support")} />
              <MenuTab active={menuActive} />
            </>
          ) : null}
          {kind === "guest" && !storeTabs ? (
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
        </div>
      </nav>
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
  return <Tab to={menuDeskPath(pathname)} label={t("navMenu")} icon={Menu} marker="menu" active={active} />;
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
        "ke-press relative flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 overflow-hidden px-0.5 text-center text-[0.72rem] font-medium leading-[1.15] tracking-[-0.01em] touch-manipulation",
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
