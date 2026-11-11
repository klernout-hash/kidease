import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/gov_/change-requests")({
  beforeLoad: () => {
    throw redirect({ href: "/gov" });
  },
});
