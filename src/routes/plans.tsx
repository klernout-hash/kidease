import { createFileRoute } from "@tanstack/react-router";
import { FoundingPlans } from "@/components/founding-plans";
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
  loader: () => getPlansGate(),
  head: ({ loaderData }) => plansHead(Boolean(loaderData?.subscriptionsOn), "en"),
  component: PlansRoute,
});

function PlansRoute() {
  return <PlansPage subscriptionsOn={Route.useLoaderData().subscriptionsOn} />;
}

/**
 * Public plans. While subscriptions are off this is the free founding period,
 * rendered on the server so the page is not an empty nav shell.
 * While subscriptions are on, the existing catalogue stays.
 */
export function PlansPage({ subscriptionsOn }: { subscriptionsOn: boolean }) {
  const chrome = useRoleChrome();
  return (
    <Shell>
      <main data-ke="plans-page">
        {subscriptionsOn ? (
          <OptionalUpgrades
            side={chrome.pending ? "both" : plansAudience(chrome.role)}
            signedIn={chrome.signedIn && !chrome.pending}
          />
        ) : (
          <FoundingPlans />
        )}
      </main>
    </Shell>
  );
}
