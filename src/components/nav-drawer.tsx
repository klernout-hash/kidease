import { Children, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useRouterState } from "@tanstack/react-router";
import { X } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { RoleNavLinks } from "@/components/role-nav";
import type { ChromeRole } from "@/lib/role-access";
import { dismissPopovers } from "@/lib/dismiss-popovers";
import { LanguageSelect } from "@/components/language-select";
import { AppearanceControl } from "@/components/appearance-control";
import { ShareKidEaseButton } from "@/components/share-button";
import { MenuGlyph } from "@/components/menu-row";
import { CountBadge } from "@/components/count-badge";
import { useDeskMenu } from "@/components/desk-menu";
import { DeskSwitcher, useSessionDesks } from "@/components/desk-switcher";
import { attentionForItem } from "@/lib/attention";
import { bindDeskGroup, deskHrefForLocale, visibleDeskGroups, writeDeskGroupOpen } from "@/lib/desk-nav";
import { showDeskSwitcher } from "@/lib/desks";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import { nextDrawerLatch, type DrawerLatch } from "@/lib/drawer-latch";
import { useInNativeShell } from "@/lib/use-native-shell";
import { useRoleChrome } from "@/components/role-chrome";
import { SmartMatchEntry } from "@/components/smart-match";
import { FooterMenuLinks, FooterMoreLinks } from "@/components/footer-more-links";
import { GUEST_DRAWER_FOOTER_OMIT, guestDrawerMenuGroupsForShell } from "@/lib/site-footer-nav";

const drawerSummaryClass =
  "flex min-h-[44px] cursor-pointer list-none items-center rounded-xl px-3 text-xs font-semibold uppercase tracking-normal text-subtle whitespace-normal break-words [&::-webkit-details-marker]:hidden";

function drawerTabStops(panel: HTMLElement) {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(
      'a[href], button, select, textarea, input, summary, [tabindex]',
    ),
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(":disabled") &&
      !element.closest("[inert]") &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== "hidden",
  );
}

/** A heading with no links is not a section. Groups collapse so the menu is not one long list. */
function DrawerSection({
  title,
  marker,
  children,
  startOpen = false,
}: {
  title: string;
  marker?: string;
  children: ReactNode;
  startOpen?: boolean;
}) {
  const rows = Children.toArray(children);
  if (rows.length === 0) return null;
  const groupId = marker || title;
  return (
    <details
      className="py-0.5"
      data-ke={marker}
      ref={(node) => bindDeskGroup(node, "menu", groupId, startOpen)}
      onToggle={(event) => writeDeskGroupOpen("menu", groupId, event.currentTarget.open)}
    >
      <summary className={drawerSummaryClass}>{title}</summary>
      <div>{rows}</div>
    </details>
  );
}

function GuestDrawerLinks({
  navExtra,
  onClose,
  title,
}: {
  navExtra?: ReactNode;
  onClose: () => void;
  title: string;
}) {
  const { t } = useCopy();
  const chrome = useRoleChrome();
  // Apple 3.1.1: the native shell must not link to plan checkout.
  // SUBSCRIPTIONS_ENABLED is the one switch for plans on the website too.
  const nativeShell = useInNativeShell();
  const showPlans = !nativeShell && chrome.subscriptionsEnabled === true;
  const groups = guestDrawerMenuGroupsForShell({ native: nativeShell, plansOn: showPlans });
  return (
    <nav data-ke="role-nav" data-role="guest" aria-label={title}>
      <DrawerSection title={t("navFindCare")} marker="drawer-find-care" startOpen>
        {navExtra}
        <div className="px-3 py-1">
          <SmartMatchEntry inline />
        </div>
        <FooterMenuLinks links={groups.find((group) => group.id === "find")?.links ?? []} appearance="drawer" onNavigate={onClose} />
      </DrawerSection>
      <DrawerSection title={t("navForDaycares")} marker="drawer-for-daycares">
        <FooterMenuLinks links={groups.find((group) => group.id === "daycares")?.links ?? []} appearance="drawer" onNavigate={onClose} />
      </DrawerSection>
    </nav>
  );
}

export function NavDrawer({
  open,
  onClose,
  title,
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
  navExtra,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
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
  navExtra?: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
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
  const guestMenu = !deskMenu && !signedIn && showMenus;
  const roleList = !deskMenu && signedIn && showMenus;
  const switcher = Boolean(session && showDeskSwitcher(session.desks, session.role, session.email));
  const loginTo = (localePath("/login", locale) === "/fr/login" ? "/fr/login" : "/login") as "/login" | "/fr/login";

  useEffect(() => {
    if (!open) return;
    dismissPopovers();
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = drawerTabStops(panelRef.current);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!panelRef.current.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && document.activeElement === first) {
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
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  // Never leave a closed `fixed inset-0` portal in the DOM. After CSS loads,
  // an opacity-0 backdrop still sits at z-[80] and eats every click if
  // `hidden` / `pointer-events-none` fail (Safari + display:none + fixed).
  if (typeof document === "undefined" || !open) return null;

  return createPortal(
    <div className="pointer-events-auto">
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[80] bg-fg/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        id="ke-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-y-0 right-0 z-[90] flex w-[min(86vw,24rem)] min-w-0 flex-col overflow-y-auto overscroll-contain bg-bg shadow-lift ring-1 ring-border"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <BrandMark size="sm" align="start" />
          {headerExtra}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="grid size-12 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-full text-fg hover:bg-surface-2"
            aria-label={t("close")}
          >
            <X className="size-6" strokeWidth={1.75} />
          </button>
        </div>
        {!signedIn && showMenus ? (
          <div className="shrink-0 border-b border-border px-3 py-3">
            <Link
              to={loginTo}
              onClick={onClose}
              className="flex min-h-[44px] items-center gap-3 rounded-full bg-primary px-3 text-base font-medium text-primary-fg"
            >
              <MenuGlyph id="login" className="text-primary-fg" />
              {t("signIn")}
            </Link>
            <Link
              to={loginTo}
              search={{ intent: "up" }}
              onClick={onClose}
              className="mt-2 flex min-h-[44px] items-center gap-3 rounded-full px-3 text-base font-medium text-fg ring-1 ring-border"
            >
              <MenuGlyph id="parent" />
              {t("createAccount")}
            </Link>
          </div>
        ) : null}
        <nav className="flex-1 px-3 py-3">
          {guestMenu ? (
            <GuestDrawerLinks navExtra={navExtra} onClose={onClose} title={title} />
          ) : (
            <>
          {navExtra ? <DrawerSection title={t("navFindCare")} marker="drawer-find-care" startOpen>{navExtra}</DrawerSection> : null}
          <div className="px-3 py-1">
            <SmartMatchEntry inline />
          </div>
          {roleList ? (
            <details
              className="py-0.5"
              data-ke="drawer-kidease"
              ref={(node) => bindDeskGroup(node, "menu", "kidease", true)}
              onToggle={(event) => writeDeskGroupOpen("menu", "kidease", event.currentTarget.open)}
            >
              <summary className={drawerSummaryClass}>KidEase</summary>
              <RoleNavLinks role={roleShown} paid={paidShown} appearance="drawer" onNavigate={onClose} />
            </details>
          ) : null}
          {switcher ? (
            <div className="mb-3 md:hidden">
              <DeskSwitcher />
            </div>
          ) : null}
          {deskMenu ? (
            <nav data-ke="role-nav" data-role={deskRole} aria-label={title}>
              {visibleDeskGroups(deskMenu.desk, deskMenu.items).map(({ group, items: rows }) => {
                const visibleRows = rows.filter((item) => item.id !== "account");
                if (visibleRows.length === 0 && group.id !== "settings") return null;
                return (
                <details
                  key={group.id}
                  ref={(node) => bindDeskGroup(node, deskMenu.desk, group.id, Boolean(group.open))}
                  onToggle={(event) => writeDeskGroupOpen(deskMenu.desk, group.id, event.currentTarget.open)}
                  className="py-0.5"
                >
                  <summary className={drawerSummaryClass}>
                    <span>{group.labelKey ? t(group.labelKey) : group.label}</span>
                  </summary>
                  <div>
                    {group.id === "settings" ? (
                      <div className="flex min-h-[44px] items-center gap-3 px-3">
                        <MenuGlyph id="language" />
                        <LanguageSelect className="w-full justify-start" />
                      </div>
                    ) : null}
                    {visibleRows.map((item) => {
                        const plan = item.id === "upgrade" || item.id === "subscription";
                        const label = item.labelKey ? t(item.labelKey) : item.label;
                        const on = deskMenu.active === item.id;
                        const rowClass = cn(
                          "flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium",
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
                              to={deskHrefForLocale(item.href, pathname)}
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
                );
              })}
            </nav>
          ) : null}
            </>
          )}
          <FooterMoreLinks
            appearance="drawer"
            onNavigate={onClose}
            share={!signedIn}
            omit={
              guestMenu
                ? GUEST_DRAWER_FOOTER_OMIT
                : roleList
                  ? ["/search"]
                  : []
            }
          />
          {signedIn ? <ShareKidEaseButton appearance="drawer" onDone={onClose} /> : null}
          {signedIn ? (
            <>
              <div className="my-3 h-px bg-border" />
              <Link
                to={deskHrefForLocale(accountHref, pathname)}
                search={accountSearch}
                onClick={onClose}
                className="flex min-h-[44px] items-center gap-3 rounded-xl bg-primary px-3 text-base font-medium text-primary-fg"
              >
                <MenuGlyph id="account" className="text-primary-fg" />
                {accountLabel}
              </Link>
              <Link
                to={localePath("/delete-account", locale)}
                data-ke="drawer-delete-account"
                onClick={onClose}
                className="mt-2 flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-base text-fg ring-1 ring-border"
              >
                {t("deleteAccount")}
              </Link>
              <button
                type="button"
                data-ke="drawer-sign-out"
                onClick={() => {
                  onClose();
                  onSignOut();
                }}
                className="mt-2 flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-base text-fg ring-1 ring-border"
              >
                <MenuGlyph id="logout" />
                {t("signOut")}
              </button>
            </>
          ) : null}
        </nav>
        <div className={cn("shrink-0 space-y-2 border-t border-border px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]", deskMenu && "hidden")}>
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
