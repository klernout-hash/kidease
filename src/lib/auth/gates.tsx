import { type ReactNode, useEffect, useState } from "react";
import { Navigate, useRouterState } from "@tanstack/react-router";
import { authEnabled, signOut } from "./client";
import { useCurrentUser, useCurrentUserState } from "./use-current-user";
import { getTwoFactorStatus } from "@/lib/server/two-factor";
import { yieldToMain } from "@/lib/yield-main";
import { isFrPath } from "@/lib/locale-path";
import { Shell } from "@/components/shell";
import { DeskSkeleton } from "@/components/page-skeleton";
import {
  deskFromPathname,
  deskQueryValue,
  isAuthLoopPath,
  loginRoleFromDesk,
  parseDeskQuery,
  sanitizePostLoginNext,
  staffTwoFactorRequired,
  twoFactorGateState,
} from "@/lib/desks";

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
  const signIn = isFrPath(loc.pathname) ? "/fr/login" : SIGN_IN_PATH;
  if (
    loc.pathname === signIn ||
    loc.pathname === SIGN_IN_PATH ||
    loc.pathname === "/fr/login" ||
    loc.pathname.startsWith(`${SIGN_IN_PATH}/`) ||
    loc.pathname.startsWith("/fr/login/")
  ) {
    return null;
  }
  if (to !== SIGN_IN_PATH) return <Navigate to={to} />;
  const qs = loc.searchStr.startsWith("?") ? loc.searchStr : loc.searchStr ? `?${loc.searchStr}` : "";
  const next = `${loc.pathname}${qs}`;
  const params = new URLSearchParams(qs.startsWith("?") ? qs.slice(1) : qs);
  const desk = parseDeskQuery(params.get("desk")) ?? deskFromPathname(loc.pathname);
  return (
    <Navigate
      to={signIn}
      replace
      search={{
        intent: "in" as const,
        next:
          sanitizePostLoginNext(next) ??
          (next.startsWith("/") && !next.startsWith("//") && !isAuthLoopPath(next) ? next : "/"),
        ...(desk ? { desk: deskQueryValue(desk), role: loginRoleFromDesk(desk) } : {}),
      }}
    />
  );
}

/**
 * Admin desk test #34: every admin page waited on a fresh 2FA status call behind
 * "Checking admin access…". Remember a verified answer for this tab session and
 * render the desk at once, then re-check quietly. The server still enforces 2FA
 * on every admin route and loader, so this only skips the client wait.
 */
const TWO_FACTOR_CACHE_MS = 10 * 60 * 1000;
let twoFactorVerified: { userId: string; at: number } | null = null;

export function twoFactorCachedOk(userId: string | null | undefined, now = Date.now()): boolean {
  return Boolean(userId && twoFactorVerified?.userId === userId && now - twoFactorVerified.at < TWO_FACTOR_CACHE_MS);
}

export function rememberTwoFactor(userId: string, verified: boolean, now = Date.now()) {
  twoFactorVerified = verified ? { userId, at: now } : null;
}

/** Password/social session plus the email verification code. */
export function TwoFactorGate({
  next,
  children,
  pending,
}: {
  next: string;
  children: ReactNode;
  /** Shown while the 2FA status check is in flight so the route does not go blank (rage-click bait). */
  pending?: ReactNode;
}) {
  const { user, isPending } = useCurrentUserState();
  const staff = staffTwoFactorRequired(next);
  const [state, setState] = useState<"load" | "ok" | "need">(staff && !twoFactorCachedOk(user?.id) ? "load" : "ok");

  // Re-check only when the user or the staff requirement changes. Switching admin tabs
  // (/admin?tab=…) changes `next` but not the answer; re-checking on every tab unmounted the
  // whole desk behind "Checking admin access…" and refetched it (KB-17: 4–15 s per tab).
  const gateNext = staff ? "/admin" : next;
  useEffect(() => {
    if (!user) return;
    if (!staffTwoFactorRequired(gateNext)) {
      setState("ok");
      return;
    }
    let cancelled = false;
    const userId = user.id;
    // A cached yes renders now; the check below still runs and can send the user to /verify-2fa.
    setState(twoFactorCachedOk(userId) ? "ok" : "load");
    void yieldToMain()
      .then(() => getTwoFactorStatus())
      .then((s) => {
        rememberTwoFactor(userId, s.verified === true);
        if (!cancelled) setState(twoFactorGateState(s.verified, gateNext));
      })
      .catch(() => {
        // Admin / support fail closed. Parent / provider never reach here
        // (optional 2FA) so a flaky status check cannot loop /verify-2fa.
        rememberTwoFactor(userId, false);
        if (!cancelled) setState(twoFactorGateState(false, gateNext));
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, gateNext]);

  if (isPending || (user && state === "load")) {
    return (
      pending ?? (
        <Shell>
          <DeskSkeleton />
        </Shell>
      )
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (state === "need") {
    const safeNext = sanitizePostLoginNext(next) ?? (staffTwoFactorRequired(next) ? "/admin" : isFrPath(next) ? "/fr/parent" : "/parent");
    return <Navigate to="/verify-2fa" search={{ next: safeNext }} />;
  }
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
