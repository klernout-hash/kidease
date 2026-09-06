import { Link, useRouterState } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { DESK_PATH, deskFromPathname, showDeskSwitcher, writeStickyDesk, type DeskKey } from "@/lib/desks";
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

export function DeskSwitcher({ compact = false }: { compact?: boolean }) {
  const { t } = useCopy();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session } = useSessionDesks();
  // Same Better Auth session. Pills only navigate — they do not call setRole
  // or rewrite the session cookie. /provider still promotes via its own mount.
  if (!session || !showDeskSwitcher(session.desks)) return null;

  const current = deskFromPathname(pathname);

  return (
    <div
      role="navigation"
      aria-label={t("deskSwitcherLabel")}
      className={cn("flex items-center gap-1", compact ? "" : "rounded-full bg-surface/90 p-0.5 ring-1 ring-border")}
    >
      {session.desks.map((desk) => {
        const on = current === desk;
        return (
          <Link
            key={desk}
            to={DESK_PATH[desk]}
            onClick={() => writeStickyDesk(desk)}
            className={cn(
              "inline-flex h-8 items-center rounded-full px-2.5 text-[11px] font-medium leading-none",
              on ? "bg-primary text-primary-fg" : "text-muted hover:text-fg",
            )}
          >
            {t(DESK_COPY[desk])}
          </Link>
        );
      })}
      <Link
        to="/inbox"
        aria-label={session.unread ? `Inbox, ${session.unread} unread` : "Inbox"}
        className={cn(
          "relative inline-flex size-8 items-center justify-center rounded-full",
          pathname.startsWith("/inbox") ? "text-primary" : "text-muted hover:text-fg",
        )}
      >
        <MessageCircle className="size-3.5" strokeWidth={1.8} />
        {session.unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-semibold leading-4 text-white">
            {session.unread > 9 ? "9+" : session.unread}
          </span>
        ) : null}
      </Link>
    </div>
  );
}
