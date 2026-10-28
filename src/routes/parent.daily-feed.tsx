import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Shell } from "@/components/shell";
import { useRoleChrome } from "@/components/role-chrome";
import { localePath } from "@/lib/locale-path";
import { pageSeoHead, withNoindex } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";

const DailyCareDesk = lazy(() => import("@/components/daily-care-desk").then((m) => ({ default: m.DailyCareDesk })));

export function dailyFeedHead(locale: "en" | "fr") {
  return withNoindex(
    pageSeoHead({
      title: locale === "fr" ? "Journal de la journée · KidEase" : "Daily classroom feed · KidEase",
      description:
        locale === "fr"
          ? "Réservé aux parents inscrits. Les photos de classe ne sont pas publiques."
          : "For enrolled parents only. Classroom photos are not public.",
      path: locale === "fr" ? "/fr/parent/daily-feed" : "/parent/daily-feed",
      locale,
    }),
  );
}

export function DailyFeedPage() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const chrome = useRoleChrome();
  const parent = chrome.signedIn && chrome.role === "parent" && !chrome.guestView;

  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-3xl py-8">
        <p className="text-sm font-semibold text-primary">{fr ? "Parents" : "Parents"}</p>
        <h1 className="mt-2 font-display text-3xl">{fr ? "La journée de votre enfant" : "Your child's day"}</h1>
        <p className="mt-3 text-muted">
          {fr
            ? "Repas, siestes et notes du local. Visible seulement pour un parent connecté."
            : "Meals, naps, and room notes. Only a signed-in parent can see this."}
        </p>
        {parent ? (
          <div className="mt-6">
            <Suspense fallback={<p className="text-sm text-muted">{fr ? "Chargement du journal." : "Loading the feed."}</p>}>
              <DailyCareDesk role="parent" />
            </Suspense>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
            <p className="text-sm text-muted">
              {fr ? "Connectez-vous avec le compte parent lié à l'inscription." : "Sign in with the parent account tied to enrolment."}
            </p>
            <Link
              to={localePath("/login", locale)}
              search={{ next: localePath("/parent/daily-feed", locale), role: "parent", desk: "parent", intent: "in" }}
              className="mt-3 inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg"
            >
              {fr ? "Se connecter" : "Sign in"}
            </Link>
          </div>
        )}
      </main>
    </Shell>
  );
}

export const Route = createFileRoute("/parent/daily-feed")({
  head: () => dailyFeedHead("en"),
  component: DailyFeedPage,
});
