import { createFileRoute, redirect } from "@tanstack/react-router";
import { OptionalUpgrades } from "@/components/optional-upgrades";
import { Shell } from "@/components/shell";
import { useRoleChrome } from "@/components/role-chrome";
import { MARKETING_PAGE_SEO_FR, pageSeoHead } from "@/lib/page-seo";
import { getPlansGate } from "@/lib/server/ui-chrome";
import { plansAudience } from "@/lib/upgrade-prompt";

export function plansHead(paid: boolean, locale: "en" | "fr" = "en") {
  if (locale === "fr") {
    return pageSeoHead(paid ? MARKETING_PAGE_SEO_FR.plansPaid : MARKETING_PAGE_SEO_FR.plans);
  }
  return pageSeoHead({
    title: "Plans · KidEase",
    description: paid
      ? "Search, up to five saved centres, and messages are included. Optional Parent Plus and centre plans are billed in Canadian dollars."
      : "Parents can search, save up to five centres, and message daycares at no charge. Daycares get every tool during the free founding period.",
    path: "/plans",
  });
}

export const Route = createFileRoute("/plans")({
  loader: async () => {
    const gate = await getPlansGate();
    if (!gate.subscriptionsOn) throw redirect({ to: "/" });
    return gate;
  },
  head: ({ loaderData }) => plansHead(Boolean(loaderData?.subscriptionsOn), "en"),
  component: PlansRoute,
});

function PlansRoute() {
  return <PlansPage subscriptionsOn={Route.useLoaderData().subscriptionsOn} />;
}

/**
 * Public plans. Direct visits redirect home while SUBSCRIPTIONS_ENABLED is off.
 * While it is on, the existing catalogue stays.
 */
export function PlansPage({ subscriptionsOn }: { subscriptionsOn: boolean }) {
  const chrome = useRoleChrome();
  if (!subscriptionsOn) return null;
  return (
    <Shell>
      <main data-ke="plans-page">
        <OptionalUpgrades
          side={chrome.pending ? "both" : plansAudience(chrome.role)}
          signedIn={chrome.signedIn && !chrome.pending}
        />
      </main>
    </Shell>
  );
}
