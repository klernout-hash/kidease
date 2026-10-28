import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { ProviderPioneerDesk } from "@/components/provider-pioneer-desk";
import { localePath } from "@/lib/locale-path";
import { pageSeoHead, withNoindex } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";

export function dashboardHead(locale: "en" | "fr") {
  return withNoindex(
    pageSeoHead({
      title: locale === "fr" ? "Bureau du centre · KidEase" : "Centre desk · KidEase",
      description:
        locale === "fr"
          ? "Places, visites et liste d'attente. Les locaux, le personnel et les reçus sont des onglets à part."
          : "Open spots, tours, and the waitlist. Classrooms, staff, and receipts stay on their own tabs.",
      path: locale === "fr" ? "/fr/dashboard" : "/dashboard",
      locale,
    }),
  );
}

export function DashboardPage() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-3xl py-8">
        <p className="text-sm font-semibold text-primary">{fr ? "Centre" : "Centre"}</p>
        <h1 className="mt-2 font-display text-3xl md:text-5xl">{fr ? "Remplir les places" : "Fill open spots"}</h1>
        <p className="mt-3 text-muted">
          {fr
            ? "Publiez une place en quelques secondes. Le reste du bureau est dans les onglets."
            : "Post a spot in a few seconds. The rest of the desk is in the tabs."}
        </p>
        <div className="mt-6">
          <ProviderPioneerDesk />
        </div>
        <p className="mt-6 text-sm">
          <Link to={localePath("/provider", locale)} className="font-semibold text-primary underline-offset-4 hover:underline">
            {fr ? "Ouvrir le bureau complet" : "Open the full centre desk"}
          </Link>
        </p>
      </main>
    </Shell>
  );
}

export const Route = createFileRoute("/dashboard")({
  head: () => dashboardHead("en"),
  component: DashboardPage,
});
