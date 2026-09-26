import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { DeskShell } from "@/components/desk-shell";
import { ProviderSubscriptionPanel } from "@/components/provider-subscription";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/desk-switcher";

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
  const allowed = Boolean(
    ready && session?.providerSubscriptions && (session.centreOwner !== false || session.role === "admin"),
  );

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
