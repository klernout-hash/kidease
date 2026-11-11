import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { centreMiniSite } from "@/lib/server/phase5";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/c/$slug")({
  component: CentrePage,
});

function CentrePage() {
  const { slug } = Route.useParams();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [page, setPage] = useState<Awaited<ReturnType<typeof centreMiniSite>> | null>(null);
  useEffect(() => {
    let live = true;
    void centreMiniSite({ data: { slug } })
      .then((next) => {
        if (live) setPage(next);
      })
      .catch(() => {
        if (live) setPage({ open: false });
      });
    return () => {
      live = false;
    };
  }, [slug]);
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8" data-ke="centre-mini-site">
      <p className="text-sm font-semibold text-primary">KidEase</p>
      <h1 className="mt-2 font-display text-3xl">{page && "name" in page && page.name ? page.name : fr ? "Page du centre" : "Centre page"}</h1>
      {!page?.open ? (
        <p className="mt-4 text-base text-muted">
          {fr
            ? "Cette page n'est pas ouverte. KidEase n'approuve pas les centres."
            : "This page is not open. KidEase does not endorse centres."}
        </p>
      ) : (
        <div className="mt-4 space-y-2 text-base">
          {"city" in page && page.city ? <p>{page.city}</p> : null}
          {"hours" in page && page.hours ? <p>{page.hours}</p> : null}
          <p className="text-sm text-muted">
            {fr ? "Les faits viennent de la fiche réclamée. KidEase ne certifie pas ce centre." : "The facts come from the claimed listing. KidEase does not certify this centre."}
          </p>
        </div>
      )}
    </main>
  );
}
