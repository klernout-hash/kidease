import { createFileRoute, redirect } from "@tanstack/react-router";
import { legacyDaycaresCityTarget } from "@/lib/daycares-legacy-path";

/** Old `/daycares/:city` → the city page (`/daycare/city/:slug`), else search for that city. */
export const Route = createFileRoute("/daycares_/$city")({
  beforeLoad: ({ params }) => {
    const target = legacyDaycaresCityTarget(String(params.city || ""), "en");
    if (target.hub) throw redirect({ to: "/daycare/city/$city", params: { city: target.slug }, statusCode: 301 });
    throw redirect({ to: "/search", search: target.q ? { q: target.q } : undefined });
  },
});
