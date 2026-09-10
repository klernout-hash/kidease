import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/listing/$slug")({
  beforeLoad: ({ params }) => {
    const slug = (params.slug || "").trim();
    if (!slug) throw redirect({ to: "/search" });
    throw redirect({ to: "/daycare/$slug", params: { slug } });
  },
});
