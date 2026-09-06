import { type ReactNode, useEffect, useState } from "react";
import { Navigate, useRouterState } from "@tanstack/react-router";
import { authEnabled, signOut } from "./client";
import { useCurrentUser, useCurrentUserState } from "./use-current-user";
import { getTwoFactorStatus } from "@/lib/server/two-factor";
import { deskFromPathname, deskQueryValue, loginRoleFromDesk, parseDeskQuery } from "@/lib/desks";

/** Where `RedirectToSignIn` sends signed-out visitors. Create this route. */
export const SIGN_IN_PATH = "/login";

/** Render children only when a user is present (real session, or the disabled-auth dev user). */
export function SignedIn({ children }: { children: ReactNode }) {
  const { user } = useCurrentUserState();
  return user ? <>{children}</> : null;
}

/**
 * Render children only once we KNOW the visitor is signed out (`isPending` has
 * cleared and there is no user). Hidden while the session is still loading.
 */
export function SignedOut({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending || user) return null;
  return <>{children}</>;
}

export function RedirectToSignIn({ to = SIGN_IN_PATH }: { to?: string }) {
  const loc = useRouterState({
    select: (s) => ({ pathname: s.location.pathname, searchStr: s.location.searchStr ?? "" }),
  });
  if (loc.pathname === SIGN_IN_PATH || loc.pathname.startsWith(`${SIGN_IN_PATH}/`)) {
    return null;
  }
  if (to !== SIGN_IN_PATH) return <Navigate to={to} />;
  const qs = loc.searchStr.startsWith("?") ? loc.searchStr : loc.searchStr ? `?${loc.searchStr}` : "";
  const next = `${loc.pathname}${qs}`;
  const params = new URLSearchParams(qs.startsWith("?") ? qs.slice(1) : qs);
  const desk = parseDeskQuery(params.get("desk")) ?? deskFromPathname(loc.pathname);
  return (
    <Navigate
      to="/login"
      search={{
        intent: "in" as const,
        next: next.startsWith("/") ? next : "/",
        ...(desk ? { desk: deskQueryValue(desk), role: loginRoleFromDesk(desk) } : {}),
      }}
    />
  );
}

/** Password/social session plus the email verification code. */
export function TwoFactorGate({ next, children }: { next: string; children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const [state, setState] = useState<"load" | "ok" | "need">("load");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void getTwoFactorStatus()
      .then((s) => {
        if (!cancelled) setState(s.verified ? "ok" : "need");
      })
      .catch(() => {
        // A flaky mobile request must not bounce admin into /verify-2fa forever.
        if (!cancelled) setState("ok");
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (isPending || (user && state === "load")) return null;
  if (!user) return <RedirectToSignIn />;
  if (state === "need") return <Navigate to="/verify-2fa" search={{ next }} />;
  return <>{children}</>;
}

export function UserButton() {
  const user = useCurrentUser();
  if (!user) return null;
  const label = user.displayName ?? user.primaryEmail ?? "Account";
  return (
    <div className="flex items-center gap-2">
      {user.profileImageUrl ? (
        <img src={user.profileImageUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
      ) : (
        <span className="grid h-8 w-8 place-items-center rounded-full bg-black/10 text-sm font-medium dark:bg-white/20">
          {label.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="text-sm font-medium">{label}</span>
      {authEnabled && (
        <button type="button" onClick={() => void signOut()} className="cursor-pointer text-sm underline-offset-4 opacity-70 hover:underline">
          Sign out
        </button>
      )}
    </div>
  );
}
