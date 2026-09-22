import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { AppTabBar } from "@/components/app-tab-bar";
import { NotificationBell } from "@/components/notification-bell";
import { RateKidEaseControl } from "@/components/rate-kidease";
import { ShareKidEaseButton } from "@/components/share-button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";
import { HeaderSocial } from "@/components/header-social";
import { MenuLeafBack } from "@/components/menu-leaf-back";
import { isMenuLeafPath } from "@/lib/menu-leaf";
import { LanguageSelect } from "@/components/language-select";
import { AppearanceControl } from "@/components/appearance-control";
import { NavDrawer } from "@/components/nav-drawer";
import { LiveChatSlot } from "@/components/help-bot";
import { applyDocumentLocale } from "@/lib/languages";
import { localePath, stripLocalePrefix } from "@/lib/locale-path";
import { DeskSwitcher, useSessionDesks } from "@/components/desk-switcher";
import { accountSearch, canSeeAdminDesk, showDeskSwitcher } from "@/lib/desks";
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
  const guestBrowse =
    barePath === "/" ||
    barePath === "/search" ||
    barePath === "/explore" ||
    barePath.startsWith("/daycare");
  const hideTabs = barePath.startsWith("/login");
  const loginTo = (localePath("/login", locale) === "/fr/login" ? "/fr/login" : "/login") as "/login" | "/fr/login";
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
        <div className="ke-gutter mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 py-2">
          <div className="flex min-w-0 items-center gap-0.5">
            {menuLeaf ? <MenuLeafBack /> : null}
            <Link to={homeTo} className="shrink-0" aria-label="KidEase">
              <BrandMark size="sm" />
            </Link>
            {menuLeaf ? (
              <div className="max-md:hidden">
                <HeaderSocial />
              </div>
            ) : (
              <HeaderSocial />
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {user && !guestBrowse ? <DeskSwitcher /> : null}
            <div className="hidden items-center overflow-visible rounded-full bg-surface/90 p-0.5 ring-1 ring-border [[data-channel=website]_&]:flex">
              <LanguageSelect compact />
              <span className="h-3.5 w-px shrink-0 bg-border" aria-hidden />
              <AppearanceControl variant="select" compact />
            </div>
            <HeaderProfile
              userId={user?.id}
              image={user?.profileImageUrl}
              name={user?.displayName}
              signedIn={Boolean(user)}
              active={onProfile}
              profileLabel={t("profile")}
              parentLabel={t("parentSignIn")}
              providerLabel={t("providerLogin")}
              loginTo={loginTo}
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
        signedIn={Boolean(user)}
        accountLabel={t("account")}
        accountHref="/account"
        accountSearch={accountSearch(sticky)}
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
  active,
  profileLabel,
  parentLabel,
  providerLabel,
  loginTo = "/login",
}: {
  userId?: string | null;
  image?: string | null;
  name?: string | null;
  signedIn: boolean;
  active: boolean;
  profileLabel: string;
  parentLabel: string;
  providerLabel: string;
  loginTo?: "/login" | "/fr/login";
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

  const { sticky } = useSessionDesks();

  if (signedIn) {
    return (
      <Link to="/account" search={accountSearch(sticky)} className={triggerClass} aria-label={profileLabel}>
        <ProfileAvatar userId={userId} fallback={image} name={name} size="sm" />
        <span className="text-[9px] font-medium tracking-wide">{profileLabel}</span>
      </Link>
    );
  }

  return (
    <div ref={wrap} className="relative hidden [[data-channel=app]_&]:block [[data-channel=website]_&]:block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={profileLabel}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex min-w-12 flex-col items-center justify-center gap-0.5 px-1 py-0.5",
          open ? "text-primary" : "text-muted",
        )}
      >
        <ProfileAvatar userId={userId} fallback={image} name={name} size="sm" />
        <span className="text-[9px] font-medium tracking-wide">{profileLabel}</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.4rem)] z-50 w-56 overflow-hidden rounded-xl bg-surface py-1 shadow-lift ring-1 ring-border"
        >
          <p className="border-b border-border px-3 py-2 text-xs font-medium text-muted">Sign in</p>
          <Link
            role="menuitem"
            to={loginTo}
            search={{ role: "parent", desk: "parent", intent: "in", next: "/parent" }}
            onClick={() => setOpen(false)}
            className="block px-3 py-2.5 text-sm text-fg hover:bg-surface-2"
          >
            {parentLabel}
          </Link>
          <Link
            role="menuitem"
            to={loginTo}
            search={{ role: "provider", desk: "director", intent: "in", next: "/provider" }}
            onClick={() => setOpen(false)}
            className="block px-3 py-2.5 text-sm text-fg hover:bg-surface-2"
          >
            {providerLabel}
          </Link>
          <ShareKidEaseButton appearance="menu" onDone={() => setOpen(false)} />
          <RateKidEaseControl appearance="menu" onDone={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
