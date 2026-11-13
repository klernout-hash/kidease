import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { AppTabBar } from "@/components/app-tab-bar";
import { HeaderAccount } from "@/components/header-account";
import { useCurrentUserState, useLocallySignedOut } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import { useCopy } from "@/lib/use-copy";
import { BrandMark } from "@/components/brand-mark";
import { CountBadge } from "@/components/count-badge";
import { restoreMyAccount } from "@/lib/server/family";
import { MenuLeafBack } from "@/components/menu-leaf-back";
import { isMenuLeafPath } from "@/lib/menu-leaf";
import { NavDrawer } from "@/components/nav-drawer";
import { applyDocumentLocale } from "@/lib/languages";
import { localePath, stripLocalePrefix } from "@/lib/locale-path";
import { useSessionDesks } from "@/components/desk-switcher";
import { useRoleChrome } from "@/components/role-chrome";
import { clearGuestViewCookie } from "@/lib/guest-view";
import { accountSearch, canSeeAdminDesk } from "@/lib/desks";
import { NATIVE_ADMIN_NOTE_PATH } from "@/lib/native-admin";
import { useNativeHidesAdmin } from "@/lib/use-native-shell";
import { SiteFooter } from "@/components/site-footer";
import { rememberResumePath } from "@/lib/retention";
import { ApplyPendingShortlist } from "@/components/apply-pending-shortlist";
import { ApplyReferral } from "@/components/apply-referral";
import { KeyboardInset } from "@/components/keyboard-inset";
import { FacebookEmailPrompt } from "@/components/facebook-email-prompt";
import { FacebookRoleBoot } from "@/components/facebook-role-boot";

const SHELL_FRAME =
  "flex min-h-dvh min-h-[100dvh] w-full min-w-0 flex-col bg-bg pl-[var(--ke-safe-left,env(safe-area-inset-left))] pr-[var(--ke-safe-right,env(safe-area-inset-right))] text-fg";
const APP_TAB_PAD = "[[data-channel=app]_&]:pb-[calc(4.75rem+var(--ke-safe-bottom,env(safe-area-inset-bottom)))]";
const HEADER_BAR =
  "ke-site-header sticky top-[var(--ke-view-as-h,0px)] z-40 border-b border-border bg-bg/95 pt-[var(--ke-safe-top,env(safe-area-inset-top))] backdrop-blur-md";

export function Shell({ children, headerCategories, fitViewport = false }: { children: ReactNode; headerCategories?: ReactNode; fitViewport?: boolean }) {
  const { t, locale } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useCurrentUserState();
  const locallyOut = useLocallySignedOut();
  const { session, sticky } = useSessionDesks();
  const chrome = useRoleChrome();
  const viewingGuest = chrome.guestView === true;
  const hideAdmin = useNativeHidesAdmin();
  const headerUser = viewingGuest ? null : user;
  const [open, setOpen] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const frame = frameRef.current;
    if (!fitViewport || !frame) return;
    const tabs = frame.querySelector<HTMLElement>('[data-ke="app-tab-bar"]');
    if (!tabs) return;
    const apply = () => frame.style.setProperty("--ke-frame-tabs", `${tabs.getBoundingClientRect().height}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(tabs);
    return () => observer.disconnect();
  }, [fitViewport]);

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  useIsoLayoutEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const root = document.documentElement;
    const apply = () => {
      const height = Math.ceil(header.getBoundingClientRect().height);
      if (height > 0) root.style.setProperty("--ke-header-h", `${height}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(header);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--ke-header-h");
    };
  }, [pathname, locale]);

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
    fitViewport ||
    hideTabs ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/support") ||
    pathname.startsWith("/verify-2fa") ||
    pathname.startsWith("/menu");
  const menuLeaf = isMenuLeafPath(pathname);

  const homeTo = chrome.role === "government" ? localePath("/gov", locale) : localePath("/", locale);

  if (verifyLite) {
    return (
      <div className={SHELL_FRAME}>
        <KeyboardInset />
        <header className={HEADER_BAR}>
          <div className="ke-gutter mx-auto flex min-h-16 max-w-6xl items-center py-2">
            <Link to={homeTo} className="shrink-0" aria-label="KidEase">
              <BrandMark size="sm" />
            </Link>
          </div>
        </header>
        <div className="ke-page min-h-0 min-w-0 flex-1" data-ke="page">
          {children}
        </div>
      </div>
    );
  }

  if (menuLite) {
    return (
      <div className={SHELL_FRAME}>
        <KeyboardInset />
        <header className={HEADER_BAR}>
          <div className="ke-gutter mx-auto flex min-h-16 max-w-6xl items-center py-2">
            <Link to={homeTo} className="shrink-0" aria-label="KidEase">
              <BrandMark size="sm" />
            </Link>
            <div className="ml-auto">
              <HeaderAccount />
            </div>
          </div>
        </header>
        <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${APP_TAB_PAD}`}>
          <div className="ke-page min-h-0 min-w-0 flex-1" data-ke="page">
            {children}
          </div>
        </div>
        <AppTabBar />
      </div>
    );
  }

  return (
    <div ref={frameRef} className={SHELL_FRAME} data-ke-viewport={fitViewport ? "inbox" : undefined}>
      <KeyboardInset />
      <header className={HEADER_BAR}>
        <div className="ke-gutter relative mx-auto min-w-0 max-w-6xl">
          <div className={`flex w-full min-w-0 items-center gap-3 max-md:gap-2 ${headerCategories ? "min-h-14 flex-wrap md:min-h-16 md:flex-nowrap" : "h-14 max-md:h-auto max-md:min-h-14 md:h-16"}`}>
            {menuLeaf ? <MenuLeafBack /> : null}
            <Link to={homeTo} className="relative z-20 shrink-0" aria-label="KidEase">
              <BrandMark size="sm" />
            </Link>
            {headerCategories ? (
              <div
                data-ke="header-care-categories"
                className="order-last w-full min-w-0 md:order-none md:w-auto md:flex-1"
              >
                {headerCategories}
              </div>
            ) : null}
            <div className="relative z-20 ml-auto flex items-center gap-2 bg-bg pl-1 max-md:min-w-0 max-md:max-w-full max-md:gap-1.5 md:shrink-0 [[data-channel=website]_&]:flex">
              {!headerUser || (!viewingGuest && chrome.role === "provider") ? (
                <Link
                  to={localePath("/claim", locale)}
                  data-ke="list-your-daycare"
                  className="ke-web-only hidden min-h-[44px] min-w-[44px] items-center px-1.5 text-[13px] font-medium text-muted underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:inline-flex"
                >
                  {t("navForDaycares")}
                </Link>
              ) : null}
              <HeaderAccount />
              <button
                type="button"
                className="ke-web-only relative grid size-12 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-full text-fg transition-colors duration-150 ease-out hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 touch-manipulation [[data-channel=website]_&]:grid"
                aria-label={t("menu")}
                aria-expanded={open}
                aria-controls="ke-nav-drawer"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(true);
                }}
              >
                <Menu className="size-6" strokeWidth={1.75} />
                <CountBadge
                  count={Math.max(0, Number(session?.attention?.notifications) || 0)}
                  marker="menu-badge"
                  className="absolute right-0.5 top-0.5"
                />
              </button>
            </div>
          </div>
        </div>
      </header>
      {viewingGuest ? (
        <div data-ke="admin-guest-view-banner" className="border-b border-border bg-surface px-4 py-3">
          <p className="text-sm text-fg">{t("guestViewBanner")}</p>
          <a
            href={hideAdmin ? NATIVE_ADMIN_NOTE_PATH : "/admin"}
            className="mt-2 inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg"
            onClick={() => clearGuestViewCookie()}
          >
            {t("guestViewExit")}
          </a>
        </div>
      ) : null}
      {session?.restoreUntil ? (
        <div
          data-ke="account-restore"
          className="border-b border-border bg-surface px-4 py-3"
        >
          <p className="text-sm text-fg">{t("accountRestoreBody")}</p>
          <button
            type="button"
            className="mt-2 inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg"
            onClick={() => {
              void restoreMyAccount()
                .then(() => window.location.reload())
                .catch(() => undefined);
            }}
          >
            {t("accountRestoreAction")}
          </button>
        </div>
      ) : null}
      <FacebookRoleBoot />
      <FacebookEmailPrompt />
      <NavDrawer
        open={open}
        onClose={close}
        title={t("explore")}
        parentLabel={t("parentSignIn")}
        providerLabel={t("providerLogin")}
        signedIn={(Boolean(headerUser) || chrome.signedIn) && !locallyOut && !viewingGuest}
        menusReady={!chrome.pending}
        accountLabel={t("account")}
        accountHref="/account"
        accountSearch={accountSearch(sticky)}
        role={chrome.role}
        paid={chrome.paid}
        isAdmin={!viewingGuest && canSeeAdminDesk(session?.role, session?.email ?? user?.primaryEmail)}
        onSignOut={() => void signOut(chrome.role === "government" ? localePath("/gov/login", locale) : "/")}
        headerExtra={null}
        navExtra={null}
      />
      <div data-ke="shell-content" className={`flex min-h-0 min-w-0 flex-1 flex-col ${hideTabs ? "" : APP_TAB_PAD}`}>
        <ApplyPendingShortlist />
        <ApplyReferral />
        <div className="ke-page min-h-0 min-w-0 flex-1" data-ke="page">
          {children}
          {hideFooter ? null : <SiteFooter />}
        </div>
      </div>
      {hideTabs ? null : <AppTabBar />}
    </div>
  );
}

