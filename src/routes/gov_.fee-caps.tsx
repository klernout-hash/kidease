import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/gov_/fee-caps")({
  beforeLoad: () => {
    throw redirect({ href: "/gov/analytics" });
  },
});
