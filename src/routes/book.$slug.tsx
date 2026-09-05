import { createFileRoute, redirect } from "@tanstack/react-router";

/** Booking lives on the listing page (Request a spot). Keep the old URL as a redirect. */
export const Route = createFileRoute("/book/$slug")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/daycare/$slug", params: { slug: params.slug } });
  },
});
