import { Link, useRouterState } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import {
  DESK_PATH,
  headerDesks,
  highlightDesk,
  openAdminDesk,
  parseDeskQuery,
  showDeskSwitcher,
  type DeskKey,
} from "@/lib/desks";
import { inboxSearch, inboxUnreadForDesk, inboxViewForDesk } from "@/lib/inbox-view";
import { useSessionDesks } from "@/components/session-desks";
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
          "inline-flex h-8 items-center rounded-full px-2.5 text-[11px] font-medium leading-none min-w-0 flex-1 justify-center",
          on ? "bg-primary text-primary-fg" : "text-muted hover:text-fg",
        );
        if (desk === "admin") {
          return (
            <button
              key={desk}
              type="button"
              data-ke="desk-switch-tab"
              data-desk={desk}
              aria-current={on ? "page" : undefined}
              className={className}
              onClick={() => {
                onPick(desk);
                openAdminDesk();
              }}
            >
              {deskLabel(t, desk)}
            </button>
          );
        }
        return (
          <Link
            key={desk}
            to={DESK_PATH[desk]}
            onClick={() => onPick(desk)}
            data-ke="desk-switch-tab"
            data-desk={desk}
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

export function DeskSwitcher({ compact = false }: { compact?: boolean }) {
  const { t } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryDesk = useRouterState({
    select: (s) => parseDeskQuery((s.location.search as { desk?: unknown }).desk as string | undefined),
  });
  const { session, sticky, setSticky } = useSessionDesks();
  // Same Better Auth session. Pills only navigate: they do not call setRole
  // or rewrite the session cookie. /provider still promotes via its own mount.
  if (!session || !showDeskSwitcher(session.desks, session.role, session.email)) return null;

  const desks = headerDesks(session.desks, session.role, session.email);
  const highlighted = highlightDesk(pathname, sticky, queryDesk);
  const current = highlighted && desks.includes(highlighted) ? highlighted : null;

  const chrome = "flex w-full min-w-0 items-center gap-0.5 rounded-full bg-surface/90 p-0.5 ring-1 ring-border";

  return (
    <div
      data-ke="desk-switcher"
      role="navigation"
      aria-label={t("deskSwitcherLabel")}
      className={compact ? "flex w-full min-w-0 items-center gap-1" : "w-full min-w-0"}
    >
      <div className={chrome}>
        <DeskPills desks={desks} current={current} onPick={setSticky} t={t} />
        <InboxLink pathname={pathname} current={current} unread={inboxUnreadForDesk(session, current)} />
      </div>
    </div>
  );
}
