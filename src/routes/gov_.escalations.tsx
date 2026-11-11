import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/gov_/escalations")({
  beforeLoad: () => {
    throw redirect({ href: "/gov" });
  },
});
