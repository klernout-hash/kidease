import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSelect } from "@/components/language-select";
import { AppearanceControl } from "@/components/appearance-control";
import { ShareKidEaseButton } from "@/components/share-button";

type Item = { to: string; label: string; search?: Record<string, string> };

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

  useEffect(() => {
    if (!open) return;
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
          {items.map((item) => (
            <span key={item.to + item.label}>
              {item.to === "/about" ? <div className="my-3 h-px bg-border" /> : null}
              <Link
                to={item.to}
                search={item.search}
                onClick={onClose}
                className="flex min-h-12 items-center rounded-xl px-3 text-[15px] font-medium text-fg hover:bg-surface"
              >
                {item.label}
              </Link>
            </span>
          ))}
          <ShareKidEaseButton appearance="drawer" onDone={onClose} />
          <div className="my-3 h-px bg-border" />
          {signedIn ? (
            <>
              {desksSlot ? <div className="mb-3 px-1">{desksSlot}</div> : null}
              <Link
                to={accountHref}
                search={accountSearch}
                onClick={onClose}
                className="flex min-h-12 items-center rounded-xl bg-primary px-3 text-base font-medium text-primary-fg"
              >
                {accountLabel}
              </Link>
              {isAdmin ? (
                <Link
                  to="/admin"
                  onClick={onClose}
                  className="mt-2 flex min-h-12 items-center justify-center rounded-full px-3 text-base font-medium text-fg ring-1 ring-border"
                >
                  Admin
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSignOut();
                }}
                className="mt-2 flex min-h-12 w-full items-center rounded-xl px-3 text-left text-base text-fg ring-1 ring-border"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                search={{ role: "parent", desk: "parent", intent: "in", next: "/parent" }}
                onClick={onClose}
                className="flex min-h-12 items-center justify-center rounded-full bg-primary px-3 text-base font-medium text-primary-fg"
              >
                {parentLabel}
              </Link>
              <Link
                to="/login"
                search={{ role: "provider", desk: "director", intent: "in", next: "/provider" }}
                onClick={onClose}
                className="mt-2 flex min-h-12 items-center justify-center rounded-full px-3 text-base font-medium text-fg ring-1 ring-border"
              >
                {providerLabel}
              </Link>
            </>
          )}
          <div className="mt-4 overflow-visible rounded-full bg-surface ring-1 ring-border">
            <LanguageSelect className="w-full justify-start" />
          </div>
          <div className="mt-3 rounded-xl bg-surface px-3 py-3 ring-1 ring-border">
            <AppearanceControl />
          </div>
        </nav>
      </aside>
    </div>,
    document.body,
  );
}
