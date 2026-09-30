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
import { useSessionDesks } from "@/components/desk-switcher";
import { HomeCareTypeRow, selectedBrowseType } from "@/components/facility-type-rails";
import { useRoleChrome } from "@/components/role-chrome";
import { accountSearch, canSeeAdminDesk } from "@/lib/desks";
import { SiteFooter } from "@/components/site-footer";
import { rememberResumePath } from "@/lib/retention";
import { ApplyPendingShortlist } from "@/components/apply-pending-shortlist";

export function Shell({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  const { t, locale } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const headerType = useRouterState({ select: (s) => selectedBrowseType(s.location.search) });
  const headerCity = useRouterState({
    select: (s) => {
      const search = s.location.search as { q?: unknown } | undefined;
      return typeof search?.q === "string" ? search.q : "";
    },
  });
  const { user } = useCurrentUserState();
  const { session, sticky } = useSessionDesks();
  const chrome = useRoleChrome();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  useEffect(() => {
    setOpen(false);
    rememberResumePath(pathname);
  }, [pathname]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const barePath = stripLocalePrefix(pathname);
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
        <div className="[[data-channel=app]_&]:pb-[calc(6rem+env(safe-area-inset-bottom))]">{children}</div>
        <AppTabBar />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-50 border-b border-border bg-bg pt-[env(safe-area-inset-top)]">
        <div className="ke-gutter relative mx-auto max-w-6xl">
          <div className="flex h-14 items-center lg:h-16">
            {menuLeaf ? <MenuLeafBack /> : null}
            <Link to={homeTo} className="relative z-20 shrink-0" aria-label="KidEase">
              <BrandMark size="sm" />
            </Link>
            <button
              type="button"
              className="relative z-20 ml-auto grid size-12 shrink-0 place-items-center rounded-full text-fg transition-colors duration-150 ease-out hover:bg-surface [[data-channel=website]_&]:grid"
              aria-label="Menu"
              aria-expanded={open}
              aria-controls="ke-nav-drawer"
              onPointerDown={() => setOpen(true)}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(true);
              }}
            >
              <Menu className="size-6" strokeWidth={1.75} />
            </button>
          </div>
          {barePath === "/" || barePath === "/search" ? (
            <div className="w-full min-w-0 overflow-hidden pb-1.5 lg:absolute lg:inset-x-16 lg:top-0 lg:flex lg:h-16 lg:w-auto lg:items-center lg:overflow-visible lg:pb-0 [[data-channel=website]_&]:flex">
              <HomeCareTypeRow
                compact
                toSearch
                selected={headerType}
                city={headerCity}
                onSelect={() => {}}
              />
            </div>
          ) : null}
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
        onSignOut={() => void signOut("/")}
        headerExtra={user ? <NotificationBell /> : null}
      />
      <div className={hideTabs ? "" : "[[data-channel=app]_&]:pb-[calc(6rem+env(safe-area-inset-bottom))]"}>
        <ApplyPendingShortlist />
        {children}
      </div>
      {hideFooter || bare ? null : <SiteFooter />}
      {hideTabs ? null : <AppTabBar />}
      {hideTabs || pathname.startsWith("/search") || pathname.startsWith("/parent") || pathname.startsWith("/menu") ? null : <LiveChatSlot />}
    </div>
  );
}
