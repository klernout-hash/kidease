import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { SupportDesk } from "@/components/support-desk";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/desk-switcher";
import { SESSION_SETTLE_MS } from "@/lib/timeout";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => {
    if (s.tab === "new") return { tab: "new" as const };
    return {};
  },
  component: SupportPage,
});

function SupportPage() {
  const { user, isPending } = useCurrentUserState();
  const { session, ready } = useSessionDesks();
  const search = Route.useSearch();
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
    <TwoFactorGate next="/support">
      <SupportDesk initialTab={search.tab === "new" ? "new" : "inbox"} />
    </TwoFactorGate>
  );
}
