import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/gov_/demand")({
  beforeLoad: () => {
    throw redirect({ href: "/gov/analytics" });
  },
});
