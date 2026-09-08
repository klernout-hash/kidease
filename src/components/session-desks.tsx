import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { getMyDesks } from "@/lib/server/roles";
import { SESSION_SETTLE_MS, withTimeout } from "@/lib/timeout";
import {
  deskFromPathname,
  parseDeskQuery,
  readStickyDesk,
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
    let cancelled = false;
    setError(false);
    void withTimeout(getMyDesks(), SESSION_SETTLE_MS, "get-desks-timeout")
      .then((s) => {
        if (cancelled) return;
        setSession(s);
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
  }, [user?.id, isPending]);

  useEffect(() => {
    const fromPath = deskFromPathname(pathname);
    if (fromPath && (!session || session.desks.includes(fromPath))) {
      setSticky(fromPath);
      return;
    }
    if (deskQuery && (!session || session.desks.includes(deskQuery))) {
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
