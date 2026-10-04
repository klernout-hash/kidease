import { createFileRoute } from "@tanstack/react-router";
import { FoundingPlans } from "@/components/founding-plans";
import { OptionalUpgrades } from "@/components/optional-upgrades";
import { Shell } from "@/components/shell";
import { SiteFooter } from "@/components/site-footer";
import { useRoleChrome } from "@/components/role-chrome";
import { headChromeLocale } from "@/lib/head-locale";
import { pageSeoHead, UNPAIRED_FR_SEO } from "@/lib/page-seo";
import { getPlansGate } from "@/lib/server/ui-chrome";
import { plansAudience } from "@/lib/upgrade-prompt";

export const Route = createFileRoute("/plans")({
  loader: () => getPlansGate(),
  head: ({ loaderData, matches }) => {
    const paid = Boolean(loaderData?.subscriptionsOn);
    if (headChromeLocale(matches) === "fr") {
      return pageSeoHead({
        title: UNPAIRED_FR_SEO.plans.title,
        description: paid ? UNPAIRED_FR_SEO.plansPaid.description : UNPAIRED_FR_SEO.plans.description,
        path: "/plans",
        locale: "fr",
      });
    }
    return pageSeoHead({
      title: "Plans · KidEase",
      description: paid
        ? "Search, up to five saved centres, and messages are included. Optional Parent Plus and centre plans are billed in Canadian dollars."
        : "Parents can search, save up to five centres, and message daycares at no charge. Daycares get every tool during the free founding period.",
      path: "/plans",
    });
  },
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
