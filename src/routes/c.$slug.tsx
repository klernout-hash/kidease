import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { centreMiniSite } from "@/lib/server/phase5";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/c/$slug")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: CentrePage,
});

type MiniSite = Awaited<ReturnType<typeof centreMiniSite>>;

/** B04: this page rendered a bare stub. Keep the site chrome, the facts, and real next steps. */
function CentrePage() {
  const { slug } = Route.useParams();
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [page, setPage] = useState<MiniSite | null>(null);
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
  const open = page?.open ? page : null;
  const name = open ? (fr && open.nameFr ? open.nameFr : open.name) : fr ? "Page du centre" : "Centre page";
  const hours = open ? (fr && open.hoursFr ? open.hoursFr : open.hours) : "";
  const about = open ? (fr && open.descriptionFr ? open.descriptionFr : open.description) : "";
  const listingTo = fr ? "/fr/daycare/$slug" : "/daycare/$slug";
  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-3xl py-8" data-ke="centre-mini-site">
        <p className="text-sm font-semibold text-primary">KidEase</p>
        <h1 className="mt-2 font-display text-3xl">{name}</h1>
        {!page ? (
          <div className="mt-4 space-y-2" aria-hidden="true">
            <div className="ke-skel h-5 w-48 rounded" />
            <div className="ke-skel h-20 w-full rounded-xl" />
          </div>
        ) : !open ? (
          <div className="mt-4 space-y-3">
            <p className="text-base text-muted">
              {fr
                ? "Cette page n’est pas ouverte. KidEase n’approuve pas les centres."
                : "This page is not open. KidEase does not endorse centres."}
            </p>
            <Link to={fr ? "/fr/search" : "/search"} className="inline-flex min-h-11 items-center font-medium text-primary">
              {fr ? "Chercher une garderie" : "Search for child care"}
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-4 text-base">
            <dl className="grid gap-3 sm:grid-cols-2">
              {open.city ? (
                <div>
                  <dt className="text-sm text-muted">{fr ? "Ville" : "City"}</dt>
                  <dd className="font-medium">{[open.city, open.province].filter(Boolean).join(", ")}</dd>
                </div>
              ) : null}
              {hours ? (
                <div>
                  <dt className="text-sm text-muted">{fr ? "Heures" : "Hours"}</dt>
                  <dd className="font-medium">{hours}</dd>
                </div>
              ) : null}
            </dl>
            {about ? <p className="max-w-prose whitespace-pre-line text-muted">{about}</p> : null}
            <div className="flex flex-wrap gap-2" data-ke="centre-mini-site-actions">
              <Link
                to={listingTo}
                params={{ slug: open.slug }}
                className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg"
              >
                {fr ? "Voir la fiche complète" : "See the full listing"}
              </Link>
              <Link
                to={listingTo}
                params={{ slug: open.slug }}
                search={{ ask: "tour" }}
                className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ring-1 ring-border"
              >
                {fr ? "Demander une visite" : "Request a tour"}
              </Link>
              <Link
                to={listingTo}
                params={{ slug: open.slug }}
                search={{ ask: "waitlist" }}
                className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ring-1 ring-border"
              >
                {fr ? "Liste d’attente" : "Join the waitlist"}
              </Link>
            </div>
            <p className="text-sm text-muted">
              {fr
                ? "Les faits viennent de la fiche réclamée. KidEase ne certifie pas ce centre."
                : "The facts come from the claimed listing. KidEase does not certify this centre."}
            </p>
          </div>
        )}
      </main>
    </Shell>
  );
}
