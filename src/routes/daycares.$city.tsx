import { createFileRoute, redirect } from "@tanstack/react-router";
import { cityHubDefBySlug } from "@/lib/city-hubs";

export const Route = createFileRoute("/daycares/$city")({
  beforeLoad: ({ params }) => {
    const slug = (params.city || "").trim().toLowerCase();
    if (cityHubDefBySlug(slug)) {
      throw redirect({ to: "/daycare/city/$city", params: { city: slug } });
    }
    throw redirect({ to: "/search", search: slug ? { q: slug } : {} });
  },
});
