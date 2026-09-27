import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { getMyDesks } from "@/lib/server/roles";
import { SESSION_SETTLE_MS, withTimeout } from "@/lib/timeout";
import {
  canVisitDesk,
  clearStickyDesk,
  deskFromPathname,
  parseDeskQuery,
  readStickyDesk,
  sanitizeStickyDesk,
  writeStickyDesk,
  type DeskKey,
  type SessionDesks,
} from "@/lib/desks";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

type SessionDesksState = {
  session: SessionDesks | null;
  ready: boolean;
  error: boolean;
  sticky: DeskKey | null;
  setSticky: (desk: DeskKey) => void;
};

const EMPTY: SessionDesksState = {
  session: null,
  ready: false,
  error: false,
  sticky: null,
  setSticky: () => undefined,
};

const SessionDesksContext = createContext<SessionDesksState>(EMPTY);

/** Desk routes need the full session. Public pages use the lighter role chrome. */
export function needsSessionDesks(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return (
    path === "/parent" ||
    path.startsWith("/parent/") ||
    path === "/provider" ||
    path.startsWith("/provider/") ||
    path === "/admin" ||
    path.startsWith("/admin/") ||
    path.startsWith("/admin-") ||
    path === "/support" ||
    path.startsWith("/support/") ||
    path === "/account" ||
    path.startsWith("/account/") ||
    path === "/inbox" ||
    path.startsWith("/inbox/") ||
    path === "/notifications" ||
    path.startsWith("/notifications/") ||
    path === "/menu" ||
    path.startsWith("/menu/")
  );
}

/**
 * One shared getMyDesks fetch per signed-in session.
 * Mount once under AuthProvider — do not call getMyDesks from every desk page.
 */
export function SessionDesksProvider({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const deskQuery = useRouterState({
    select: (s) => parseDeskQuery((s.location.search as { desk?: unknown }).desk as string | undefined),
  });
  const [session, setSession] = useState<SessionDesks | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [sticky, setStickyState] = useState<DeskKey | null>(null);

  function setSticky(desk: DeskKey) {
    writeStickyDesk(desk);
    setStickyState(desk);
  }

  useEffect(() => {
    setStickyState(readStickyDesk());
  }, []);

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      setSession(null);
      setStickyState(null);
      setError(false);
      setReady(true);
      return;
    }
    if (!needsSessionDesks(pathname)) {
      setError(false);
      setReady(true);
      return;
    }
    let cancelled = false;
    setSession(null);
    setReady(false);
    setError(false);
    void withTimeout(getMyDesks(), SESSION_SETTLE_MS, "get-desks-timeout")
      .then((s) => {
        if (cancelled) return;
        setSession(s);
        setStickyState((prev) => {
          const next = sanitizeStickyDesk(prev, s.desks, s.role, s.email);
          if (next !== prev) {
            if (next) writeStickyDesk(next);
            else clearStickyDesk();
          }
          return next;
        });
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, isPending, pathname]);

  useEffect(() => {
    const fromPath = deskFromPathname(pathname);
    if (fromPath && (!session || canVisitDesk(session.desks, fromPath, session.role, session.email))) {
      setSticky(fromPath);
      return;
    }
    if (deskQuery && (!session || canVisitDesk(session.desks, deskQuery, session.role, session.email))) {
      setSticky(deskQuery);
    }
  }, [pathname, deskQuery, session]);

  return (
    <SessionDesksContext.Provider value={{ session, ready, error, sticky, setSticky }}>
      {children}
    </SessionDesksContext.Provider>
  );
}

export function useSessionDesks(): SessionDesksState {
  return useContext(SessionDesksContext);
}
