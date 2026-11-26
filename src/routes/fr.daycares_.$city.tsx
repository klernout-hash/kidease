import { createFileRoute, redirect } from "@tanstack/react-router";
import { legacyDaycaresCityTarget } from "@/lib/daycares-legacy-path";

/** Ancien lien `/fr/daycares/:ville` → page de la ville, sinon recherche en français. */
export const Route = createFileRoute("/fr/daycares_/$city")({
  beforeLoad: ({ params }) => {
    const target = legacyDaycaresCityTarget(String(params.city || ""), "fr");
    if (target.hub) throw redirect({ to: "/fr/daycare/city/$city", params: { city: target.slug }, statusCode: 301 });
    throw redirect({ to: "/fr/search", search: target.q ? { q: target.q } : undefined });
  },
});
