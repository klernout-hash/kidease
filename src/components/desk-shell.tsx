import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { CreditCard, Menu } from "lucide-react";
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

const DeskSwitcher = lazy(() =>
  import("@/components/desk-switcher").then((m) => ({ default: m.DeskSwitcher })),
);

function DeskItemIcon({ name, className }: { name?: DeskIcon; className?: string }) {
  if (name === "credit-card") return <CreditCard className={className} strokeWidth={1.8} />;
  return null;
}

function navClass(on: boolean) {
  return cn(
    "min-h-11 shrink-0 rounded-full px-3 py-2 text-sm md:min-h-0 md:rounded-xl",
    on ? "bg-primary text-primary-fg" : "text-muted ring-1 ring-border hover:text-fg md:ring-0 md:hover:bg-surface",
  );
}

function deskItemText(item: DeskItem, t: (key: CopyKey) => string) {
  return {
    label: item.labelKey ? t(item.labelKey) : item.label,
    hint: item.hintKey ? t(item.hintKey) : item.hint,
  };
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
  const { label, hint } = deskItemText(item, t);
  return (
    <button type="button" onClick={() => onSelect(item.id)} className={cn(navClass(on), "text-left")}>
      <span className="flex items-center gap-2 font-medium">
        <DeskItemIcon name={item.icon} className="size-3.5 shrink-0" />
        {label}
      </span>
      {hint ? (
        <span className={cn("mt-0.5 hidden text-xs md:block", on ? "text-primary-fg/70" : "text-subtle")}>
          {hint}
        </span>
      ) : null}
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
  const { label, hint } = deskItemText(item, t);
  return (
    <Link
      to={item.href!}
      {...(item.search ? { search: item.search } : {})}
      className={navClass(on)}
    >
      <span className="flex items-center gap-2 font-medium">
        <DeskItemIcon name={item.icon} className="size-3.5 shrink-0" />
        {label}
      </span>
      {hint ? (
        <span className={cn("mt-0.5 hidden text-xs md:block", on ? "text-primary-fg/70" : "text-subtle")}>
          {hint}
        </span>
      ) : null}
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

function DaycareMoreMenu({
  items,
  active,
  pathname,
  onSelect,
  t,
}: {
  items: DeskItem[];
  active: string;
  pathname: string;
  onSelect: (id: string) => void;
  t: (key: CopyKey) => string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const secondaryOn = items.some((item) => itemIsOn(item, active, pathname));

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
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

  if (!items.length) return null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("deskNavMore")}
        onClick={() => setOpen((v) => !v)}
        className={cn(navClass(secondaryOn && !open), "flex items-center gap-2")}
      >
        <Menu className="size-3.5 shrink-0" strokeWidth={1.8} />
        <span className="font-medium">{t("deskNavMore")}</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl bg-surface p-2 shadow-lift ring-1 ring-border md:w-56"
        >
          {items.map((item) => {
            const on = itemIsOn(item, active, pathname);
            const { label } = deskItemText(item, t);
            if (item.href) {
              return (
                <Link
                  key={item.id}
                  role="menuitem"
                  to={item.href}
                  {...(item.search ? { search: item.search } : {})}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm",
                    on ? "bg-primary text-primary-fg" : "text-muted hover:bg-bg hover:text-fg",
                  )}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <DeskItemIcon name={item.icon} className="size-3.5 shrink-0" />
                    {label}
                  </span>
                </Link>
              );
            }
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSelect(item.id);
                }}
                className={cn(
                  "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm",
                  on ? "bg-primary text-primary-fg" : "text-muted hover:bg-bg hover:text-fg",
                )}
              >
                <span className="font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
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
  const primary = desk === "daycare" ? visiblePrimaryDeskNav(desk, opts) : visibleDeskNav(desk, opts);
  const secondary = visibleSecondaryDeskNav(desk, opts);
  const eyebrow = meta.eyebrowKey ? t(meta.eyebrowKey) : meta.eyebrow;
  const title = meta.titleKey ? t(meta.titleKey) : meta.title;

  return (
    <Shell>
      <div className={cn("mx-auto flex flex-col gap-6 px-4 py-8 md:flex-row md:items-start md:gap-8 md:py-10", wide ? "max-w-[90rem]" : "max-w-6xl")}>
        <aside className="md:sticky md:top-24 md:w-56 md:shrink-0">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">{eyebrow}</p>
          <h1 className="mt-2 font-display text-3xl">{title}</h1>
          <div className="mt-3 md:hidden">
            <Suspense fallback={<div className="ke-skel h-11 rounded-full" aria-hidden="true" />}>
              <DeskSwitcher compact />
            </Suspense>
          </div>
          <nav className="mt-5 flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
            {primary.map((item) => {
              const on = itemIsOn(item, active, pathname);
              if (item.href) return <DeskNavLink key={item.id} item={item} on={on} t={t} />;
              return <DeskNavButton key={item.id} item={item} on={on} onSelect={onSelect} t={t} />;
            })}
            {desk === "daycare" ? (
              <DaycareMoreMenu items={secondary} active={active} pathname={pathname} onSelect={onSelect} t={t} />
            ) : null}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </Shell>
  );
}
