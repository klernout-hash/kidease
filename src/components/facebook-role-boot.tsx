import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { FACEBOOK_ROLE_PENDING_KEY } from "@/lib/auth/social-callback";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

function onLogin(pathname: string) {
  return pathname === "/login" || pathname === "/fr/login";
}

/** New Facebook accounts stay on the parent / centre choice until they pick. */
export function FacebookRoleBoot() {
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (isPending || !user) return;
    if (typeof sessionStorage === "undefined") return;
    if (sessionStorage.getItem(FACEBOOK_ROLE_PENDING_KEY) !== "1") return;
    const params = new URLSearchParams(window.location.search);
    if (onLogin(pathname) && params.get("step") === "role") return;
    const next = `${pathname}${window.location.search}`;
    const base = pathname === "/fr/login" || pathname.startsWith("/fr/") ? "/fr/login" : "/login";
    const target = `${base}?intent=up&step=role&next=${encodeURIComponent(next)}`;
    window.location.assign(target);
  }, [isPending, pathname, user]);

  return null;
}
