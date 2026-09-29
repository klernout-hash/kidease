import { createFileRoute } from "@tanstack/react-router";
import { HowItWorksPage } from "@/routes/how-it-works";
import { pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/how-it-works")({
  head: () =>
    pageSeoHead({
      title: "Comment ça fonctionne · KidEase",
      description: "Cherchez une garderie permise, comparez, puis écrivez au centre. Trois étapes sur KidEase.",
      path: "/fr/how-it-works",
    }),
  component: HowItWorksPage,
});
