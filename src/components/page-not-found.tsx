import { Link } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand-mark";
import { EmptyState } from "@/components/empty-state";

export function PageNotFound({
  title = "Page not found",
  body = "This page is not on KidEase, or the link is out of date.",
}: {
  title?: string;
  body?: string;
}) {
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
        <EmptyState title={title} body={body} action="Explore" actionTo="/search" secondary="Home" secondaryTo="/" />
      </main>
    </div>
  );
}

export function ListingNotFoundPage() {
  return (
    <PageNotFound
      title="Listing not found"
      body="This centre is not on KidEase, or the link is out of date."
    />
  );
}

/** Router defaultNotFoundComponent — ignore TanStack's unused route props. */
export function DefaultNotFound() {
  return <PageNotFound />;
}
