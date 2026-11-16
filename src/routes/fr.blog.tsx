import { createFileRoute } from "@tanstack/react-router";
import { BlogIndex } from "@/components/blog-pages";
import { pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/fr/blog")({
  head: () =>
    pageSeoHead({
      title: "Blogue · KidEase",
      description:
        "Notes courtes pour trouver une garderie autorisée au Canada, quoi demander en visite, et comment un centre revendique sa fiche.",
      path: "/fr/blog",
    }),
  component: BlogIndex,
});
