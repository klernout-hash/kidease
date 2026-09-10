import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, MessageCircle } from "lucide-react";
import { AdminDeskLink } from "@/components/admin-desk-link";
import {
  DESK_PATH,
  headerDesks,
  highlightDesk,
  parseDeskQuery,
  showDeskSwitcher,
  type DeskKey,
} from "@/lib/desks";
import { inboxSearch, inboxViewForDesk } from "@/lib/inbox-view";
import { useSessionDesks } from "@/components/session-desks";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCopy } from "@/lib/use-copy";
import type { CopyKey } from "@/lib/copy";
import { cn } from "@/lib/utils";

export { useSessionDesks } from "@/components/session-desks";

const DESK_COPY: Record<DeskKey, CopyKey> = {
  parent: "deskParent",
  provider: "deskDirector",
  admin: "deskAdmin",
  support: "deskSupport",
};

function deskLabel(t: (key: CopyKey) => string, desk: DeskKey) {
  return t(DESK_COPY[desk]);
}

function DeskPills({
  desks,
  current,
  onPick,
  t,
}: {
  desks: DeskKey[];
  current: DeskKey | null;
  onPick: (desk: DeskKey) => void;
  t: (key: CopyKey) => string;
}) {
  return (
    <>
      {desks.map((desk) => {
        const on = current === desk;
        const className = cn(
          "inline-flex h-8 items-center rounded-full px-2.5 text-[11px] font-medium leading-none",
          on ? "bg-primary text-primary-fg" : "text-muted hover:text-fg",
        );
        if (desk === "admin") {
          return (
            <AdminDeskLink
              key={desk}
              onClick={() => onPick(desk)}
              aria-current={on ? "page" : undefined}
              className={className}
            >
              {deskLabel(t, desk)}
            </AdminDeskLink>
          );
        }
        return (
          <Link
            key={desk}
            to={DESK_PATH[desk]}
            onClick={() => onPick(desk)}
            aria-current={on ? "page" : undefined}
            className={className}
          >
            {deskLabel(t, desk)}
          </Link>
        );
      })}
    </>
  );
}

function InboxLink({
  pathname,
  current,
  unread,
}: {
  pathname: string;
  current: DeskKey | null;
  unread: number;
}) {
  return (
    <Link
      to="/inbox"
      search={inboxSearch(inboxViewForDesk(current))}
      aria-label={unread ? `Inbox, ${unread} unread` : "Inbox"}
      className={cn(
        "relative inline-flex size-8 items-center justify-center rounded-full",
        pathname.startsWith("/inbox") ? "text-primary" : "text-muted hover:text-fg",
      )}
    >
      <MessageCircle className="size-3.5" strokeWidth={1.8} />
      {unread > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-semibold leading-4 text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}

function DeskMenu({
  desks,
  current,
  onPick,
  t,
}: {
  desks: DeskKey[];
  current: DeskKey | null;
  onPick: (desk: DeskKey) => void;
  t: (key: CopyKey) => string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
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

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("deskSwitcherLabel")}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-8 items-center gap-0.5 rounded-full px-2.5 text-[11px] font-medium leading-none",
          current ? "bg-primary text-primary-fg" : "text-muted hover:text-fg",
        )}
      >
        {current ? deskLabel(t, current) : t("deskSwitcherLabel")}
        <ChevronDown className="size-3" strokeWidth={1.8} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.4rem)] z-50 min-w-36 overflow-hidden rounded-xl bg-surface py-1 shadow-lift ring-1 ring-border"
        >
          {desks.map((desk) => {
            const on = current === desk;
            const className = cn(
              "block px-3 py-2.5 text-sm hover:bg-surface-2",
              on ? "font-semibold text-fg" : "text-fg",
            );
            const onSelect = () => {
              onPick(desk);
              setOpen(false);
            };
            if (desk === "admin") {
              return (
                <AdminDeskLink
                  key={desk}
                  role="menuitem"
                  onClick={onSelect}
                  aria-current={on ? "page" : undefined}
                  className={className}
                >
                  {deskLabel(t, desk)}
                </AdminDeskLink>
              );
            }
            return (
              <Link
                key={desk}
                role="menuitem"
                to={DESK_PATH[desk]}
                onClick={onSelect}
                aria-current={on ? "page" : undefined}
                className={className}
              >
                {deskLabel(t, desk)}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function DeskSwitcher({ compact = false }: { compact?: boolean }) {
  const { t } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryDesk = useRouterState({
    select: (s) => parseDeskQuery((s.location.search as { desk?: unknown }).desk as string | undefined),
  });
  const { session, sticky, setSticky } = useSessionDesks();
  const { user } = useCurrentUserState();
  const email = user?.primaryEmail;
  // Same Better Auth session. Pills only navigate — they do not call setRole
  // or rewrite the session cookie. /provider still promotes via its own mount.
  if (!session || !showDeskSwitcher(session.desks, session.role, email)) return null;

  const desks = headerDesks(session.desks, session.role, email);
  const highlighted = highlightDesk(pathname, sticky, queryDesk);
  const current = highlighted && desks.includes(highlighted) ? highlighted : null;

  const chrome = "flex items-center gap-0.5 rounded-full bg-surface/90 p-0.5 ring-1 ring-border";

  if (compact) {
    return (
      <div role="navigation" aria-label={t("deskSwitcherLabel")} className="flex items-center gap-1">
        <DeskPills desks={desks} current={current} onPick={setSticky} t={t} />
        <InboxLink pathname={pathname} current={current} unread={session.unread} />
      </div>
    );
  }

  return (
    <div role="navigation" aria-label={t("deskSwitcherLabel")} className="shrink-0">
      <div className={cn(chrome, "md:hidden")}>
        <DeskMenu desks={desks} current={current} onPick={setSticky} t={t} />
        <InboxLink pathname={pathname} current={current} unread={session.unread} />
      </div>
      <div className={cn(chrome, "hidden md:flex")}>
        <DeskPills desks={desks} current={current} onPick={setSticky} t={t} />
        <InboxLink pathname={pathname} current={current} unread={session.unread} />
      </div>
    </div>
  );
}
