import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/fr/gov_/incidents")({
  beforeLoad: () => {
    throw redirect({ href: "/fr/gov/reports?tab=incidents" });
  },
});
