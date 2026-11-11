import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/gov_/data-requests")({
  beforeLoad: () => {
    throw redirect({ href: "/gov" });
  },
});
