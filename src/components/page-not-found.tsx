import { Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand-mark";
import { EmptyState } from "@/components/empty-state";
import { useCopy } from "@/lib/use-copy";

export function PageNotFound({
  title,
  body,
}: {
  title?: string;
  body?: string;
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
          action={t("notFoundExplore")}
          actionTo="/search"
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

/** Router defaultNotFoundComponent — ignore TanStack's unused route props. */
export function DefaultNotFound() {
  return <PageNotFound />;
}
