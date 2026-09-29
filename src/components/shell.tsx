import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { AppTabBar } from "@/components/app-tab-bar";
import { NotificationBell } from "@/components/notification-bell";
import { ShareKidEaseButton } from "@/components/share-button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";
import { MenuLeafBack } from "@/components/menu-leaf-back";
import { isMenuLeafPath } from "@/lib/menu-leaf";
import { LanguageSelect } from "@/components/language-select";
import { AppearanceControl } from "@/components/appearance-control";
import { NavDrawer } from "@/components/nav-drawer";
import { LiveChatSlot } from "@/components/help-bot";
import { applyDocumentLocale } from "@/lib/languages";
import { localePath, stripLocalePrefix } from "@/lib/locale-path";
import { DeskSwitcher, useSessionDesks } from "@/components/desk-switcher";
import { RoleNavLinks } from "@/components/role-nav";
import { useRoleChrome } from "@/components/role-chrome";
import { accountSearch, canSeeAdminDesk, showDeskSwitcher } from "@/lib/desks";
import type { ChromeRole } from "@/lib/role-access";
import { SiteFooter } from "@/components/site-footer";
import { ProfileAvatar } from "@/components/profile-avatar";
import { rememberResumePath } from "@/lib/retention";
import { ApplyPendingShortlist } from "@/components/apply-pending-shortlist";

export function Shell({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  const { t, locale } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tab = useRouterState({ select: (s) => (s.location.search as { tab?: string }).tab });
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
  const publicListing = /^\/daycare\/(?!city(?:\/|$))[^/]+/.test(barePath);
  const guestBrowse =
    barePath === "/" ||
    barePath === "/search" ||
    barePath === "/explore" ||
    publicListing;
  const hideTabs = barePath.startsWith("/login");
  const verifyLite = pathname.startsWith("/verify-2fa");
  const menuLite = pathname.startsWith("/menu");
  const onAccount = pathname.startsWith("/account");
  const accountTab = tab ?? "profile";
  const hideFooter =
    hideTabs ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/support") ||
    pathname.startsWith("/verify-2fa") ||
    pathname.startsWith("/menu");
  const onProfile = onAccount && accountTab === "profile";
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
        <div className="ke-gutter mx-auto flex min-h-[4.6rem] max-w-6xl items-center justify-between gap-3 py-2.5">
          <div className="flex min-w-0 items-center gap-0.5">
            {menuLeaf ? <MenuLeafBack /> : null}
            <Link to={homeTo} className="shrink-0" aria-label="KidEase">
              <BrandMark size="sm" />
            </Link>
            {chrome.pending ? null : <RoleNavLinks role={chrome.role} paid={chrome.paid} />}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {user && !guestBrowse && showDeskSwitcher(session?.desks, session?.role, session?.email) ? (
              <DeskSwitcher />
            ) : null}
            <div className="ke-narrow-hide hidden items-center overflow-visible rounded-full bg-surface/90 p-0.5 ring-1 ring-border [[data-channel=website]_&]:flex">
              <LanguageSelect compact />
              <span className="h-3.5 w-px shrink-0 bg-border" aria-hidden />
              <AppearanceControl variant="select" compact />
            </div>
            <HeaderProfile
              userId={user?.id}
              image={user?.profileImageUrl}
              name={user?.displayName}
              signedIn={Boolean(user) || chrome.signedIn}
              menusReady={!chrome.pending}
              active={onProfile}
              profileLabel={t("profile")}
              role={chrome.role}
              paid={chrome.paid}
              onSignOut={() => void signOut("/")}
            />
            {user ? <NotificationBell className="hidden [[data-channel=website]_&]:grid" /> : null}
            <button
              type="button"
              className="hidden size-12 shrink-0 place-items-center rounded-full text-fg hover:bg-surface [[data-channel=website]_&]:grid"
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

function HeaderProfile({
  userId,
  image,
  name,
  signedIn,
  menusReady,
  active,
  profileLabel,
  role,
  paid,
  onSignOut,
}: {
  userId?: string | null;
  image?: string | null;
  name?: string | null;
  menusReady: boolean;
  signedIn: boolean;
  active: boolean;
  profileLabel: string;
  role: ChromeRole;
  paid: boolean;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerClass = cn(
    "flex min-w-12 flex-col items-center justify-center gap-0.5 px-1 py-0.5 [[data-channel=app]_&]:flex",
    "hidden [[data-channel=website]_&]:flex",
    active ? "text-primary" : "text-muted",
  );

  return (
    <div ref={wrap} className="relative hidden [[data-channel=app]_&]:block [[data-channel=website]_&]:block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={profileLabel}
        onClick={() => setOpen((v) => !v)}
        className={cn(triggerClass, "min-w-12", open ? "text-primary" : active ? "text-primary" : "text-muted")}
      >
        <ProfileAvatar userId={userId} fallback={image} name={name} size="sm" />
        <span className="text-[9px] font-medium tracking-wide">{profileLabel}</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.4rem)] z-50 w-64 overflow-hidden rounded-xl bg-surface py-1 shadow-lift ring-1 ring-border"
        >
          {menusReady ? <RoleNavLinks role={role} paid={paid} appearance="menu" onNavigate={() => setOpen(false)} /> : null}
          {!menusReady ? null : signedIn ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className="block min-h-11 w-full px-3 py-2.5 text-left text-sm text-fg hover:bg-surface-2"
            >
              Sign out
            </button>
          ) : (
            <>
              <ShareKidEaseButton appearance="menu" onDone={() => setOpen(false)} />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
