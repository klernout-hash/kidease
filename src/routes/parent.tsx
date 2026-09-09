import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Shell } from "@/components/shell";
import { DeskSkeleton } from "@/components/page-skeleton";
import { SupportPreviewBanner } from "@/components/support-preview-banner";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { LoginFunnelDeskLand } from "@/lib/auth/login-funnel";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

const ParentDesk = lazy(() =>
  import("@/components/parent-desk").then((m) => ({ default: m.ParentDesk })),
);

export const Route = createFileRoute("/parent")({
  validateSearch: (s: Record<string, unknown>) => {
    const out: { tab?: "explore" | "saved" | "enrolled" | "requests" | "profile" | "payments" | "alerts" | "children"; preview?: "support" } = {};
    const tab = s.tab;
    if (tab === "explore" || tab === "saved" || tab === "enrolled" || tab === "requests" || tab === "profile" || tab === "payments" || tab === "alerts" || tab === "children") out.tab = tab;
    if (s.preview === "support") out.preview = "support";
    return out;
  },
  component: ParentPage,
});

function ParentPage() {
  const { user, isPending } = useCurrentUserState();
  const search = Route.useSearch();
  const initialTab =
    search.tab === "saved"
      ? "saved"
      : search.tab === "enrolled" || search.tab === "requests"
        ? "bookings"
        : search.tab === "payments"
          ? "payments"
          : search.tab === "alerts"
            ? "alerts"
            : search.tab === "explore"
              ? "explore"
              : search.tab === "children"
                ? "children"
                : "explore";

  if (isPending) {
    return (
      <Shell>
        <DeskSkeleton />
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;

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
        <ParentDesk initialTab={initialTab} />
      </Suspense>
    </TwoFactorGate>
  );
}
