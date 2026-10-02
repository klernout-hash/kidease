import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { Shell } from "@/components/shell";
import { CountBadge } from "@/components/count-badge";
import { DeskMenuProvider } from "@/components/desk-menu";
import { DeskSwitcher, useSessionDesks } from "@/components/desk-switcher";
import { attentionForItem } from "@/lib/attention";
import { showDeskSwitcher } from "@/lib/desks";
import {
  DESK_META,
  visibleDeskGroups,
  visibleDeskNav,
  type DeskIcon,
  type DeskId,
  type DeskItem,
} from "@/lib/desk-nav";
import { LanguageSelect } from "@/components/language-select";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { useRoleChrome } from "@/components/role-chrome";
import { upgradeNavLabel } from "@/lib/role-access";

function DeskItemIcon({ name, className }: { name?: DeskIcon; className?: string }) {
  if (name === "credit-card") return <CreditCard className={className} strokeWidth={1.8} />;
  return null;
}

function navClass(on: boolean) {
  return cn(
    // inline-flex so <a> deep-links (Messages, Find care) match <button> pills.
    // Anchors are display:inline by default: min-height/ring then collapse into
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
  count = 0,
}: {
  item: DeskItem;
  on: boolean;
  t: (key: CopyKey) => string;
  count?: number;
}) {
  const { label, hint } = deskItemText(item, t);
  return (
    <>
      <span className="flex w-full items-center gap-2 font-medium leading-none">
        <DeskItemIcon name={item.icon} className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1">{label}</span>
        <CountBadge count={count} />
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
  count = 0,
}: {
  item: DeskItem;
  on: boolean;
  onSelect: (id: string) => void;
  t: (key: CopyKey) => string;
  count?: number;
}) {
  return (
    <button
      type="button"
      data-ke="desk-primary-pill"
      data-nav={item.id === "subscription" || item.id === "upgrade" ? "upgrade" : item.id}
      onClick={() => onSelect(item.id)}
      className={cn(navClass(on), "text-left")}
    >
      <DeskNavFace item={item} on={on} t={t} count={count} />
    </button>
  );
}

function planNavItem(item: DeskItem, paid: boolean): DeskItem {
  if (item.id !== "subscription" && item.id !== "upgrade") return item;
  return {
    ...item,
    label: upgradeNavLabel(paid),
    labelKey: paid ? "navMyPlan" : "navUpgrade",
    hint: undefined,
    hintKey: undefined,
  };
}

function DeskNavLink({
  item,
  on,
  t,
  count = 0,
}: {
  item: DeskItem;
  on: boolean;
  t: (key: CopyKey) => string;
  count?: number;
}) {
  const plan = item.id === "subscription" || item.id === "upgrade";
  return (
    <Link
      to={item.href!}
      {...(item.search ? { search: item.search } : {})}
      data-ke="desk-primary-pill"
      data-nav={plan ? "upgrade" : item.id}
      className={cn(navClass(on), "w-full text-left")}
    >
      <DeskNavFace item={item} on={on} t={t} count={count} />
    </Link>
  );
}

function itemIsOn(item: DeskItem, active: string, pathname: string): boolean {
  if (item.id === "upgrade") return active === "upgrade";
  if (item.href) {
    if (item.search?.tab || item.search?.desk) return active === item.id;
    const pathOnly = item.href.split("?")[0] || item.href;
    return pathname === pathOnly || (pathOnly !== "/" && pathname.startsWith(`${pathOnly}/`));
  }
  return active === item.id;
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
  const chrome = useRoleChrome();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const opts = {
    providerSubscriptions: session?.providerSubscriptions,
    showPayCtas: session?.showPayCtas,
    centreOwner: session?.centreOwner,
    centreLinked: session?.centreLinked,
  };
  const labelPlan = (item: DeskItem) => planNavItem(item, chrome.paid);
  const allItems = visibleDeskNav(desk, opts).map(labelPlan);
  const eyebrow = meta.eyebrowKey ? t(meta.eyebrowKey) : meta.eyebrow;
  const title = meta.titleKey ? t(meta.titleKey) : meta.title;
  const showSwitcher = Boolean(session && showDeskSwitcher(session.desks, session.role, session.email));

  return (
    <DeskMenuProvider value={{ desk, items: allItems, active, pathname, onSelect }}>
      <Shell>
        <div className={cn("ke-dense mx-auto flex flex-col gap-3 px-3 py-2 md:py-3", wide ? "max-w-[90rem]" : "max-w-6xl")}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-4">
            <aside className="md:sticky md:top-14 md:w-44 md:shrink-0">
              <p className="hidden text-[11px] font-medium uppercase tracking-[0.14em] text-subtle md:block">{eyebrow}</p>
              <h1 className="font-display text-[1.2rem] leading-tight md:mt-0.5">{title}</h1>
              {showSwitcher ? (
                <div className="mt-2 hidden md:block" data-ke="desk-switcher-slot">
                  <DeskSwitcher />
                </div>
              ) : null}
              <nav data-ke="desk-desktop-nav" className="mt-2 hidden flex-col gap-0.5 md:flex">
                {visibleDeskGroups(desk, allItems).map(({ group, items }) => (
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
                    <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg px-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-subtle [&::-webkit-details-marker]:hidden">
                      {group.labelKey ? t(group.labelKey) : group.label}
                    </summary>
                    <div className="flex flex-col gap-0.5">
                      {group.id === "settings" ? (
                        <div className="px-2.5 py-1">
                          <LanguageSelect className="w-full justify-start" />
                        </div>
                      ) : null}
                      {items.map((item) => {
                        const on = itemIsOn(item, active, pathname);
                        const count = attentionForItem(session?.attention, item.id);
                        if (item.href) return <DeskNavLink key={item.id} item={item} on={on} t={t} count={count} />;
                        return <DeskNavButton key={item.id} item={item} on={on} onSelect={onSelect} t={t} count={count} />;
                      })}
                    </div>
                  </details>
                ))}
              </nav>
            </aside>
            <div className="min-w-0 flex-1">{children}</div>
          </div>
        </div>
      </Shell>
    </DeskMenuProvider>
  );
}
