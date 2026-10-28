import { createFileRoute, useRouterState, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { SupportDesk } from "@/components/support-desk";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { LoginFunnelDeskLand } from "@/lib/auth/login-funnel";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/desk-switcher";
import { beforeLoadSupportDesk } from "@/lib/server/support-route";
import { isFrPath } from "@/lib/locale-path";
import { SESSION_SETTLE_MS } from "@/lib/timeout";

export function supportValidateSearch(s: Record<string, unknown>) {
  if (s.tab === "new") return { tab: "new" as const };
  return {};
}

export function supportHead() {
  return {
    meta: [
      { title: "Support · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  };
}

export const Route = createFileRoute("/support")({
  beforeLoad: () => beforeLoadSupportDesk("/support"),
  head: supportHead,
  validateSearch: supportValidateSearch,
  component: SupportPage,
});

export function SupportPage() {
  const { user, isPending } = useCurrentUserState();
  const { session, ready } = useSessionDesks();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const next = isFrPath(pathname) ? "/fr/support" : "/support";
  const search = useSearch({ strict: false }) as ReturnType<typeof supportValidateSearch>;
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), SESSION_SETTLE_MS);
    return () => window.clearTimeout(t);
  }, []);
  const allowed = Boolean(ready && session?.desks.includes("support"));

  if ((isPending || !ready) && !settled) {
    return (
      <Shell>
        <p className="p-8 text-muted">Loading…</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (!allowed) {
    return (
      <Shell>
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="font-display text-3xl">Not found</h1>
          <p className="mt-3 text-muted">
            This page is only for KidEase staff with profiles.role = admin, support, or
            support_lead. Public help is at /help.
          </p>
        </main>
      </Shell>
    );
  }

  return (
    <TwoFactorGate next={next}>
      <LoginFunnelDeskLand desk="support" />
      <SupportDesk initialTab={search.tab === "new" ? "new" : "inbox"} />
    </TwoFactorGate>
  );
}
