import { createFileRoute } from "@tanstack/react-router";
import { pageSeoHead } from "@/lib/page-seo";
import { GuidesIndex } from "@/routes/guides";

export const Route = createFileRoute("/fr/guides")({
  head: ({ matches }) => {
    const leaf = matches[matches.length - 1]?.routeId;
    if (leaf && leaf !== "/fr/guides") return { meta: [] };
    return pageSeoHead({
      title: "Guides provinciaux de garde · KidEase",
      description: "Liens officiels pour les frais, les subventions, les listes d'attente et les permis.",
      path: "/fr/guides",
    });
  },
  component: GuidesIndex,
});
