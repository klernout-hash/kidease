import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { DeskShell } from "@/components/desk-shell";
import { ProviderSubscriptionPanel } from "@/components/provider-subscription";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/desk-switcher";
import { canBuyDaycareUpgrade } from "@/lib/upgrade-role";

export const Route = createFileRoute("/provider/subscription")({
  validateSearch: (s: Record<string, unknown>) => {
    const out: {
      checkout?: "success" | "cancel";
      addon?: "success" | "cancel";
      plan?: string;
      item?: string;
      session?: string;
    } = {};
    if (s.checkout === "success" || s.checkout === "cancel") out.checkout = s.checkout;
    if (s.addon === "success" || s.addon === "cancel") out.addon = s.addon;
    if (s.plan === "pro" || s.plan === "network") out.plan = s.plan;
    if (s.item === "featured_city" || s.item === "claim_boost" || s.item === "job_post") out.item = s.item;
    if (typeof s.session === "string" && /^cs_[A-Za-z0-9_]+$/.test(s.session)) out.session = s.session;
    return out;
  },
  head: () => ({
    meta: [
      { title: "Subscription · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ProviderSubscriptionPage,
});

function ProviderSubscriptionPage() {
  const { user, isPending } = useCurrentUserState();
  const { session, ready } = useSessionDesks();
  const daycareBuyer = Boolean(
    session &&
      canBuyDaycareUpgrade({
        role: session.role,
        ownsCentre: session.ownsCentre,
        linkedToCentre: session.centreLinked,
      }),
  );
  const allowed = Boolean(daycareBuyer && session?.providerSubscriptions);

  if (isPending || (user && !ready)) {
    return (
      <Shell>
        <p className="p-8 text-muted">Loading…</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (!session) {
    return (
      <Shell>
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="font-display text-3xl">Couldn’t confirm this account</h1>
          <p className="mt-3 text-muted">Refresh and try again. Nothing was charged.</p>
        </main>
      </Shell>
    );
  }
  if (!daycareBuyer) return <Navigate to="/parent" />;
  if (!allowed) {
    return (
      <Shell>
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="font-display text-3xl">Not found</h1>
          <p className="mt-3 text-muted">
            Centre plans are for directors. Sign in on the centre desk, or ask KidEase staff if this tab is
            turned off.
          </p>
        </main>
      </Shell>
    );
  }

  return (
    <TwoFactorGate next="/provider/subscription">
      <DeskShell
        desk="daycare"
        active="subscription"
        onSelect={(id) => {
          if (id !== "subscription" && typeof window !== "undefined") window.location.assign("/provider");
        }}
      >
        <ProviderSubscriptionPanel />
      </DeskShell>
    </TwoFactorGate>
  );
}
