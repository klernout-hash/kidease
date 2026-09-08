import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { SupportCaseView } from "@/components/support-case";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/desk-switcher";
import { SESSION_SETTLE_MS } from "@/lib/timeout";

export const Route = createFileRoute("/support/$caseId")({
  head: () => ({
    meta: [
      { title: "Case · Support · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SupportCasePage,
});

function SupportCasePage() {
  const { caseId } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  const { session, ready } = useSessionDesks();
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
          <p className="mt-3 text-muted">This case is only for KidEase support staff.</p>
        </main>
      </Shell>
    );
  }

  return (
    <TwoFactorGate next={`/support/${caseId}`}>
      <SupportCaseView caseId={caseId} />
    </TwoFactorGate>
  );
}
