import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { AdminFeatureControls } from "@/components/admin-feature-controls";
import { Shell } from "@/components/shell";
import { sampleControlCards } from "@/lib/admin-feature-registry";
import { isVercelProduction } from "@/lib/features";

export const Route = createFileRoute("/preview/feature-controls")({
  validateSearch: (search: Record<string, unknown>) => ({
    look: search.look === "dark" ? ("dark" as const) : ("light" as const),
    lang: search.lang === "fr" ? ("fr" as const) : ("en" as const),
  }),
  loader: () => {
    const open = !isVercelProduction() && String(process.env.KIDEASE_FEATURE_CONTROLS_PREVIEW || "") === "1";
    if (!open) throw notFound();
    return { open };
  },
  head: () => ({
    meta: [
      { title: "Feature controls preview · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PreviewPage,
});

function PreviewPage() {
  const { open } = Route.useLoaderData();
  const { look, lang } = Route.useSearch();
  useEffect(() => {
    document.documentElement.setAttribute("data-resolved-theme", look);
    document.documentElement.setAttribute("data-theme", look);
    document.documentElement.lang = lang;
  }, [lang, look]);
  return (
    <Shell>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <h1 className="font-display text-[clamp(1.75rem,4vw,2.25rem)]">{lang === "fr" ? "Fonctions" : "Features"}</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          {open
            ? lang === "fr"
              ? "Échantillon. Rien n'est enregistré."
              : "Sample. Nothing is saved."
            : lang === "fr"
              ? "Cet aperçu est fermé."
              : "This preview is closed."}
        </p>
        {open ? (
          <AdminFeatureControls
            locale={lang}
            controls={sampleControlCards()}
            busy={false}
            onSave={() => undefined}
          />
        ) : null}
        <p className="mt-6">
          <Link to="/" className="inline-flex min-h-11 items-center text-sm font-medium text-primary">
            {lang === "fr" ? "Accueil" : "Home"}
          </Link>
        </p>
      </main>
    </Shell>
  );
}
