import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { ParentDesk } from "@/components/parent-desk";
import { SupportPreviewBanner } from "@/components/support-preview-banner";
import { RedirectToSignIn, TwoFactorGate } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/parent")({
  validateSearch: (s: Record<string, unknown>) => {
    const out: { tab?: "saved" | "enrolled" | "profile" | "payments"; preview?: "support" } = {};
    const tab = s.tab;
    if (tab === "saved" || tab === "enrolled" || tab === "profile" || tab === "payments") out.tab = tab;
    if (s.preview === "support") out.preview = "support";
    return out;
  },
  component: ParentPage,
});

function ParentPage() {
  const { user, isPending } = useCurrentUserState();
  const { t } = useCopy();
  const search = Route.useSearch();
  const initialTab =
    search.tab === "saved" ? "saved" : search.tab === "enrolled" ? "bookings" : search.tab === "payments" ? "payments" : "children";

  if (isPending) {
    return (
      <Shell>
        <p className="p-8 text-muted">{t("loading")}</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;

  return (
    <TwoFactorGate next="/parent">
      {search.preview === "support" ? <SupportPreviewBanner /> : null}
      <ParentDesk initialTab={initialTab} />
    </TwoFactorGate>
  );
}
