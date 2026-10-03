import { createFileRoute } from "@tanstack/react-router";
import { NeedCareFastView } from "@/routes/need-care-fast";
import { loadNeedCareFast } from "@/lib/server/need-care-fast";
import { pageSeoHead } from "@/lib/page-seo";

function parseSearch(search: Record<string, unknown>) {
  return { q: typeof search.q === "string" ? search.q.trim().slice(0, 80) : "" };
}

export const Route = createFileRoute("/fr/need-care-fast")({
  validateSearch: parseSearch,
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ deps }) => loadNeedCareFast(deps.q),
  head: () =>
    pageSeoHead({
      title: "Besoin de garde vite · KidEase",
      description: "Garderies permises qui ont confirmé une place libre dans les 7 derniers jours, les plus proches d'abord.",
      path: "/fr/need-care-fast",
    }),
  component: FrNeedCareFastPage,
});

function FrNeedCareFastPage() {
  const data = Route.useLoaderData();
  return <NeedCareFastView data={data} />;
}
