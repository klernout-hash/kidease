import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/gov_/ratios")({
  beforeLoad: () => {
    throw redirect({ href: "/gov/reports?tab=ratios" });
  },
});
