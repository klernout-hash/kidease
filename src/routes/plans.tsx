import { createFileRoute } from "@tanstack/react-router";
import { OptionalUpgrades } from "@/components/optional-upgrades";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { useCopy } from "@/lib/use-copy";
import { useRoleChrome } from "@/components/role-chrome";
import { plansAudience } from "@/lib/upgrade-prompt";

export const Route = createFileRoute("/plans")({
  head: () => ({
    meta: [
      { title: "Plans · KidEase" },
      {
        name: "description",
        content:
          "KidEase is free for parents and daycares across Canada. Optional Parent Plus and centre plans are billed in Canadian dollars.",
      },
    ],
  }),
  component: PlansPage,
});

/** Public catalogue. Guests see both sides. A signed-in role sees only its own plans. */
export function PlansPage() {
  const chrome = useRoleChrome();
  const { t } = useCopy();
  if (chrome.pending) {
    return (
      <Shell bare>
        <main className="ke-gutter mx-auto min-h-64 max-w-6xl py-12" data-ke="plans-page" />
        <SiteFooter />
      </Shell>
    );
  }
  return (
    <Shell bare>
      <main data-ke="plans-page">
        <p className="ke-native-plan-note ke-gutter mx-auto max-w-6xl pt-12 text-sm text-muted" data-ke="native-plan-note">
          {t("nativePlansHidden")}
        </p>
        <OptionalUpgrades side={plansAudience(chrome.role)} signedIn={chrome.signedIn} />
      </main>
      <SiteFooter />
    </Shell>
  );
}
