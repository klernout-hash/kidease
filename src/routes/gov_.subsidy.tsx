import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/gov_/subsidy")({
  beforeLoad: () => {
    throw redirect({ href: "/gov" });
  },
});
