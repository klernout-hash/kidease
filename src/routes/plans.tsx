import { createFileRoute } from "@tanstack/react-router";
import { FoundingPlans } from "@/components/founding-plans";
import { OptionalUpgrades } from "@/components/optional-upgrades";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { useRoleChrome } from "@/components/role-chrome";
import { getPlansGate } from "@/lib/server/ui-chrome";
import { plansAudience } from "@/lib/upgrade-prompt";

const FOUNDING_DESCRIPTION =
  "Parents use KidEase for free. Daycares get every tool free during launch. Founding members keep a locked-in discount when paid extras arrive.";

export const Route = createFileRoute("/plans")({
  loader: () => getPlansGate(),
  head: ({ loaderData }) => ({
    meta: [
      { title: "Plans · KidEase" },
      {
        name: "description",
        content: loaderData?.subscriptionsOn
          ? "KidEase is free for parents and daycares across Canada. Optional Parent Plus and centre plans are billed in Canadian dollars."
          : FOUNDING_DESCRIPTION,
      },
    ],
  }),
  component: PlansPage,
});

/**
 * Public plans. While subscriptions are off this is the free founding period,
 * rendered on the server so the page is not an empty nav shell.
 * While subscriptions are on, the existing catalogue stays.
 */
export function PlansPage() {
  const { subscriptionsOn } = Route.useLoaderData();
  const chrome = useRoleChrome();
  return (
    <Shell bare>
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
      <SiteFooter />
    </Shell>
  );
}
