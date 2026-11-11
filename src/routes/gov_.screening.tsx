import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/gov_/screening")({
  beforeLoad: () => {
    throw redirect({ href: "/gov/reports?tab=screening" });
  },
});
