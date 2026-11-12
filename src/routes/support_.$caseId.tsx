import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { SupportCaseView } from "@/components/support-case";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/desk-switcher";
import { beforeLoadSupportDesk } from "@/lib/server/support-route";
import { SESSION_SETTLE_MS } from "@/lib/timeout";

export const Route = createFileRoute("/support_/$caseId")({
  beforeLoad: ({ params }) => beforeLoadSupportDesk(`/support/${params.caseId}`),
  head: () => ({
    meta: [
      { title: "Case · Support · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SupportCaseRoute,
});

function SupportCaseRoute() {
  const { caseId } = Route.useParams();
  return <SupportCaseScreen caseId={caseId} next={`/support/${caseId}`} />;
}

/** Case page. A sibling of the inbox, so the list does not stay on screen. */
export function SupportCaseScreen({ caseId, next }: { caseId: string; next: string }) {
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
        <p className="p-8 text-muted" data-ke="support-case">
          Loading…
        </p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (!allowed) {
    return (
      <Shell>
        <main className="mx-auto max-w-lg px-4 py-16 text-center" data-ke="support-case">
          <h1 className="font-display text-3xl">Not found</h1>
          <p className="mt-3 text-muted">This case is only for KidEase support staff.</p>
        </main>
      </Shell>
    );
  }

  return (
    <div data-ke="support-case">
      <TwoFactorGate next={next}>
        <SupportCaseView caseId={caseId} />
      </TwoFactorGate>
    </div>
  );
}
