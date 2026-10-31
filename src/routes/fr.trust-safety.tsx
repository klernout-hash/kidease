import { createFileRoute } from "@tanstack/react-router";
import { TrustSafetyPage } from "@/routes/trust-safety";
import { pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/trust-safety")({
  head: () =>
    pageSeoHead({
      title: "Confiance et sécurité · KidEase",
      description: "Comment KidEase vérifie les fiches permises et traite un signalement en 24 heures.",
      path: "/fr/trust-safety",
      locale: "fr",
    }),
  component: TrustSafetyPage,
});
