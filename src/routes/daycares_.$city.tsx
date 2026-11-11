import { createFileRoute, redirect } from "@tanstack/react-router";
import { titleCaseCitySlug } from "@/lib/explore-search";

/** Dead `/daycares/:city` hub → working search for that city. */
export const Route = createFileRoute("/daycares_/$city")({
  beforeLoad: ({ params }) => {
    const label = titleCaseCitySlug(String(params.city || ""));
    throw redirect({
      to: "/search",
      search: label ? { q: label } : undefined,
    });
  },
});
