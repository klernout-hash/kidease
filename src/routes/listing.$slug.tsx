import { createFileRoute, redirect } from "@tanstack/react-router";

/** Soft-404 `/listing/:slug` → canonical `/daycare/:slug`. */
export const Route = createFileRoute("/listing/$slug")({
  beforeLoad: ({ params }) => {
    const slug = String(params.slug || "").trim();
    if (slug) throw redirect({ to: "/daycare/$slug", params: { slug } });
    throw redirect({ to: "/search" });
  },
});
