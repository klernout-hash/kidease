import { createFileRoute } from "@tanstack/react-router";
import { SecurityPage } from "@/components/security-page";
import { pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/security")({
  head: () =>
    pageSeoHead({
      title: "Sécurité · KidEase",
      description: "Comment KidEase traite la connexion et les dossiers d'enfants. KidEase ne revendique aucune certification de sécurité.",
      path: "/fr/security",
    }),
  component: () => <SecurityPage locale="fr" />,
});
