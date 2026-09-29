import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { AppTabBar } from "@/components/app-tab-bar";
import { NotificationBell } from "@/components/notification-bell";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import { useCopy } from "@/lib/use-copy";
import { BrandMark } from "@/components/brand-mark";
import { MenuLeafBack } from "@/components/menu-leaf-back";
import { isMenuLeafPath } from "@/lib/menu-leaf";
import { NavDrawer } from "@/components/nav-drawer";
import { LiveChatSlot } from "@/components/help-bot";
import { applyDocumentLocale } from "@/lib/languages";
import { localePath, stripLocalePrefix } from "@/lib/locale-path";
import { DeskSwitcher, useSessionDesks } from "@/components/desk-switcher";
import { HomeCareTypeRow, type BrowseDaycareType } from "@/components/facility-type-rails";
import { getHomeCareType, setHomeCareType, subscribeHomeCareType } from "@/lib/home-care-selection";
import { useRoleChrome } from "@/components/role-chrome";
import { accountSearch, canSeeAdminDesk, showDeskSwitcher } from "@/lib/desks";
import { SiteFooter } from "@/components/site-footer";
import { rememberResumePath } from "@/lib/retention";
import { ApplyPendingShortlist } from "@/components/apply-pending-shortlist";

export function Shell({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  const { t, locale } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useCurrentUserState();
  const { session, sticky } = useSessionDesks();
  const chrome = useRoleChrome();
  const [open, setOpen] = useState(false);
  const [careType, setCareType] = useState<BrowseDaycareType | undefined>(() => getHomeCareType());

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  useEffect(() => subscribeHomeCareType(setCareType), []);

  useEffect(() => {
    setOpen(false);
    rememberResumePath(pathname);
  }, [pathname]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const barePath = stripLocalePrefix(pathname);
  const publicListing = /^\/daycare\/(?!city(?:\/|$))[^/]+/.test(barePath);
  const guestBrowse =
    barePath === "/" ||
    barePath === "/search" ||
    barePath === "/explore" ||
    publicListing;
  const hideTabs = barePath.startsWith("/login");
  const verifyLite = pathname.startsWith("/verify-2fa");
  const menuLite = pathname.startsWith("/menu");
  const hideFooter =
    hideTabs ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/support") ||
    pathname.startsWith("/verify-2fa") ||
    pathname.startsWith("/menu");
  const menuLeaf = isMenuLeafPath(pathname);

  const homeTo = localePath("/", locale);
  const drawerItems = [
    { to: "/search", label: t("explore"), icon: "explore" as const },
    { to: "/compare", label: t("compare"), icon: "compare" as const },
    { to: "/benefits", label: t("benefitsTab"), icon: "benefits" as const },
    { to: "/get-app", label: t("getApp"), icon: "getApp" as const },
    { to: localePath("/about", locale), label: t("about"), icon: "about" as const },
    { to: localePath("/start-a-daycare", locale), label: t("startADaycare"), icon: "startDaycare" as const },
    { to: localePath("/donate", locale), label: t("donateToKids"), icon: "donate" as const },
    { to: "/team", label: t("team"), icon: "team" as const },
    { to: localePath("/contact", locale), label: t("contact"), icon: "contact" as const },
  ];

  if (verifyLite) {
    return (
      <div className="min-h-dvh bg-bg text-fg">
        <header className="sticky top-0 z-50 border-b border-border bg-bg pt-[env(safe-area-inset-top)]">
          <div className="ke-gutter mx-auto flex min-h-16 max-w-6xl items-center py-2">
            <Link to={homeTo} className="shrink-0" aria-label="KidEase">
              <BrandMark size="sm" />
            </Link>
          </div>
        </header>
        {children}
      </div>
    );
  }

  if (menuLite) {
    return (
      <div className="min-h-dvh bg-bg text-fg">
        <header className="sticky top-0 z-50 border-b border-border bg-bg pt-[env(safe-area-inset-top)]">
          <div className="ke-gutter mx-auto flex min-h-16 max-w-6xl items-center py-2">
            <Link to={homeTo} className="shrink-0" aria-label="KidEase">
              <BrandMark size="sm" />
            </Link>
          </div>
        </header>
        <div className="[[data-channel=app]_&]:pb-[calc(5.25rem+env(safe-area-inset-bottom))]">{children}</div>
        <AppTabBar />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-50 border-b border-border bg-bg pt-[env(safe-area-inset-top)]">
        <div className="ke-gutter mx-auto grid min-h-16 max-w-6xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-1">
          <div className="flex min-w-0 items-center gap-0.5">
            {menuLeaf ? <MenuLeafBack /> : null}
            <Link to={homeTo} className="shrink-0" aria-label="KidEase">
              <BrandMark size="sm" />
            </Link>
          </div>
          {barePath === "/" ? (
            <div className="hidden min-w-0 justify-center overflow-hidden [[data-channel=website]_&]:flex">
              <HomeCareTypeRow
                compact
                selected={careType}
                onSelect={(type) => setHomeCareType(type)}
              />
            </div>
          ) : (
            <div />
          )}
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              className="relative z-20 grid size-12 shrink-0 place-items-center rounded-full text-fg transition-colors duration-150 ease-out hover:bg-surface [[data-channel=website]_&]:grid"
              aria-label="Menu"
              aria-expanded={open}
              aria-controls="ke-nav-drawer"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((v) => !v);
              }}
            >
              <Menu className="size-6" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </header>
      <NavDrawer
        open={open}
        onClose={close}
        title={t("explore")}
        items={drawerItems}
        parentLabel={t("parentSignIn")}
        providerLabel={t("providerLogin")}
        signedIn={Boolean(user) || chrome.signedIn}
        menusReady={!chrome.pending}
        accountLabel={t("account")}
        accountHref="/account"
        accountSearch={accountSearch(sticky)}
        role={chrome.role}
        paid={chrome.paid}
        isAdmin={canSeeAdminDesk(session?.role, session?.email ?? user?.primaryEmail)}
        desksSlot={
          user &&
          !guestBrowse &&
          showDeskSwitcher(session?.desks, session?.role, session?.email ?? user?.primaryEmail) ? (
            <DeskSwitcher compact />
          ) : null
        }
        onSignOut={() => void signOut("/")}
        headerExtra={user ? <NotificationBell /> : null}
      />
      <div className={hideTabs ? "" : "[[data-channel=app]_&]:pb-[calc(5.25rem+env(safe-area-inset-bottom))]"}>
        <ApplyPendingShortlist />
        {children}
      </div>
      {hideFooter || bare ? null : <SiteFooter />}
      {hideTabs ? null : <AppTabBar />}
      {hideTabs || pathname.startsWith("/search") || pathname.startsWith("/parent") || pathname.startsWith("/menu") ? null : <LiveChatSlot />}
    </div>
  );
}
