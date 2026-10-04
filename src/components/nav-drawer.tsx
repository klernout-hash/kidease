import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { RoleNavLinks } from "@/components/role-nav";
import type { ChromeRole } from "@/lib/role-access";
import { dismissPopovers } from "@/lib/dismiss-popovers";
import { LanguageSelect } from "@/components/language-select";
import { AppearanceControl } from "@/components/appearance-control";
import { ShareKidEaseButton } from "@/components/share-button";
import { MenuGlyph, MenuRow } from "@/components/menu-row";
import { CountBadge } from "@/components/count-badge";
import { useDeskMenu } from "@/components/desk-menu";
import { DeskSwitcher, useSessionDesks } from "@/components/desk-switcher";
import { attentionForItem } from "@/lib/attention";
import { visibleDeskGroups } from "@/lib/desk-nav";
import { showDeskSwitcher } from "@/lib/desks";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import type { MenuIconId } from "@/lib/menu-icons";
import { nextDrawerLatch, type DrawerLatch } from "@/lib/drawer-latch";

type Item = { to: string; label: string; search?: Record<string, string>; icon: MenuIconId; marker?: string };

export function NavDrawer({
  open,
  onClose,
  title,
  items,
  parentLabel,
  providerLabel,
  signedIn,
  menusReady = true,
  accountLabel,
  accountHref = "/account",
  accountSearch,
  role = "guest",
  paid = false,
  isAdmin = false,
  onSignOut,
  headerExtra,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  items: Item[];
  parentLabel: string;
  providerLabel: string;
  signedIn: boolean;
  menusReady?: boolean;
  accountLabel: string;
  accountHref?: string;
  accountSearch?: Record<string, string>;
  role?: ChromeRole;
  paid?: boolean;
  isAdmin?: boolean;
  onSignOut: () => void;
  headerExtra?: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const latchRef = useRef<DrawerLatch | null>(null);
  const latched = nextDrawerLatch(open, menusReady, role, paid, latchRef.current);
  latchRef.current = latched;
  const roleShown = (latched?.role ?? role) as ChromeRole;
  const paidShown = latched?.paid ?? paid;
  const showMenus = latched != null;
  const { t, locale } = useCopy();
  const { session } = useSessionDesks();
  const deskMenu = useDeskMenu();
  void isAdmin;
  void parentLabel;
  void providerLabel;
  const deskRole =
    deskMenu?.desk === "daycare" ? "provider" : deskMenu?.desk === "support" ? "support" : deskMenu?.desk ?? roleShown;
  const switcher = Boolean(session && showDeskSwitcher(session.desks, session.role, session.email));
  const loginTo = (localePath("/login", locale) === "/fr/login" ? "/fr/login" : "/login") as "/login" | "/fr/login";

  useEffect(() => {
    if (!open) return;
    dismissPopovers();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), select, textarea, input",
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Never leave a closed `fixed inset-0` portal in the DOM. After CSS loads,
  // an opacity-0 backdrop still sits at z-[80] and eats every click if
  // `hidden` / `pointer-events-none` fail (Safari + display:none + fixed).
  if (typeof document === "undefined" || !open) return null;

  return createPortal(
    <div className="pointer-events-auto">
      <button
        type="button"
        className="fixed inset-0 z-[80] bg-fg/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        id="ke-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-y-0 right-0 z-[90] flex w-[min(86vw,24rem)] flex-col bg-bg shadow-lift ring-1 ring-border"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <BrandMark size="sm" align="start" />
          {headerExtra}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="grid size-12 place-items-center rounded-full text-fg hover:bg-surface-2"
            aria-label="Close"
          >
            <X className="size-6" strokeWidth={1.75} />
          </button>
        </div>
        {!signedIn && showMenus ? (
          <div className="border-b border-border px-3 py-3">
            <Link
              to={loginTo}
              onClick={onClose}
              className="flex min-h-12 items-center gap-3 rounded-full bg-primary px-3 text-base font-medium text-primary-fg"
            >
              <MenuGlyph id="login" className="text-primary-fg" />
              {t("signIn")}
            </Link>
            <Link
              to={loginTo}
              search={{ intent: "up" }}
              onClick={onClose}
              className="mt-2 flex min-h-12 items-center gap-3 rounded-full px-3 text-base font-medium text-fg ring-1 ring-border"
            >
              <MenuGlyph id="parent" />
              {t("createAccount")}
            </Link>
          </div>
        ) : null}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">KidEase</p>
          {switcher ? (
            <div className="mb-3 md:hidden">
              <DeskSwitcher />
            </div>
          ) : null}
          {deskMenu ? (
            <nav data-ke="role-nav" data-role={deskRole} aria-label={title}>
              {visibleDeskGroups(deskMenu.desk, deskMenu.items).map(({ group, items: rows }) => (
                <details
                  key={group.id}
                  ref={(node) => {
                    if (node && group.open && node.dataset.keGroup !== "1") {
                      node.dataset.keGroup = "1";
                      node.open = true;
                    }
                  }}
                  className="py-0.5"
                >
                  <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-xl px-3 text-xs font-semibold uppercase tracking-[0.12em] text-subtle [&::-webkit-details-marker]:hidden">
                    {group.labelKey ? t(group.labelKey) : group.label}
                  </summary>
                  <div>
                    {group.id === "settings" ? (
                      <div className="flex min-h-12 items-center gap-3 px-3">
                        <MenuGlyph id="language" />
                        <LanguageSelect className="w-full justify-start" />
                      </div>
                    ) : null}
                    {rows
                      .filter((item) => item.id !== "account")
                      .map((item) => {
                        const plan = item.id === "upgrade" || item.id === "subscription";
                        const label = item.labelKey ? t(item.labelKey) : item.label;
                        const on = deskMenu.active === item.id;
                        const rowClass = cn(
                          "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium",
                          plan && "max-md:hidden",
                          on ? "bg-primary text-primary-fg" : "text-fg hover:bg-surface",
                        );
                        const body = (
                          <>
                            <span className="min-w-0 flex-1">{label}</span>
                            <CountBadge count={attentionForItem(session?.attention, item.id)} />
                          </>
                        );
                        if (item.href) {
                          return (
                            <Link
                              key={item.id}
                              to={item.href}
                              {...(item.search ? { search: item.search } : {})}
                              onClick={onClose}
                              data-nav={plan ? "upgrade" : item.id}
                              className={rowClass}
                            >
                              {body}
                            </Link>
                          );
                        }
                        return (
                          <button
                            key={item.id}
                            type="button"
                            data-nav={plan ? "upgrade" : item.id}
                            className={rowClass}
                            onClick={() => {
                              onClose();
                              deskMenu.onSelect(item.id);
                            }}
                          >
                            {body}
                          </button>
                        );
                      })}
                  </div>
                </details>
              ))}
            </nav>
          ) : !signedIn && showMenus ? (
            <nav data-ke="role-nav" data-role="guest" aria-label={title}>
              <details
                className="py-0.5"
                ref={(node) => {
                  if (node && node.dataset.keGroup !== "1") {
                    node.dataset.keGroup = "1";
                    node.open = true;
                  }
                }}
              >
                <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 text-xs font-semibold uppercase tracking-[0.12em] text-subtle [&::-webkit-details-marker]:hidden">
                  {t("navFindCare")}
                </summary>
                <MenuRow to={localePath("/search", locale)} label={t("search")} icon="explore" appearance="drawer" marker="search" onClick={onClose} />
                <MenuRow to={localePath("/search", locale)} search={{ view: "map" }} label={t("navMap")} icon="explore" appearance="drawer" marker="map" onClick={onClose} />
                <MenuRow to="/cities" label={t("browseCities")} icon="explore" appearance="drawer" onClick={onClose} />
                <MenuRow to="/compare" label={t("compare")} icon="compare" appearance="drawer" onClick={onClose} />
                <MenuRow to="/tour-checklist" label={t("tourChecklist")} icon="tourChecklist" appearance="drawer" onClick={onClose} />
              </details>
              <details className="py-0.5">
                <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 text-xs font-semibold uppercase tracking-[0.12em] text-subtle [&::-webkit-details-marker]:hidden">
                  {t("navForDaycares")}
                </summary>
                <MenuRow to="/claim" label={t("listYourDaycare")} icon="claim" appearance="drawer" onClick={onClose} />
                <MenuRow to="/plans" label={t("navPlans")} icon="benefits" appearance="drawer" marker="plans" onClick={onClose} />
                <MenuRow to={localePath("/jobs", locale)} label={t("findDaycareJobs")} icon="jobs" appearance="drawer" onClick={onClose} />
              </details>
              <details className="py-0.5">
                <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 text-xs font-semibold uppercase tracking-[0.12em] text-subtle [&::-webkit-details-marker]:hidden">
                  {t("helpTitle")}
                </summary>
                <MenuRow to={localePath("/help", locale)} label={t("helpTitle")} icon="help" appearance="drawer" onClick={onClose} />
                <MenuRow to={localePath("/faq", locale)} label={t("faqShort")} icon="faq" appearance="drawer" onClick={onClose} />
                <MenuRow to={localePath("/contact", locale)} label={t("contactTitle")} icon="contact" appearance="drawer" onClick={onClose} />
              </details>
            </nav>
          ) : showMenus ? (
            <RoleNavLinks role={roleShown} paid={paidShown} appearance="drawer" onNavigate={onClose} />
          ) : null}
          {items.map((item) => (
            <span key={item.to + item.label}>
              {item.to === "/about" ? <div className="my-3 h-px bg-border" /> : null}
              <MenuRow
                to={item.to}
                search={item.search}
                label={item.label}
                icon={item.icon}
                appearance="drawer"
                marker={item.marker}
                onClick={onClose}
              />
            </span>
          ))}
          {signedIn ? <ShareKidEaseButton appearance="drawer" onDone={onClose} /> : null}
          {signedIn ? (
            <>
              <div className="my-3 h-px bg-border" />
              <Link
                to={accountHref}
                search={accountSearch}
                onClick={onClose}
                className="flex min-h-12 items-center gap-3 rounded-xl bg-primary px-3 text-base font-medium text-primary-fg"
              >
                <MenuGlyph id="account" className="text-primary-fg" />
                {accountLabel}
              </Link>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSignOut();
                }}
                className="mt-2 flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-base text-fg ring-1 ring-border"
              >
                <MenuGlyph id="logout" />
                {t("signOut")}
              </button>
            </>
          ) : null}
        </nav>
        <div className={cn("space-y-2 border-t border-border px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]", deskMenu && "hidden")}>
          <div className="flex items-center gap-3 overflow-visible rounded-full bg-surface px-3 ring-1 ring-border">
            <MenuGlyph id="language" />
            <LanguageSelect className="w-full justify-start" />
          </div>
          <div className="flex items-center gap-3 overflow-visible rounded-full bg-surface px-3 ring-1 ring-border">
            <MenuGlyph id="appearance" />
            <span className="shrink-0 text-[13px] font-medium text-muted">{t("appearance")}</span>
            <AppearanceControl variant="select" className="min-w-0 flex-1 justify-end" />
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
