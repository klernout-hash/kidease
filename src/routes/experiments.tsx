import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { EXPERIMENTS, experimentsEnabled, signupHeadline } from "@/lib/experiments";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/experiments")({
  head: () => ({
    meta: [
      { title: "Experiments · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ExperimentsPage,
});

function ExperimentsPage() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const on = experimentsEnabled();
  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-lg py-12">
        <p className="text-sm font-semibold text-primary">KidEase</p>
        <h1 className="mt-2 font-display text-3xl">{fr ? "Essais" : "Experiments"}</h1>
        <p className="mt-4 text-muted">
          {fr
            ? "Deux essais : le titre d’inscription et l’ordre de recherche. Ils sont éteints tant que Kyle ne les ouvre pas."
            : "Two tests: the signup headline and the search order. They stay off until Kyle turns them on."}
        </p>
        <p className="mt-4 text-sm" role="status">
          {on ? (fr ? "Les essais sont ouverts." : "Experiments are on.") : fr ? "Les essais sont éteints." : "Experiments are off."}
        </p>
        <ul className="mt-4 list-disc pl-5 text-sm">
          <li>{EXPERIMENTS.signupHeadline}</li>
          <li>{EXPERIMENTS.searchOrder}</li>
        </ul>
        {on ? <p className="mt-4 text-sm">{signupHeadline("treatment", fr ? "fr" : "en")}</p> : null}
        <p className="mt-8">
          <Link to="/search" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
            {fr ? "Chercher une garderie" : "Search daycare"}
          </Link>
        </p>
      </main>
    </Shell>
  );
}
