import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { AdminFeatureControls } from "@/components/admin-feature-controls";
import { PayrollPreview } from "@/components/payroll-desk";
import { Shell } from "@/components/shell";
import { sampleControlCards } from "@/lib/admin-feature-registry";
import { isVercelProduction } from "@/lib/features";
import type { PayScreen } from "@/lib/payroll/view";

export const Route = createFileRoute("/preview/feature-controls")({
  validateSearch: (search: Record<string, unknown>) => {
    const screens: PayScreen[] = ["home", "wizard", "jar", "month", "staff", "books"];
    return {
      look: search.look === "dark" ? ("dark" as const) : ("light" as const),
      lang: search.lang === "fr" ? ("fr" as const) : ("en" as const),
      panel: search.panel === "payroll" ? ("payroll" as const) : ("controls" as const),
      screen: screens.includes(search.screen as PayScreen) ? (search.screen as PayScreen) : ("home" as const),
    };
  },
  loader: ({ location }) => {
    const raw = location.search;
    const payroll =
      (raw && typeof raw === "object" && "panel" in raw && raw.panel === "payroll") ||
      String(location.href || "").includes("panel=payroll");
    const open = !isVercelProduction() && (payroll || String(process.env.KIDEASE_FEATURE_CONTROLS_PREVIEW || "") === "1");
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
  const { look, lang, panel, screen } = Route.useSearch();
  useEffect(() => {
    document.documentElement.setAttribute("data-resolved-theme", look);
    document.documentElement.setAttribute("data-theme", look);
    document.documentElement.lang = lang;
  }, [lang, look]);
  return (
    <Shell>
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        {panel === "payroll" ? null : (
          <>
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
          </>
        )}
        {open && panel === "payroll" ? <PayrollPreview locale={lang} screen={screen} /> : null}
        {open && panel !== "payroll" ? (
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
