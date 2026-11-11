import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/gov_/inspection-sync")({
  beforeLoad: () => {
    throw redirect({ href: "/gov" });
  },
});
