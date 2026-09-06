import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { getMyDesks } from "@/lib/server/roles";
import { deskFromPathname, writeStickyDesk, type SessionDesks } from "@/lib/desks";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

type SessionDesksState = {
  session: SessionDesks | null;
  ready: boolean;
  error: boolean;
};

const EMPTY: SessionDesksState = { session: null, ready: false, error: false };

const SessionDesksContext = createContext<SessionDesksState>(EMPTY);

/**
 * One shared getMyDesks fetch per signed-in session.
 * Mount once under AuthProvider — do not call getMyDesks from every desk page.
 */
export function SessionDesksProvider({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [session, setSession] = useState<SessionDesks | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      setSession(null);
      setError(false);
      setReady(true);
      return;
    }
    let cancelled = false;
    setError(false);
    void getMyDesks()
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
    const desk = deskFromPathname(pathname);
    if (desk && session?.desks.includes(desk)) writeStickyDesk(desk);
  }, [pathname, session]);

  return <SessionDesksContext.Provider value={{ session, ready, error }}>{children}</SessionDesksContext.Provider>;
}

export function useSessionDesks(): SessionDesksState {
  return useContext(SessionDesksContext);
}
