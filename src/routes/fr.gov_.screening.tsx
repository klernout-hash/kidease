import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/fr/gov_/screening")({
  beforeLoad: () => {
    throw redirect({ href: "/fr/gov/reports?tab=screening" });
  },
});
