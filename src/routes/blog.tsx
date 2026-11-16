import { createFileRoute } from "@tanstack/react-router";
import { BlogIndex } from "@/components/blog-pages";
import { pageSeoHead } from "@/lib/page-seo";

export const Route = createFileRoute("/blog")({
  head: () =>
    pageSeoHead({
      title: "Blog · KidEase",
      description:
        "Short notes on finding licensed daycare in Canada, what to ask on a tour, and how a centre claims its listing.",
      path: "/blog",
    }),
  component: BlogIndex,
});
