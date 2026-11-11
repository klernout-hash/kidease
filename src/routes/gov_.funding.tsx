import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/gov_/funding")({
  beforeLoad: () => {
    throw redirect({ href: "/gov/reports?tab=funding" });
  },
});
