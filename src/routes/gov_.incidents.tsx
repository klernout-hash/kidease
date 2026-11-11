import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/gov_/incidents")({
  beforeLoad: () => {
    throw redirect({ href: "/gov/reports?tab=incidents" });
  },
});
