import { Link, useRouterState } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand-mark";
import { EmptyState } from "@/components/empty-state";
import { useRoleChrome } from "@/components/role-chrome";
import { useCopy } from "@/lib/use-copy";

export function PageNotFound({
  title,
  body,
  action,
  actionTo,
}: {
  title?: string;
  body?: string;
  action?: string;
  actionTo?: "/search" | "/parent" | "/provider";
}) {
  const { t } = useCopy();
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="sticky top-0 z-50 border-b border-border bg-bg pt-[env(safe-area-inset-top)]">
        <div className="ke-gutter mx-auto flex min-h-16 max-w-6xl items-center py-2">
          <Link to="/" className="shrink-0" aria-label="KidEase">
            <BrandMark size="sm" />
          </Link>
        </div>
      </header>
      <main className="ke-gutter mx-auto max-w-lg py-16">
        <EmptyState
          title={title ?? t("pageNotFoundTitle")}
          body={body ?? t("pageNotFoundBody")}
          action={action ?? t("notFoundExplore")}
          actionTo={actionTo ?? "/search"}
          secondary={t("notFoundHome")}
          secondaryTo="/"
        />
      </main>
    </div>
  );
}

export function ListingNotFoundPage() {
  const { t } = useCopy();
  return <PageNotFound title={t("listingNotFoundTitle")} body={t("listingNotFoundBody")} />;
}

/** Off-scope `/daycare/city/:slug`: not the Winnipeg search page. */
export function CityHubNotFoundPage() {
  const { t } = useCopy();
  return <PageNotFound title={t("cityHubNotFoundTitle")} body={t("cityHubNotFoundBody")} />;
}

/** /admissions is not a separate page. Send people to the desk that holds requests. */
export function AdmissionsForward() {
  const chrome = useRoleChrome();
  const provider = chrome.role === "provider";
  return (
    <PageNotFound
      title="Requests live on your desk"
      body={
        provider
          ? "Spot requests are on the daycare desk. There is no separate admissions page, and there is no queue number."
          : "Spot requests and waitlists are on your family desk. There is no separate admissions page, and there is no queue number."
      }
      action={provider ? "Open the daycare desk" : "Open your requests"}
      actionTo={provider ? "/provider" : "/parent"}
    />
  );
}

/** Router defaultNotFoundComponent: ignore TanStack's unused route props. */
export function DefaultNotFound() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  if (path === "/admissions" || path === "/fr/admissions") return <AdmissionsForward />;
  return <PageNotFound />;
}
