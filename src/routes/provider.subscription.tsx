import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { DeskShell } from "@/components/desk-shell";
import { ProviderSubscriptionPanel } from "@/components/provider-subscription";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/desk-switcher";

export const Route = createFileRoute("/provider/subscription")({
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
  const allowed = Boolean(ready && session?.providerSubscriptions);

  if (isPending) {
    return (
      <Shell>
        <p className="p-8 text-muted">Loading…</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (!ready) {
    return (
      <Shell>
        <p className="p-8 text-muted">Loading…</p>
      </Shell>
    );
  }
  if (!allowed) {
    return (
      <Shell>
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="font-display text-3xl">Not found</h1>
          <p className="mt-3 text-muted">
            Subscription is a staff preview of centre plans. It is only for profiles.role = admin until
            FEATURE_PROVIDER_SUBSCRIPTIONS is on.
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
