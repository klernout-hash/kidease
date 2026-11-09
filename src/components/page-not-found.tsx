import { Link, Navigate, useRouterState } from "@tanstack/react-router";
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

/** /admissions is not a page. Leave that URL for the desk that holds requests. */
export function AdmissionsForward() {
  const chrome = useRoleChrome();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const french = path === "/fr/admissions" || path.startsWith("/fr/");
  if (chrome.pending) {
    return (
      <p className="ke-gutter mx-auto max-w-lg py-16 text-sm text-muted">
        {french ? "Ouverture de votre bureau…" : "Opening your desk…"}
      </p>
    );
  }
  if (chrome.role === "provider") {
    return <Navigate to={french ? "/fr/provider" : "/provider"} search={{ desk: "requests" }} replace />;
  }
  if (chrome.signedIn) {
    return <Navigate to={french ? "/fr/parent" : "/parent"} search={{ tab: "waitlists" }} replace />;
  }
  return (
    <Navigate
      to={french ? "/fr/login" : "/login"}
      search={{ intent: "in", next: french ? "/fr/admissions" : "/admissions" }}
      replace
    />
  );
}

/** Router defaultNotFoundComponent: ignore TanStack's unused route props. */
export function DefaultNotFound() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  if (path === "/admissions" || path === "/fr/admissions") return <AdmissionsForward />;
  return <PageNotFound />;
}
