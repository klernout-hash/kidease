import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { LanguageSelect } from "@/components/language-select";
import { cn } from "@/lib/utils";

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
    const onPop = () => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPop);
    window.history.pushState({ keNav: true }, "");
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
    };
  }, [open, onClose]);

  return (
    <div className={cn("xl:hidden", open ? "pointer-events-auto" : "pointer-events-none")}>
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        className={cn(
          "fixed inset-0 z-40 bg-fg/40 backdrop-blur-[2px] transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        id="ke-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[min(86vw,24rem)] flex-col bg-bg shadow-lift ring-1 ring-border transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          open ? "translate-x-0" : "translate-x-full",
        )}
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
          <div className="my-3 h-px bg-border" />
          {signedIn ? (
            <>
              <Link
                to="/account"
                onClick={onClose}
                className="flex min-h-12 items-center rounded-xl bg-primary px-3 text-base font-medium text-primary-fg"
              >
                {accountLabel}
              </Link>
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
                search={{ role: "parent", intent: "in", next: "/search" }}
                onClick={onClose}
                className="flex min-h-12 items-center justify-center rounded-full bg-primary px-3 text-base font-medium text-primary-fg"
              >
                {parentLabel}
              </Link>
              <Link
                to="/login"
                search={{ role: "provider", intent: "in", next: "/provider" }}
                onClick={onClose}
                className="mt-2 flex min-h-12 items-center justify-center rounded-full px-3 text-base text-fg ring-1 ring-border"
              >
                {providerLabel}
              </Link>
            </>
          )}
          <div className="mt-4 overflow-visible rounded-full bg-surface ring-1 ring-border">
            <LanguageSelect className="w-full justify-start" />
          </div>
        </nav>
      </aside>
    </div>
  );
}
