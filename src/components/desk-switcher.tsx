import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { getMyDesks } from "@/lib/server/roles";
import { DESK_LABEL, DESK_PATH, type DeskKey, type SessionDesks } from "@/lib/desks";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

const PATH_DESK: Array<[string, DeskKey]> = [
  ["/admin", "admin"],
  ["/provider", "provider"],
  ["/parent", "parent"],
  ["/account", "parent"],
];

function deskFromPath(pathname: string): DeskKey | null {
  for (const [prefix, desk] of PATH_DESK) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return desk;
  }
  return null;
}

export function useSessionDesks() {
  const { user, isPending } = useCurrentUserState();
  const [session, setSession] = useState<SessionDesks | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      setSession(null);
      setReady(true);
      return;
    }
    let cancelled = false;
    void getMyDesks()
      .then((s) => {
        if (cancelled) return;
        setSession(s);
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, isPending]);

  return { session, ready };
}

export function DeskSwitcher({ compact = false }: { compact?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session } = useSessionDesks();
  if (!session || session.desks.length < 2) return null;

  const current = deskFromPath(pathname);

  return (
    <div className={cn("flex items-center gap-1", compact ? "" : "rounded-full bg-surface/90 p-0.5 ring-1 ring-border")}>
      {session.desks.map((desk) => {
        const on = current === desk;
        return (
          <Link
            key={desk}
            to={DESK_PATH[desk]}
            className={cn(
              "inline-flex h-8 items-center rounded-full px-2.5 text-[11px] font-medium leading-none",
              on ? "bg-primary text-primary-fg" : "text-muted hover:text-fg",
            )}
          >
            {DESK_LABEL[desk]}
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
