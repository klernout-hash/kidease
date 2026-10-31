import { createFileRoute } from "@tanstack/react-router";
import { HelpArticlesPage } from "@/routes/help.articles";

export const Route = createFileRoute("/fr/help/articles")({
  head: () => ({
    meta: [
      { title: "Centre d’aide · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: HelpArticlesPage,
});
