import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/gov_/complaint-updates")({
  beforeLoad: () => {
    throw redirect({ href: "/gov" });
  },
});
