import { useEffect, useRef, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, CreditCard } from "lucide-react";
import { Shell } from "@/components/shell";
import { CountBadge } from "@/components/count-badge";
import { DeskMenuProvider } from "@/components/desk-menu";
import { DeskSwitcher, useSessionDesks } from "@/components/desk-switcher";
import { attentionForItem } from "@/lib/attention";
import { deskQueryForViewer, showDeskSwitcher } from "@/lib/desks";
import {
  DESK_META,
  bindDeskGroup,
  visibleDeskGroups,
  writeDeskGroupOpen,
  deskHrefForLocale,
  deskPathIsCurrent,
  visibleDeskNav,
  type DeskGroup,
  type DeskIcon,
  type DeskId,
  type DeskItem,
} from "@/lib/desk-nav";
import { LanguageSelect } from "@/components/language-select";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { useRoleChrome } from "@/components/role-chrome";
import { useInNativeShell } from "@/lib/use-native-shell";
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
    // max-md:h-11, not h-11: an unlayered `.h-11 { height: 44px }` rule in styles.css
    // beat md:h-auto, so a two-line French hint spilled onto the next item.
    "inline-flex box-border max-md:h-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3 text-sm leading-none no-underline hover:no-underline",
    "md:h-auto md:min-h-[44px] md:flex-col md:items-stretch md:justify-start md:whitespace-normal md:rounded-lg md:px-2.5 md:py-1.5 md:leading-snug",
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
      <span className="flex w-full min-w-0 items-center gap-2 font-medium leading-snug">
        <DeskItemIcon name={item.icon} className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 wrap-anywhere">{label}</span>
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
      aria-current={on ? "page" : undefined}
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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session } = useSessionDesks();
  const search = item.search?.desk === "director"
    ? { ...item.search, desk: deskQueryForViewer("provider", session?.centreRole) }
    : item.search;
  return (
    <Link
      to={deskHrefForLocale(item.href!, pathname)}
      {...(search ? { search } : {})}
      data-ke="desk-primary-pill"
      data-nav={plan ? "upgrade" : item.id}
      aria-current={on ? "page" : undefined}
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
    return deskPathIsCurrent(item.href, pathname);
  }
  return active === item.id;
}

function DeskRailGroup({ desk, group, label, activeItem, children }: {
  desk: DeskId;
  group: DeskGroup;
  label: string;
  activeItem?: string;
  children: ReactNode;
}) {
  const details = useRef<HTMLDetailsElement | null>(null);
  useEffect(() => {
    if (activeItem && details.current) details.current.open = true;
  }, [activeItem]);
  return (
    <details
      ref={(node) => {
        details.current = node;
        bindDeskGroup(node, desk, group.id, Boolean(group.open || activeItem));
      }}
      onToggle={(event) => writeDeskGroupOpen(desk, group.id, event.currentTarget.open)}
      className="group/desk-rail py-0.5"
    >
      <summary className="mt-3 flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border-b border-border px-2.5 pb-1 text-sm font-extrabold uppercase tracking-[0.14em] text-fg [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 whitespace-normal wrap-anywhere">{label}</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-subtle group-open/desk-rail:rotate-180" />
      </summary>
      <div className="mt-[8px] flex flex-col gap-[8px]">{children}</div>
    </details>
  );
}

export function DeskShell({
  desk,
  active,
  onSelect,
  children,
  wide,
  headingMode = "page",
  pageClassName,
  fitViewport = false,
}: {
  desk: DeskId;
  active: string;
  onSelect: (id: string) => void;
  children: ReactNode;
  wide?: boolean;
  /** Aside label when the page already has its own h1, such as Your centres. */
  headingMode?: "page" | "aside";
  pageClassName?: string;
  fitViewport?: boolean;
}) {
  const meta = DESK_META[desk];
  const { t } = useCopy();
  const { session, ready: sessionReady } = useSessionDesks();
  const centreRolePending = desk === "daycare" && !session;
  const chrome = useRoleChrome();
  const nativeShell = useInNativeShell();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const opts = {
    providerSubscriptions: session?.providerSubscriptions,
    showPayCtas: session?.showPayCtas,
    subscriptionsEnabled: nativeShell ? false : chrome.subscriptionsEnabled,
    centreOwner: session?.centreOwner,
    centreRolePending,
    centreLinked: session?.centreLinked,
    centreGrants: session?.centreGrants,
    centreCanInvite: session?.centreCanInvite,
    centreRole: session?.centreRole,
    curriculumPack: session?.curriculumPack,
    coparentLink: session?.coparentLink,
    coparentEmail: session?.coparentEmail,
    staffTimesheets: session?.staffTimesheets,
    providerPayroll: session?.providerPayroll,
    providerBooks: session?.providerBooks,
    centreTools: session?.centreTools,
    familyVault: session?.familyVault,
    careDesk: session?.careDesk,
    tourCalendar: session?.tourCalendar,
    hostListing: session?.hostListing,
    providerInsights: session?.providerInsights,
    leadTracker: session?.leadTracker,
    topRated: session?.topRated,
    liveSupport: session?.liveSupport,
  };
  const labelPlan = (item: DeskItem) => {
    const planned = planNavItem(item, chrome.paid);
    if (planned.id === "saved" && !chrome.subscriptionsEnabled) {
      return { ...planned, hint: undefined, hintKey: "deskNavShortlistOpenHint" as const };
    }
    return planned;
  };
  const allItems = visibleDeskNav(desk, opts).map(labelPlan);
  const staffViewer = session?.centreRole === "staff" || session?.centreRole === "read_only";
  const eyebrow = desk === "daycare" && staffViewer
    ? t("staffDeskEyebrow")
    : meta.eyebrowKey ? t(meta.eyebrowKey) : meta.eyebrow;
  const title = desk === "daycare" && staffViewer
    ? t("staffDeskTitle")
    : meta.titleKey ? t(meta.titleKey) : meta.title;
  const Heading = headingMode === "aside" ? "p" : "h1";
  const showSwitcher = Boolean(session && showDeskSwitcher(session.desks, session.role, session.email));

  return (
    <DeskMenuProvider value={{ desk, items: allItems, active, pathname, onSelect }}>
      <Shell fitViewport={fitViewport} pageClassName={pageClassName}>
        <div className={cn("ke-dense mx-auto flex min-w-0 flex-col gap-3 px-3 py-2 md:py-3", desk === "admin" && "ke-admin-wrap", wide ? "max-w-[90rem]" : "max-w-6xl", fitViewport && "min-h-0 w-full flex-1")}>
          <div className={cn("flex flex-col gap-3 md:flex-row md:items-start md:gap-4", fitViewport && "min-h-0 flex-1 md:items-stretch")}>
            <aside className={cn("md:w-44 md:shrink-0 md:overflow-y-auto app-wide:w-52", fitViewport ? "shrink-0 md:min-h-0" : "md:sticky md:top-[calc(var(--ke-header-h,3.5rem)+var(--ke-view-as-h,0px))] md:max-h-[calc(100dvh-var(--ke-header-h,3.5rem)-var(--ke-view-as-h,0px)-var(--ke-safe-bottom,0px)-var(--ke-desk-bottom,0px)-0.75rem)] md:pb-3 [[data-channel=app]_&]:[--ke-desk-bottom:4.75rem]")}>
              <p className="hidden text-[11px] font-medium uppercase tracking-[0.14em] text-subtle md:block">{eyebrow}</p>
              <Heading className={cn("font-display text-[1.2rem] leading-tight md:mt-0.5", headingMode === "aside" && "max-md:sr-only")}>{title}</Heading>
              {desk === "admin" ? (
                <div className="mt-2" data-ke="admin-language">
                  <LanguageSelect pill />
                </div>
              ) : null}
              {showSwitcher ? (
                <div className="mt-2 hidden md:block" data-ke="desk-switcher-slot">
                  <DeskSwitcher />
                </div>
              ) : null}
              {centreRolePending && !sessionReady ? (
                <div className="ke-skel mt-2 hidden h-11 rounded-xl md:block" aria-hidden="true" />
              ) : null}
              <nav data-ke="desk-desktop-nav" className="mt-2 hidden flex-col gap-[8px] md:flex">
                {visibleDeskGroups(desk, allItems).map(({ group, items }) => (
                  <DeskRailGroup
                    key={group.id}
                    desk={desk}
                    group={group}
                    label={group.labelKey ? t(group.labelKey) : group.label}
                    activeItem={items.find((item) => itemIsOn(item, active, pathname))?.id}
                  >
                    {items.map((item) => {
                      const on = itemIsOn(item, active, pathname);
                      const count = attentionForItem(session?.attention, item.id);
                      if (item.href) return <DeskNavLink key={item.id} item={item} on={on} t={t} count={count} />;
                      return <DeskNavButton key={item.id} item={item} on={on} onSelect={onSelect} t={t} count={count} />;
                    })}
                  </DeskRailGroup>
                ))}
              </nav>
            </aside>
            <div className={cn("min-w-0 flex-1", fitViewport && "flex min-h-0 flex-col")}>{children}</div>
          </div>
        </div>
      </Shell>
    </DeskMenuProvider>
  );
}
