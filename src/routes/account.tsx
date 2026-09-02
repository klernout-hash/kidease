import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { ParentDesk } from "@/components/parent-desk";
import { Button } from "@/components/ui/button";
import { TwoFactorGate } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/account")({
  validateSearch: (s: Record<string, unknown>) => {
    const tab = s.tab;
    if (tab === "saved" || tab === "enrolled" || tab === "profile") return { tab };
    return {};
  },
  component: AccountPage,
});

function AccountPage() {
  const { user, isPending } = useCurrentUserState();
  const { t } = useCopy();
  const search = Route.useSearch();
  const initialTab = search.tab === "saved" ? "saved" : search.tab === "enrolled" ? "bookings" : "children";

  if (isPending) {
    return (
      <Shell>
        <p className="p-8 text-muted">{t("loading")}</p>
      </Shell>
    );
  }
  if (!user) {
    return (
      <Shell>
        <main className="ke-gutter mx-auto max-w-lg py-12 text-center">
          <h1 className="font-display text-3xl">{search.tab === "enrolled" ? t("enrolled") : search.tab === "saved" ? t("saved") : t("account")}</h1>
          <p className="mt-3 text-muted">{t("loginLead")}</p>
          <div className="mt-8 flex flex-col gap-3">
            <Button size="lg" className="h-14 min-h-14 w-full px-7 text-base" asChild>
              <Link to="/login" search={{ role: "parent", intent: "in", next: "/parent" }}>
                {t("parentSignIn")}
              </Link>
            </Button>
            <Button size="lg" variant="secondary" className="h-14 min-h-14 w-full px-7 text-base" asChild>
              <Link to="/search">{t("heroCta")}</Link>
            </Button>
          </div>
        </main>
      </Shell>
    );
  }

  return (
    <TwoFactorGate next="/parent">
      <ParentDesk initialTab={initialTab} />
    </TwoFactorGate>
  );
}
