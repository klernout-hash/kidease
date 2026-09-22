import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { CreditCard, Menu, X } from "lucide-react";
import { Shell } from "@/components/shell";
import { useSessionDesks } from "@/components/desk-switcher";
import {
  DESK_META,
  visibleDeskNav,
  visiblePrimaryDeskNav,
  visibleSecondaryDeskNav,
  type DeskIcon,
  type DeskId,
  type DeskItem,
} from "@/lib/desk-nav";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";
import { cn } from "@/lib/utils";

function DeskItemIcon({ name, className }: { name?: DeskIcon; className?: string }) {
  if (name === "credit-card") return <CreditCard className={className} strokeWidth={1.8} />;
  return null;
}

function navClass(on: boolean) {
  return cn(
    // inline-flex so <a> deep-links (Messages, Find care) match <button> pills.
    // Anchors are display:inline by default — min-height/ring then collapse into
    // a vertical sliver beside the label.
    "inline-flex box-border h-11 min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3 text-sm leading-none no-underline hover:no-underline",
    "md:h-auto md:min-h-0 md:flex-col md:items-stretch md:justify-start md:whitespace-normal md:rounded-lg md:px-2.5 md:py-1.5 md:leading-snug",
    on
      ? "bg-primary text-primary-fg ring-1 ring-primary"
      : "bg-transparent text-muted ring-1 ring-border hover:text-fg md:ring-0 md:hover:bg-surface",
  );
}

function deskItemText(item: DeskItem, t: (key: CopyKey) => string) {
  return {
    label: item.labelKey ? t(item.labelKey) : item.label,
    hint: item.hintKey ? t(item.hintKey) : item.hint,
  };
}

function DeskNavFace({
  item,
  on,
  t,
}: {
  item: DeskItem;
  on: boolean;
  t: (key: CopyKey) => string;
}) {
  const { label, hint } = deskItemText(item, t);
  return (
    <>
      <span className="flex items-center gap-2 font-medium leading-none">
        <DeskItemIcon name={item.icon} className="size-3.5 shrink-0" />
        {label}
      </span>
      {hint ? (
        <span className={cn("mt-0.5 hidden text-xs md:block", on ? "text-primary-fg/70" : "text-subtle")}>
          {hint}
        </span>
      ) : null}
    </>
  );
}

function DeskNavButton({
  item,
  on,
  onSelect,
  t,
}: {
  item: DeskItem;
  on: boolean;
  onSelect: (id: string) => void;
  t: (key: CopyKey) => string;
}) {
  return (
    <button
      type="button"
      data-ke="desk-primary-pill"
      onClick={() => onSelect(item.id)}
      className={cn(navClass(on), "text-left")}
    >
      <DeskNavFace item={item} on={on} t={t} />
    </button>
  );
}

function DeskNavLink({
  item,
  on,
  t,
}: {
  item: DeskItem;
  on: boolean;
  t: (key: CopyKey) => string;
}) {
  return (
    <Link
      to={item.href!}
      {...(item.search ? { search: item.search } : {})}
      data-ke="desk-primary-pill"
      className={cn(navClass(on), "text-left")}
    >
      <DeskNavFace item={item} on={on} t={t} />
    </Link>
  );
}

function itemIsOn(item: DeskItem, active: string, pathname: string): boolean {
  if (item.href) {
    const pathOnly = item.href.split("?")[0] || item.href;
    return pathname === pathOnly || (pathOnly !== "/" && pathname.startsWith(`${pathOnly}/`));
  }
  return active === item.id;
}

function DeskMoreSheet({
  items,
  active,
  pathname,
  onSelect,
  t,
  open,
  onClose,
}: {
  items: DeskItem[];
  active: string;
  pathname: string;
  onSelect: (id: string) => void;
  t: (key: CopyKey) => string;
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || !items.length) return null;

  return (
    <div className="pointer-events-auto" data-ke="desk-more-sheet">
      <button
        type="button"
        className="fixed inset-0 z-[70] bg-fg/40 backdrop-blur-[2px]"
        aria-label={t("close")}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed inset-x-0 bottom-0 top-[calc(3.2rem+env(safe-area-inset-top))] z-[80] flex flex-col rounded-t-2xl bg-surface shadow-lift ring-1 ring-border"
      >
        <div className="flex shrink-0 flex-col items-center pt-2">
          <span className="h-1 w-10 rounded-full bg-border" aria-hidden />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
          <h2 id={titleId} className="font-display text-xl">
            {t("deskNavMore")}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-full text-fg hover:bg-bg"
            aria-label={t("close")}
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2 pb-[max(1.25rem,calc(5.5rem+env(safe-area-inset-bottom)))]">
          {items.map((item) => {
            const on = itemIsOn(item, active, pathname);
            const { label, hint } = deskItemText(item, t);
            const rowClass = cn(
              "flex w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left no-underline hover:no-underline",
              on ? "bg-primary text-primary-fg" : "text-fg hover:bg-bg",
            );
            const body = (
              <>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-medium">
                    <DeskItemIcon name={item.icon} className="size-3.5 shrink-0" />
                    {label}
                  </span>
                  {hint ? (
                    <span className={cn("mt-0.5 block text-xs", on ? "text-primary-fg/70" : "text-subtle")}>
                      {hint}
                    </span>
                  ) : null}
                </span>
              </>
            );
            if (item.href) {
              return (
                <Link
                  key={item.id}
                  to={item.href}
                  {...(item.search ? { search: item.search } : {})}
                  onClick={onClose}
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
                onClick={() => {
                  onClose();
                  onSelect(item.id);
                }}
                className={rowClass}
              >
                {body}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function PhoneDeskNav({
  primary,
  secondary,
  active,
  pathname,
  onSelect,
  t,
  label,
}: {
  primary: DeskItem[];
  secondary: DeskItem[];
  active: string;
  pathname: string;
  onSelect: (id: string) => void;
  t: (key: CopyKey) => string;
  label: string;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const secondaryOn = secondary.some((item) => itemIsOn(item, active, pathname));

  return (
    <>
      <div className="flex items-center gap-2">
        <nav
          data-ke="desk-tab-nav"
          aria-label={label}
          className="flex min-w-0 flex-1 flex-nowrap gap-2 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {primary.map((item) => {
            const on = itemIsOn(item, active, pathname);
            if (item.href) return <DeskNavLink key={item.id} item={item} on={on} t={t} />;
            return <DeskNavButton key={item.id} item={item} on={on} onSelect={onSelect} t={t} />;
          })}
        </nav>
        {secondary.length ? (
          <button
            type="button"
            data-ke="desk-more-open"
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            aria-label={t("deskNavMore")}
            onClick={() => setMoreOpen(true)}
            className={cn(navClass(secondaryOn && !moreOpen), "gap-2")}
          >
            <Menu className="size-3.5 shrink-0" strokeWidth={1.8} />
            <span className="font-medium">{t("deskNavMore")}</span>
          </button>
        ) : null}
      </div>
      <DeskMoreSheet
        items={secondary}
        active={active}
        pathname={pathname}
        onSelect={onSelect}
        t={t}
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
      />
    </>
  );
}

export function DeskShell({
  desk,
  active,
  onSelect,
  children,
  wide,
}: {
  desk: DeskId;
  active: string;
  onSelect: (id: string) => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const meta = DESK_META[desk];
  const { t } = useCopy();
  const { session } = useSessionDesks();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const opts = {
    providerSubscriptions: session?.providerSubscriptions,
    showPayCtas: session?.showPayCtas,
    centreOwner: session?.centreOwner,
  };
  const phoneMore = desk === "parent" || desk === "daycare";
  const allItems = visibleDeskNav(desk, opts);
  const primary = phoneMore ? visiblePrimaryDeskNav(desk, opts) : allItems;
  const secondary = phoneMore ? visibleSecondaryDeskNav(desk, opts) : [];
  const eyebrow = meta.eyebrowKey ? t(meta.eyebrowKey) : meta.eyebrow;
  const title = meta.titleKey ? t(meta.titleKey) : meta.title;

  return (
    <Shell>
      <div className={cn("ke-dense mx-auto flex flex-col gap-3 px-3 py-2 md:flex-row md:items-start md:gap-4 md:py-3", wide ? "max-w-[90rem]" : "max-w-6xl")}>
        <aside className="md:sticky md:top-14 md:w-44 md:shrink-0">
          <p className="hidden text-[11px] font-medium uppercase tracking-[0.14em] text-subtle md:block">{eyebrow}</p>
          <h1 className="font-display text-[1.2rem] leading-tight md:mt-0.5">{title}</h1>
          <nav
            data-ke="desk-desktop-nav"
            className="mt-2 hidden flex-col gap-0.5 md:flex"
          >
            {allItems.map((item) => {
              const on = itemIsOn(item, active, pathname);
              if (item.href) return <DeskNavLink key={item.id} item={item} on={on} t={t} />;
              return <DeskNavButton key={item.id} item={item} on={on} onSelect={onSelect} t={t} />;
            })}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
          <div className="sticky top-[calc(3.2rem+env(safe-area-inset-top))] z-30 -mx-3 mb-2 border-b border-border bg-bg px-3 py-1 md:hidden">
            {phoneMore ? (
              <PhoneDeskNav
                primary={primary}
                secondary={secondary}
                active={active}
                pathname={pathname}
                onSelect={onSelect}
                t={t}
                label={title}
              />
            ) : (
              <nav data-ke="desk-tab-nav" className="flex max-w-full flex-wrap gap-2 pb-1">
                {allItems.map((item) => {
                  const on = itemIsOn(item, active, pathname);
                  if (item.href) return <DeskNavLink key={item.id} item={item} on={on} t={t} />;
                  return <DeskNavButton key={item.id} item={item} on={on} onSelect={onSelect} t={t} />;
                })}
              </nav>
            )}
          </div>
          {children}
        </div>
      </div>
    </Shell>
  );
}
