import { createFileRoute, Navigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Shell } from "@/components/shell";
import { DeskSkeleton } from "@/components/page-skeleton";
import { SupportPreviewBanner } from "@/components/support-preview-banner";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { LoginFunnelDeskLand } from "@/lib/auth/login-funnel";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useSessionDesks } from "@/components/desk-switcher";
import { canBuyDaycareUpgrade, canBuyParentUpgrade } from "@/lib/upgrade-role";

const ParentDesk = lazy(() =>
  import("@/components/parent-desk").then((m) => ({ default: m.ParentDesk })),
);

export const Route = createFileRoute("/parent")({
  validateSearch: (s: Record<string, unknown>) => {
    const out: {
      tab?: "explore" | "saved" | "enrolled" | "requests" | "profile" | "payments" | "alerts" | "children" | "care";
      preview?: "support";
      plus?: "success" | "cancel";
      plan?: "plus" | "alerts";
      interval?: "month" | "year";
      session?: string;
    } = {};
    const tab = s.tab;
    if (tab === "explore" || tab === "saved" || tab === "enrolled" || tab === "requests" || tab === "profile" || tab === "payments" || tab === "alerts" || tab === "children" || tab === "care") out.tab = tab;
    if (s.preview === "support") out.preview = "support";
    if (s.plus === "success" || s.plus === "cancel") out.plus = s.plus;
    if (s.plan === "plus" || s.plan === "alerts") out.plan = s.plan;
    if (s.interval === "month" || s.interval === "year") out.interval = s.interval;
    if (typeof s.session === "string" && /^cs_[A-Za-z0-9_]+$/.test(s.session)) out.session = s.session;
    return out;
  },
  component: ParentPage,
});

function ParentPage() {
  const { user, isPending } = useCurrentUserState();
  const { session, ready } = useSessionDesks();
  const search = Route.useSearch();
  const upgradeSurface = search.tab === "payments" || search.plus === "success" || search.plus === "cancel";
  const initialTab =
    search.tab === "saved"
      ? "saved"
      : search.tab === "enrolled" || search.tab === "requests"
        ? "bookings"
          : search.tab === "payments" || search.plus === "success" || search.plus === "cancel"
          ? "payments"
          : search.tab === "alerts"
            ? "alerts"
            : search.tab === "explore"
              ? "explore"
              : search.tab === "children"
                ? "children"
                : search.tab === "care"
                  ? "care"
                  : "explore";

  if (isPending || (user && upgradeSurface && !ready)) {
    return (
      <Shell>
        <DeskSkeleton />
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (upgradeSurface && ready && !session) {
    return (
      <Shell>
        <main className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="font-display text-3xl">Couldn’t confirm this account</h1>
          <p className="mt-3 text-muted">Refresh and try again. Nothing was charged.</p>
        </main>
      </Shell>
    );
  }
  if (
    upgradeSurface &&
    session &&
    !canBuyParentUpgrade({
      role: session.role,
      ownsCentre: session.ownsCentre,
      linkedToCentre: session.centreLinked,
    })
  ) {
    const daycare = canBuyDaycareUpgrade({
      role: session.role,
      ownsCentre: session.ownsCentre,
      linkedToCentre: session.centreLinked,
    });
    if (daycare) return <Navigate to="/provider/subscription" />;
    if (session.home === "/admin") return <Navigate to="/admin" />;
    if (session.home === "/support") return <Navigate to="/support" />;
    return <Navigate to="/provider" />;
  }

  return (
    <TwoFactorGate
      next="/parent"
      pending={
        <Shell>
          <DeskSkeleton />
        </Shell>
      }
    >
      <LoginFunnelDeskLand desk="parent" />
      {search.preview === "support" ? <SupportPreviewBanner /> : null}
      <Suspense fallback={<DeskSkeleton />}>
        <ParentDesk
          initialTab={initialTab}
          plusReturn={search.plus ?? null}
          upgradeSearch={{
            plus: search.plus,
            plan: search.plan,
            interval: search.interval,
            session: search.session,
          }}
        />
      </Suspense>
    </TwoFactorGate>
  );
}
