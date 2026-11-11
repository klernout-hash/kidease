import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/fr/gov_/fee-caps")({
  beforeLoad: () => {
    throw redirect({ href: "/fr/gov/analytics" });
  },
});
