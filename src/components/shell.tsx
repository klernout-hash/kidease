import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Building2, Heart, Inbox, Menu, Search, UserRound } from "lucide-react";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { signOut } from "@/lib/auth/client";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSelect } from "@/components/language-select";
import { NavDrawer } from "@/components/nav-drawer";
import { applyDocumentLocale } from "@/lib/languages";

export function Shell({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  const { t, locale } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isPending } = useCurrentUserState();
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

  const navItems = [
    { to: "/search", label: t("explore") },
    { to: "/benefits", label: t("benefitsTab") },
    { to: "/account", label: t("saved") },
    { to: "/about", label: t("about") },
    { to: "/team", label: t("team") },
    { to: "/contact", label: t("contact") },
    ...(bare
      ? []
      : [
          { to: "/inbox", label: t("inbox") },
          { to: "/get-app", label: t("getApp") },
        ]),
  ];

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-bg/80 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(28,36,56,0.04)] backdrop-blur-[16px]">
        <div className="ke-gutter mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 py-2">
          <Link to="/" className="shrink-0" aria-label="KidEase">
            <BrandMark size="sm" />
          </Link>
          <nav className="hidden items-center gap-5 text-sm text-muted xl:flex">
            {navItems.map((item) => (
              <Link key={item.to} to={item.to} className="hover:text-fg">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <div className="hidden h-11 items-center rounded-full bg-surface/90 ring-1 ring-border xl:flex">
              <LanguageSelect />
              <span className="h-4 w-px shrink-0 bg-border" aria-hidden />
              {isPending ? (
                <div className="mx-2 size-5 animate-pulse rounded-full bg-surface-2" />
              ) : user ? (
                <SignedIn>
                  <button
                    type="button"
                    onClick={() => void signOut("/")}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full px-3 text-xs leading-none text-muted hover:text-fg"
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
                <SignedOut>
                  <Link
                    to="/login"
                    search={{ role: "provider", intent: "in", next: "/provider" }}
                    className="inline-flex h-11 items-center justify-center rounded-full px-3 text-xs leading-none text-muted hover:text-fg"
                  >
                    {t("providerLogin")}
                  </Link>
                  <span className="h-4 w-px shrink-0 bg-border" aria-hidden />
                  <Link
                    to="/login"
                    search={{ role: "parent", intent: "in", next: "/search" }}
                    className="inline-flex h-11 items-center justify-center rounded-full px-3 text-xs leading-none text-muted hover:text-fg"
                  >
                    {t("parentSignIn")}
                  </Link>
                </SignedOut>
              )}
            </div>
            <div className="flex h-11 items-center rounded-full bg-surface/90 ring-1 ring-border xl:hidden">
              <LanguageSelect />
            </div>
            <button
              type="button"
              className="grid size-12 shrink-0 place-items-center rounded-full text-fg hover:bg-surface xl:hidden"
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
        items={navItems}
        parentLabel={t("parentSignIn")}
        providerLabel={t("providerLogin")}
        signedIn={Boolean(user)}
        accountLabel={t("account")}
        onSignOut={() => void signOut("/")}
      />
      <div className={bare ? "" : "pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0"}>{children}</div>
      {bare ? null : (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur-md md:hidden">
          <div className="mx-auto grid max-w-lg grid-cols-5 px-1 pb-[env(safe-area-inset-bottom)]">
            <Tab
              to="/search"
              label={t("explore")}
              icon={Search}
              active={pathname.startsWith("/search") || pathname.startsWith("/daycare") || pathname === "/"}
            />
            <Tab to="/account" label={t("saved")} icon={Heart} active={pathname.startsWith("/account")} />
            <Tab to="/inbox" label={t("inbox")} icon={Inbox} active={pathname.startsWith("/inbox")} />
            <Tab to="/provider" label={t("provider")} icon={Building2} active={pathname.startsWith("/provider")} />
            <Tab to={user ? "/account" : "/login"} label={t("account")} icon={UserRound} active={pathname.startsWith("/login")} />
          </div>
        </nav>
      )}
    </div>
  );
}

function Tab({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: typeof Search;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px]",
        active ? "text-primary" : "text-muted",
      )}
    >
      <Icon className="size-5" strokeWidth={1.75} />
      {label}
    </Link>
  );
}
