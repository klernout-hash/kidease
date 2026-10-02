import { Link, useRouterState } from "@tanstack/react-router";
import { Building2, ClipboardCheck, ClipboardList, Heart, Home, LifeBuoy, MessageCircle, Search, User } from "lucide-react";
import { useEffect, useState } from "react";
import { ProfileAvatar } from "@/components/profile-avatar";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useRoleChrome } from "@/components/role-chrome";
import { bottomBarKind } from "@/lib/role-access";
import { hapticLight, isNative } from "@/lib/native";
import { nativeStoreTabs, type NativeStoreTabId } from "@/lib/native-store-tabs";
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
  const { user } = useCurrentUserState();
  const kind = bottomBarKind({ role: chrome.role, pathname, pending: chrome.pending });
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(isNative());
  }, []);
  const storeTabs = native ? nativeStoreTabs(kind) : null;
  const storeLabel: Record<NativeStoreTabId, string> = {
    search: t("search"),
    saved: t("saved"),
    messages: t("messages"),
    account: t("account"),
  };
  const storeIcon = {
    search: Search,
    saved: Heart,
    messages: MessageCircle,
    account: User,
  } as const;

  return (
    <nav
      data-ke="app-tab-bar"
      data-bar={storeTabs ? "store" : kind}
      className="ke-app-only fixed inset-x-0 bottom-0 z-50 hidden border-t border-border bg-surface [[data-channel=app]_&]:block"
    >
      <div
        className={cn(
          "mx-auto grid max-w-lg px-0.5 pb-[env(safe-area-inset-bottom)] pt-1",
          storeTabs || kind === "guest" ? "grid-cols-4" : "grid-cols-5",
        )}
      >
        {storeTabs
          ? storeTabs.map((item) => (
              <Tab
                key={item.id}
                to={item.to}
                search={item.search}
                label={storeLabel[item.id]}
                icon={storeIcon[item.id]}
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
              to="/provider"
              search={{ desk: "today" }}
              label={t("todayHome")}
              icon={Building2}
              marker="today"
              active={(pathname === "/provider" || pathname === "/provider/") && (!desk || desk === "today")}
            />
            <Tab
              to="/provider"
              search={{ desk: "requests" }}
              label={t("navRequestsShort")}
              icon={ClipboardCheck}
              marker="requests"
              active={pathname.startsWith("/provider") && desk === "requests"}
            />
            <Tab
              to="/provider"
              search={{ desk: "listings" }}
              label={t("deskNavListings")}
              icon={ClipboardList}
              marker="listings"
              active={pathname.startsWith("/provider") && desk === "listings"}
            />
            <Tab
              to="/inbox"
              search={{ view: "centre" }}
              label={t("messages")}
              icon={MessageCircle}
              marker="messages"
              active={pathname.startsWith("/inbox") && view !== "family"}
            />
            <AvatarTab userId={user?.id} image={user?.profileImageUrl} name={user?.displayName} active={pathname.startsWith("/account")} />
          </>
        ) : null}
        {kind === "parent" && !storeTabs ? (
          <>
            <Tab
              to="/search"
              label={t("search")}
              icon={Search}
              marker="search"
              active={pathname.startsWith("/search")}
            />
            <Tab
              to="/parent"
              search={{ tab: "saved" }}
              label={t("saved")}
              icon={Heart}
              marker="saved"
              active={pathname.startsWith("/parent") && tab === "saved"}
            />
            <Tab
              to="/parent"
              search={{ tab: "requests" }}
              label={t("navRequestsShort")}
              icon={ClipboardCheck}
              marker="bookings"
              active={pathname.startsWith("/parent") && (tab === "requests" || tab === "enrolled")}
            />
            <Tab
              to="/inbox"
              search={{ view: "family" }}
              label={t("messages")}
              icon={MessageCircle}
              marker="messages"
              active={pathname.startsWith("/inbox")}
            />
            <AvatarTab userId={user?.id} image={user?.profileImageUrl} name={user?.displayName} active={pathname.startsWith("/account")} />
          </>
        ) : null}
        {kind === "admin" && !storeTabs ? (
          <>
            <Tab to="/admin" search={{ tab: "queue" }} label={t("navHome")} icon={Home} marker="queue" active={pathname.startsWith("/admin") && (!tab || tab === "queue")} />
            <Tab to="/admin" search={{ tab: "verify" }} label={t("navReview")} icon={ClipboardCheck} marker="verify" active={pathname.startsWith("/admin") && tab === "verify"} />
            <Tab to="/admin" search={{ tab: "mail" }} label={t("messages")} icon={MessageCircle} marker="mail" active={pathname.startsWith("/admin") && tab === "mail"} />
            <Tab to="/support" label={t("support")} icon={LifeBuoy} marker="support" active={pathname.startsWith("/support")} />
            <AvatarTab userId={user?.id} image={user?.profileImageUrl} name={user?.displayName} active={pathname.startsWith("/account")} />
          </>
        ) : null}
        {kind === "guest" && !storeTabs ? (
          <>
            <Tab to="/" label={t("navHome")} icon={Home} marker="home" active={pathname === "/"} />
            <Tab to="/search" label={t("search")} icon={Search} marker="search" active={pathname.startsWith("/search")} />
            <Tab
              to="/login"
              search={{ next: "/parent?tab=saved" }}
              label={t("saved")}
              icon={Heart}
              marker="saved"
              active={false}
            />
            <Tab to="/login" label={t("signIn")} icon={User} marker="signin" active={pathname.startsWith("/login")} />
          </>
        ) : null}
      </div>
    </nav>
  );
}

function storeTabActive(id: NativeStoreTabId, pathname: string, tab: string | undefined): boolean {
  if (id === "search") {
    return pathname === "/" || pathname.startsWith("/search") || pathname.startsWith("/daycare");
  }
  if (id === "saved") return pathname.startsWith("/parent") && tab === "saved";
  if (id === "messages") return pathname.startsWith("/inbox");
  return pathname.startsWith("/account");
}

function AvatarTab({
  userId,
  image,
  name,
  active,
}: {
  userId?: string | null;
  image?: string | null;
  name?: string | null;
  active: boolean;
}) {
  return (
    <Link
      to="/account"
      search={{ tab: "profile", section: "profile" }}
      data-ke="tab-avatar"
      aria-label="Account"
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-[3.35rem] min-w-11 flex-col items-center justify-center",
        active ? "text-primary" : "text-muted",
      )}
    >
      <ProfileAvatar userId={userId} fallback={image} name={name} size="sm" />
    </Link>
  );
}

function Tab({
  to,
  label,
  icon: Icon,
  active,
  search,
  marker,
  onClick,
}: {
  to: string;
  label: string;
  icon: typeof Search | typeof Home | typeof Building2 | typeof ClipboardList | typeof User | typeof LifeBuoy;
  active: boolean;
  search?: Record<string, string>;
  marker?: string;
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
