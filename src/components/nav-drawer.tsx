import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { AdminDeskLink } from "@/components/admin-desk-link";
import { BrandMark } from "@/components/brand-mark";
import { dismissPopovers } from "@/lib/dismiss-popovers";
import { LanguageSelect } from "@/components/language-select";
import { AppearanceControl } from "@/components/appearance-control";
import { RateKidEaseControl } from "@/components/rate-kidease";
import { ShareKidEaseButton } from "@/components/share-button";
import { MenuGlyph, MenuRow } from "@/components/menu-row";
import { NotificationUnreadDot } from "@/components/notification-bell";
import { useSessionDesks } from "@/components/session-desks";
import { localePath } from "@/lib/locale-path";
import { failClosedUnread } from "@/lib/notifications";
import { useCopy } from "@/lib/use-copy";
import type { MenuIconId } from "@/lib/menu-icons";

type Item = { to: string; label: string; search?: Record<string, string>; icon: MenuIconId };

export function NavDrawer({
  open,
  onClose,
  title,
  items,
  parentLabel,
  providerLabel,
  signedIn,
  accountLabel,
  accountHref = "/account",
  accountSearch,
  isAdmin = false,
  desksSlot,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  items: Item[];
  parentLabel: string;
  providerLabel: string;
  signedIn: boolean;
  accountLabel: string;
  accountHref?: string;
  accountSearch?: Record<string, string>;
  isAdmin?: boolean;
  desksSlot?: ReactNode;
  onSignOut: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const { t, locale } = useCopy();
  const { session } = useSessionDesks();
  const unread = failClosedUnread(session?.notificationUnread);
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
        <nav className="flex-1 overflow-y-auto px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">KidEase</p>
          {signedIn ? (
            <MenuRow
              to="/notifications"
              label={t("notifications")}
              icon="notifications"
              appearance="drawer"
              onClick={onClose}
              badge={<NotificationUnreadDot unread={unread} />}
            />
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
                onClick={onClose}
              />
            </span>
          ))}
          <ShareKidEaseButton appearance="drawer" onDone={onClose} />
          <RateKidEaseControl appearance="drawer" onDone={onClose} />
          <div className="my-3 h-px bg-border" />
          {signedIn ? (
            <>
              {desksSlot ? <div className="mb-3 px-1">{desksSlot}</div> : null}
              <Link
                to={accountHref}
                search={accountSearch}
                onClick={onClose}
                className="flex min-h-12 items-center gap-3 rounded-xl bg-primary px-3 text-base font-medium text-primary-fg"
              >
                <MenuGlyph id="account" className="text-primary-fg" />
                {accountLabel}
              </Link>
              {isAdmin ? (
                <AdminDeskLink
                  onClick={onClose}
                  className="mt-2 flex min-h-12 items-center gap-3 rounded-full px-3 text-base font-medium text-fg ring-1 ring-border"
                >
                  <MenuGlyph id="admin" />
                  Admin
                </AdminDeskLink>
              ) : null}
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
          ) : (
            <>
              <Link
                to={loginTo}
                search={{ role: "parent", desk: "parent", intent: "in", next: "/parent" }}
                onClick={onClose}
                className="flex min-h-12 items-center gap-3 rounded-full bg-primary px-3 text-base font-medium text-primary-fg"
              >
                <MenuGlyph id="parent" className="text-primary-fg" />
                {parentLabel}
              </Link>
              <Link
                to={loginTo}
                search={{ role: "provider", desk: "director", intent: "in", next: "/provider" }}
                onClick={onClose}
                className="mt-2 flex min-h-12 items-center gap-3 rounded-full px-3 text-base font-medium text-fg ring-1 ring-border"
              >
                <MenuGlyph id="daycare" />
                {providerLabel}
              </Link>
            </>
          )}
          <div className="mt-4 flex items-center gap-3 overflow-visible rounded-full bg-surface px-3 ring-1 ring-border">
            <MenuGlyph id="language" />
            <LanguageSelect className="w-full justify-start" />
          </div>
          <div className="mt-3 rounded-xl bg-surface px-3 py-3 ring-1 ring-border">
            <div className="mb-2 flex items-center gap-3 px-0">
              <MenuGlyph id="appearance" />
              <span className="text-[13px] font-medium text-muted">{t("appearance")}</span>
            </div>
            <AppearanceControl />
          </div>
        </nav>
      </aside>
    </div>,
    document.body,
  );
}
