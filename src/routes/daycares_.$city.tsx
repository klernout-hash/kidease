import { createFileRoute, redirect } from "@tanstack/react-router";

/** Dead `/daycares/:city` hub → working search for that city. */
export const Route = createFileRoute("/daycares/$city")({
  beforeLoad: ({ params }) => {
    const city = String(params.city || "").trim();
    throw redirect({
      to: "/search",
      search: city ? { q: city.replace(/-/g, " ") } : undefined,
    });
  },
});
