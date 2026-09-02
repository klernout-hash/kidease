import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Heart, ClipboardCheck, Menu, MessageCircle, Search, UserRound } from "lucide-react";
import { SignedIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSelect } from "@/components/language-select";
import { NavDrawer } from "@/components/nav-drawer";
import { LiveChatSlot } from "@/components/help-bot";
import { applyDocumentLocale } from "@/lib/languages";

export function Shell({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  const { t, locale } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tab = useRouterState({ select: (s) => (s.location.search as { tab?: string }).tab });
  const { user } = useCurrentUserState();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const hideTabs = pathname.startsWith("/login");
  const onAccount = pathname.startsWith("/account");
  const accountTab = tab ?? "profile";

  const desktopNav = [
    { to: "/search", label: t("explore"), match: ["/search", "/daycare"] },
    { to: "/benefits", label: t("benefitsTab"), match: ["/benefits"] },
    { to: "/about", label: t("about"), match: ["/about"] },
    { to: "/get-app", label: t("getApp"), match: ["/get-app"] },
  ];

  const drawerItems = [
    { to: "/search", label: t("explore") },
    { to: "/benefits", label: t("benefitsTab") },
    { to: "/get-app", label: t("getApp") },
    { to: "/about", label: t("about") },
    { to: "/team", label: t("team") },
    { to: "/contact", label: t("contact") },
  ];

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-bg/80 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(28,36,56,0.04)] backdrop-blur-[16px]">
        <div className="ke-gutter mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 py-2">
          <Link to="/" className="shrink-0" aria-label="KidEase">
            <BrandMark size="sm" />
          </Link>
          <nav className="hidden items-center gap-6 text-[13px] font-medium text-muted [[data-channel=website]_&]:xl:flex">
            {desktopNav.map((item) => {
              const on = item.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));
              return (
                <Link key={item.to} to={item.to} className={cn("whitespace-nowrap hover:text-fg", on && "text-fg")}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-1.5">
            <div className="hidden h-11 items-center overflow-visible rounded-full bg-surface/90 ring-1 ring-border [[data-channel=website]_&]:xl:flex">
              <LanguageSelect />
              <span className="h-4 w-px shrink-0 bg-border" aria-hidden />
              {user ? (
                <SignedIn>
                  <button
                    type="button"
                    onClick={() => void signOut("/")}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full px-3 text-xs leading-normal text-muted hover:text-fg"
                  >
                    {user.profileImageUrl ? (
                      <img src={user.profileImageUrl} alt="" className="size-5 rounded-full object-cover" />
                    ) : (
                      <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] text-primary-fg">
                        {(user.displayName ?? "U").slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="hidden max-w-28 truncate sm:inline">{user.displayName ?? t("account")}</span>
                  </button>
                </SignedIn>
              ) : (
                <>
                  <Link
                    to="/login"
                    search={{ role: "provider", intent: "in", next: "/provider" }}
                    className="inline-flex h-11 items-center justify-center rounded-full px-3 text-xs leading-normal text-muted hover:text-fg"
                  >
                    {t("providerLogin")}
                  </Link>
                  <span className="h-4 w-px shrink-0 bg-border" aria-hidden />
                  <Link
                    to="/login"
                    search={{ role: "parent", intent: "in", next: "/search" }}
                    className="inline-flex h-11 items-center justify-center rounded-full px-3 text-xs leading-normal text-muted hover:text-fg"
                  >
                    {t("parentSignIn")}
                  </Link>
                </>
              )}
            </div>
            <div className="flex h-11 items-center overflow-visible rounded-full bg-surface/90 ring-1 ring-border [[data-channel=website]_&]:xl:hidden">
              <LanguageSelect />
            </div>
            <button
              type="button"
              className="grid size-12 shrink-0 place-items-center rounded-full text-fg hover:bg-surface [[data-channel=website]_&]:xl:hidden"
              aria-label="Menu"
              aria-expanded={open}
              aria-controls="ke-nav-drawer"
              onClick={() => setOpen(true)}
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
        onSignOut={() => void signOut("/")}
      />
      <div className={hideTabs ? "" : "[[data-channel=app]_&]:pb-[calc(5.25rem+env(safe-area-inset-bottom))]"}>
        {children}
      </div>
      {hideTabs ? null : (
        <nav className="fixed inset-x-0 bottom-0 z-30 hidden border-t border-border bg-surface/95 backdrop-blur-md [[data-channel=app]_&]:block">
          <div className="mx-auto grid max-w-lg grid-cols-5 px-1 pb-[env(safe-area-inset-bottom)] pt-1">
            <Tab
              to="/"
              label={t("search")}
              icon={Search}
              active={pathname === "/" || pathname.startsWith("/search") || pathname.startsWith("/daycare")}
            />
            <Tab
              to="/account"
              search={{ tab: "saved" }}
              label={t("saved")}
              icon={Heart}
              active={onAccount && accountTab === "saved"}
            />
            <Tab
              to="/account"
              search={{ tab: "enrolled" }}
              label={t("enrolled")}
              icon={ClipboardCheck}
              active={onAccount && accountTab === "enrolled"}
            />
            <Tab to="/inbox" label={t("messages")} icon={MessageCircle} active={pathname.startsWith("/inbox")} />
            <Tab
              to={user ? "/account" : "/login"}
              search={user ? { tab: "profile" } : { role: "parent", intent: "in", next: "/account" }}
              label={t("profile")}
              icon={UserRound}
              active={onAccount && accountTab === "profile"}
            />
          </div>
        </nav>
      )}
      {hideTabs ? null : <LiveChatSlot />}
    </div>
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
      className={cn(
        "flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 text-[10px] font-medium tracking-wide",
        active ? "text-primary" : "text-muted",
      )}
    >
      <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.7} fill={active && Icon === Heart ? "currentColor" : "none"} />
      {label}
    </Link>
  );
}
