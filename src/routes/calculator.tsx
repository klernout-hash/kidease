import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { NetCostCalculator } from "@/components/net-cost-calculator";
import { localePath } from "@/lib/locale-path";
import { pageSeoHead } from "@/lib/page-seo";
import { useCopy } from "@/lib/use-copy";

export function calculatorHead(locale: "en" | "fr") {
  return pageSeoHead({
    title: locale === "fr" ? "Calculateur de coût net · KidEase" : "Net cost calculator · KidEase",
    description:
      locale === "fr"
        ? "Estimez le coût de garde après les programmes provinciaux, l'ACE et le formulaire T778. Entrez le tarif affiché par le centre."
        : "Estimate child care cost after provincial programs, the CCB, and Form T778. Enter the fee the centre posts.",
    path: locale === "fr" ? "/fr/calculator" : "/calculator",
    locale,
  });
}

export function CalculatorPage() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-3xl py-8">
        <p className="text-sm font-semibold text-primary">KidEase</p>
        <h1 className="mt-2 font-display text-3xl md:text-5xl">{fr ? "Combien coûte la garde?" : "What will care cost?"}</h1>
        <p className="mt-3 text-muted">
          {fr
            ? "Un estimé pour les 13 provinces et territoires. Le prochain pas : chercher un centre permis."
            : "An estimate for all 13 provinces and territories. The next step is to search licensed care."}
        </p>
        <div className="mt-6">
          <NetCostCalculator showPageLink={false} />
        </div>
        <p className="mt-6">
          <Link to={localePath("/search", locale)} className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
            {fr ? "Chercher une garderie" : "Search daycare"}
          </Link>
        </p>
      </main>
    </Shell>
  );
}

export const Route = createFileRoute("/calculator")({
  head: () => calculatorHead("en"),
  component: CalculatorPage,
});
